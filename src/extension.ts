import { window, workspace, commands, ExtensionContext, StatusBarItem } from 'vscode';
import Client from './client/client';
import Server from './server/server';

let client: Client|null = null;
let server: Server|null = null;

async function startClient() {
	stopClientAndServer();

	if (!workspace.workspaceFolders) {
		return window.showErrorMessage(
			'You need to open a workspace folder before starting the client.',
		);
	} else if (workspace.workspaceFolders.length > 1) {
		return window.showErrorMessage(
			'VSCode-Pair currently doesn\'t support multiple workspaces.',
		);
	}

	let address = await window.showInputBox({
		placeHolder: 'Enter addresss (e.g. 127.0.0.1:8844)',
		value: 'localhost:8844', // TODO: Remove default value.
	});

	if (!address) {
		return;
	}

	const workspacePath = workspace.workspaceFolders[0].uri.fsPath;
	client = new Client(`http://${address}`, workspacePath);
}

async function startServer() {
	stopClientAndServer();

	if (!workspace.workspaceFolders) {
		return window.showErrorMessage(
			'You need to open a workspace folder before starting the server.',
		);
	} else if (workspace.workspaceFolders.length > 1) {
		return window.showErrorMessage(
			'VSCode-Pair currently doesn\'t support multiple workspaces.',
		);
	}

	const workspacePath = workspace.workspaceFolders[0].uri.fsPath;
	const port = workspace.getConfiguration('vscodePair.server').get('port', 8844);

	server = new Server(port, workspacePath);
	client = new Client(`http://localhost:${port}`, workspacePath);
}

function stopClientAndServer() {
	client && client.dispose();
	server && server.dispose();
}

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand('vscodePair.connect', startClient),
		commands.registerCommand('vscodePair.disconnect', stopClientAndServer),
		commands.registerCommand('vscodePair.startServer', startServer),
		commands.registerCommand('vscodePair.stopServer', stopClientAndServer),

		workspace.onDidChangeWorkspaceFolders(() => {
			stopClientAndServer();
		}),
	);
}

export function deactivate() {
	stopClientAndServer();
}
