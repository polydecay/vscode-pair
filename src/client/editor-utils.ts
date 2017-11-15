import { window, TextEditor, Position, Range, DecorationOptions } from 'vscode';
import * as jsdiff from 'diff';
import diffMatchPatch from "../shared/diffMatchPatch";
import User from './client-user';

export async function patchTextEditor(editor: TextEditor, patches: any[]) {
	if (!patches.length) {
		return;
	}

	return await editor.edit((editBuilder) => {
		const { document } = editor;
		if (document.isClosed) {
			return;
		}

		// TODO: Look in to porting the DiffMatchPatch algorithem, and use the patch directly.
		const text = document.getText();
		const [newText, results] = diffMatchPatch.patch_apply(patches, text);
		const jsDiffPatches = jsdiff.diffChars(text, newText);

		let index = 0;
		for (const patch of jsDiffPatches) {
			if (patch.count === undefined) {
				continue;
			}

			if (patch.added) {
				editBuilder.insert(document.positionAt(index), patch.value);
			} else if (patch.removed) {
				editBuilder.delete(new Range(
					document.positionAt(index),
					document.positionAt(index + patch.count),
				));
				index += patch.count;
			} else {
				index += patch.count;
			}
		}
	});
}

export function renderUserSelection(editor: TextEditor, user: User, selections: any[]) {
	const selectionRanges: DecorationOptions[] = selections.map((selection) => {
		const [sLine, sChar, eLine, eChar] = selection;
		return {
			hoverMessage: 'User: ' + user.username,
			range: new Range(sLine, sChar, eLine, eChar),
		};
	});

	editor.setDecorations(user.selectionDecoration, selectionRanges);
}
