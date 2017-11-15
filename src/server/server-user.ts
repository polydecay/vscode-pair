import Document from '../shared/document';

export default class ServerUser {
	readonly id: string;
	username: string;

	shadows: Map<string, Document> = new Map();
	selections: Map<string, number[][]> = new Map();

	constructor(id: string) {
		this.id = id;
		this.username = id;
	}

	toRequestObject() {
		const selections: any = {};
		for (const [id, selection] of this.selections) {
			selections[id] = selection;
		}

		return {
			id: this.id,
			username: this.username,
			selections,
		};
	}
}
