import { patch_obj } from "diff-match-patch";

export default class DocumentPatch {
	readonly id: string;
	readonly hash: string;
	readonly patches: patch_obj[];

	constructor(id: string, hash: string, patches: patch_obj[]) {
		this.id = id;
		this.hash = hash;
		this.patches = patches;
	}
}
