import { window, workspace, TextEditorDecorationType, DecorationRangeBehavior } from 'vscode';

export default class ClientUser {
	readonly id: string;
	username: string;

	selections: Map<string, number[]> = new Map();
	selectionDecoration: TextEditorDecorationType;

	constructor(id: string) {
		this.id = id;
		this.username = id;

		const bg = workspace.getConfiguration('vscodePair').get('selectionColor', 'rgba(192, 64, 255, 0.25)');
		this.selectionDecoration = window.createTextEditorDecorationType({
			backgroundColor: bg,
			rangeBehavior: DecorationRangeBehavior.ClosedOpen,
		});
	}

	dispose() {
		this.selectionDecoration.dispose();
	}
}
