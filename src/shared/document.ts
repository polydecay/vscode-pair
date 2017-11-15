import { crc32 } from 'crc';
import diffMatchPatch from './diffMatchPatch';
import DocumentPatch from './document-patch';

// TODO: Rename Document because of name conflict.
export default class Document {
	readonly id: string
	private _text: string;
	private _hash: string|null = null;

	constructor(id: string, text: string) {
		this.id = id;
		this.text = text;
	}

	get text(): string {
		return this._text;
	}

	set text(text: string) {
		this._text = text;
		this._hash = null;
	}

	get hash(): string {
		if (!this._hash) {
			this._hash = crc32(this.text).toString(16);
		}

		return this._hash;
	}

	createPatch(textTarget: string): DocumentPatch {
		const patches = diffMatchPatch.patch_make(this.text, textTarget);
		return new DocumentPatch(this.id, this.hash, patches);
	}

	applyPatch(patch: DocumentPatch) {
		if (patch.hash !== this.hash) {
			return false;
		}

		return this.applyPatchSkipVerify(patch);
	}

	applyPatchSkipVerify(patch: DocumentPatch) {
		const [text, results] = diffMatchPatch.patch_apply(patch.patches, this.text);
		this.text = text;

		return !results.some(r => r === false);
	}
}
