import * as SocketIO from 'socket.io';
import Document  from '../shared/document';
import DocumentPatch from '../shared/document-patch';
import User from './server-user';

export default class Server {
	private readonly workspacePath: string;
	private server: SocketIO.Server;

	private users: Map<string, User> = new Map();
	private documents: Map<string, Document> = new Map();

	constructor(port: number, workspacePath: string) {
		this.workspacePath = workspacePath;
		this.server = SocketIO(port, { transports: ['websocket'] });

		this.server.on('connection', this.onConnection.bind(this));
	}

	private onConnection(socket: SocketIO.Socket) {
		console.log(`${socket.id} connected`);
		const user = new User(socket.id);
		this.users.set(user.id, user);

		this.users.forEach((user) => {
			if (user.id !==  socket.id) {
				socket.emit('user', user.toRequestObject());
			}
		});

		socket.on('disconnect', () => {
			console.log(`${socket.id} disconnected`);
			this.users.delete(user.id);
			socket.broadcast.emit('remove-user', user.id);
		});

		socket.on('username', (username) => {
			user.username = username;
			socket.broadcast.emit('user', user.toRequestObject());
		});

		socket.on('open', ({ id, text }, callback) => {
			const shadow = new Document(id, text);
			user.shadows.set(id, shadow);

			const document = this.documents.get(id);
			if (document) {
				const patch = shadow.createPatch(document.text);
				shadow.text = document.text;
				return callback(patch);
			} else {
				this.documents.set(id, new Document(id, text));
				return callback(new DocumentPatch(id, shadow.hash, []));
			}
		});

		socket.on('close', (id) => {
			this.documents.delete(id);
			this.cleanupUnusedDocuments();
		});

		socket.on('patch', (patch, callback) => {
			const document = this.documents.get(patch.id);
			const shadow = user.shadows.get(patch.id);

			if (!document || !shadow) {
				return callback({ error: 'invalid document id'});
			}

			// Patch the user shadow.
			if (!shadow.applyPatch(patch)) {
				console.log(`${shadow.id} patch failed`);
				return callback({ error: 'patch failed' });
			}

			// Patch the server document.
			document.applyPatchSkipVerify(patch);

			if (shadow.hash === document.hash) {
				callback(new DocumentPatch(shadow.id, shadow.hash, []));
			} else {
				const responsePatch = shadow.createPatch(document.text);
				shadow.text = document.text;
				callback(responsePatch);
			}
		});

		socket.on('selection', ({ id, selections }) => {
			user.selections.set(id, selections);
			socket.broadcast.emit('user', user.toRequestObject());
		});

		socket.on('save', (document) => {
			socket.broadcast.emit('save', document);
		});
	}

	private cleanupUnusedDocuments() {
		const openDocuments: Set<string> = new Set();
		this.users.forEach((u) => u.shadows.forEach(s => openDocuments.add(s.id)));

		for (const id of this.documents.keys()) {
			if (!openDocuments.has(id)) {
				this.documents.delete(id);
			}
		}
	}

	dispose() {
		this.server.close();
	}
}
