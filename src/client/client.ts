import {
	window,
	workspace,
	Uri,
	TextEditor,
	TextDocument,
	TextDocumentChangeEvent,
	TextEditorSelectionChangeEvent,
	TextEditorDecorationType,
	DecorationRangeBehavior,
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as SocketIOClient from 'socket.io-client';
import { throttle } from "lodash";
import DocumentPatch from '../shared/document-patch';
import ClientDocument from './client-document';
import User from './client-user';
import { patchTextEditor, renderUserSelection } from './editor-utils';

export default class Client {
	private readonly workspacePath: string;
	private socket: SocketIOClient.Socket;
	private subscription: { dispose(): void }[] = [];
	private updateInterval: NodeJS.Timer;

	private users: Map<string, User> = new Map();
	private shadows: Map<string, ClientDocument> = new Map();

	constructor(address: string, workspacePath: string) {
		this.socket = SocketIOClient(address, { transports: ['websocket'] });
		this.workspacePath = workspacePath;

		this.socket.on('connect', () => {
			const username = workspace.getConfiguration('vscodePair').get('username');
			if (username) {
				this.socket.emit('username', username);
			}

			this.onDidChangeVisibleTextEditors(window.visibleTextEditors);
		});

		this.socket.on('disconnect', () => {
			this.users.forEach(u => u.dispose());
			this.users.clear();
			this.shadows.clear();
		});

		this.socket.on('user', (reqUser: any) => {
			let user = this.users.get(reqUser.id);
			if (!user) {
				user = new User(reqUser.id);
				this.users.set(user.id, user);
			}

			user.username = reqUser.username;
			user.selections = new Map(Object.entries(reqUser.selections));

			this.renderUserSelections(user);
		});

		this.socket.on('remove-user', (id: string) => {
			const user = this.users.get(id);
			if (user) {
				this.users.delete(id);
				user.dispose();
			}
		});

		this.socket.on('save', async ({ id, text }: any) => {
			const filePath = path.join(this.workspacePath, path.normalize(id));
			try {
				await fs.ensureDir(path.dirname(filePath));
				await fs.writeFile(filePath, text, { encoding: 'utf-8' });
			} catch (err) {
				window.showErrorMessage(`VSCode-Pair: Failed to write file "${filePath}"`);
			}
		});

		this.updateInterval = setInterval(
			this.onUpdate.bind(this),
			workspace.getConfiguration('vscodePair').get('updateInterval', 650),
		);

		this.subscription.push(
			window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors.bind(this)),
			window.onDidChangeTextEditorSelection(
				throttle(this.onDidChangeTextEditorSelection.bind(this), 250, { leading: false })
			),
			workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
			workspace.onDidSaveTextDocument(this.onDidSaveTextDocument.bind(this)),
		);
	}

	// -----------------------------------------------
	// Events

	private onUpdate() {
		if (this.socket.connected) {
			this.shadows.forEach(s => this.patchDocument(s));
		}
	}

	private onDidChangeVisibleTextEditors(editors: TextEditor[]) {
		const documents: Map<string, TextDocument> = new Map();
		for (const editor of editors) {
			const id = this.uriToDocumentId(editor.document.uri);
			documents.set(id, editor.document);
		}

		// Close old documents.
		for (const id of this.shadows.keys()) {
			if (!documents.has(id)) {
				this.closeDocument(id);
			}
		}

		// Open new documents.
		for (const [id, document] of documents) {
			if (!this.shadows.has(id)) {
				const shadow = new ClientDocument(id, document.getText());
				this.openDocument(shadow);
			}
		}
	}

	private onDidChangeTextEditorSelection(event: TextEditorSelectionChangeEvent) {
		if (this.isUriInWorkspace(event.textEditor.document.uri)) {
			const id = this.uriToDocumentId(event.textEditor.document.uri);
			const selections = event.selections.map(({ start, end }) => {
				return [start.line, start.character, end.line, end.character];
			});

			this.socket.emit('selection', { id, selections });
		}
	}

	private onDidChangeTextDocument(event: TextDocumentChangeEvent) {
		if (this.isUriInWorkspace(event.document.uri)) {
			const shadow = this.shadows.get(this.uriToDocumentId(event.document.uri));
			if (shadow && !shadow.isDirty) {
				shadow.isDirty = true;
			}
		}
	}

	private onDidSaveTextDocument(document: TextDocument) {
		if (this.isUriInWorkspace(document.uri)) {
			const id = this.uriToDocumentId(document.uri);
			const text = document.getText();
			this.socket.emit('save', { id, text });
		}
	}

	// -----------------------------------------------
	// Methods

	private openDocument(shadow: ClientDocument) {
		if (this.shadows.has(shadow.id)) {
			this.closeDocument(shadow.id);
		}

		shadow.isInitialized = false;
		this.shadows.set(shadow.id, shadow);

		shadow.isPatching = true;
		this.socket.emit('open', { id: shadow.id, text: shadow.text }, async (patch: any) => {
			if (this.shadows.get(shadow.id) !== shadow) {
				console.log(`${shadow.id} was closed before it could open`);
				return;
			}

			await this.applyDocumentPatch(shadow, patch);
			shadow.isInitialized = true;
		});
	}

	private closeDocument(id: string) {
		this.shadows.delete(id);
		this.socket.emit('close', id);
	}

	private patchDocument(shadow: ClientDocument) {
		if (!shadow.isInitialized || shadow.isPatching) {
			return;
		}

		const editor = this.getTextEditorById(shadow.id);
		if (!editor) {
			return this.closeDocument(shadow.id);
		}

		let patch: DocumentPatch;
		if (shadow.isDirty) {
			const text = editor.document.getText();
			patch = shadow.createPatch(text);
			shadow.text = text;
			shadow.isDirty = false;
		} else {
			patch = new DocumentPatch(shadow.id, shadow.hash, []);
		}

		shadow.isPatching = true;
		this.socket.emit('patch', patch, async (patch: any) => {
			if (this.shadows.get(shadow.id) !== shadow) {
				return console.log(`${shadow.id} was closed before it could patch`);
			}

			if (patch.error) {
				return this.openDocument(shadow);
			}

			await this.applyDocumentPatch(shadow, patch);
		});
	}


	private async applyDocumentPatch(shadow: ClientDocument, patch: DocumentPatch) {
		if (!shadow.applyPatch(patch)) {
			console.log(`${shadow.id} patch failed`);
			return this.openDocument(shadow);
		}

		await this.applyEditorPatch(shadow.id, patch);
		shadow.isPatching = false;
	}

	private async applyEditorPatch(id: string, patch: DocumentPatch) {
		const editor = this.getTextEditorById(id);
		if (!editor) {
			return;
		}

		try {
			await patchTextEditor(editor, patch.patches);
		} catch (err) {
			console.log(`${id} text editor patch failed`, err);
		}
	}

	private renderUserSelections(user: User) {
		for (const [id, selection] of user.selections) {
			const editor = this.getTextEditorById(id);
			if (editor) {
				renderUserSelection(editor, user, selection);
			}
		}
	}

	// -----------------------------------------------
	// Helpers

	private getTextEditorById(id: string): TextEditor|undefined {
		return window.visibleTextEditors.find((editor) => {
			return this.uriToDocumentId(editor.document.uri) === id;
		});
	}

	private uriToDocumentId(uri: Uri): string {
		let id = uri.fsPath.replace(this.workspacePath, '');
		id = id.replace(/\\/g, '/').replace(/^\//, '');
		return id;
	}

	private isUriInWorkspace(uri: Uri): boolean {
		return uri.scheme === 'file' && uri.fsPath.startsWith(this.workspacePath);
	}

	dispose() {
		this.socket.close();
		this.users.forEach(u => u.dispose());
		this.subscription.forEach(s => s.dispose());
		clearInterval(this.updateInterval);
	}
}
