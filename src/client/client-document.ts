import Document from '../shared/document';

export default class ClientShadow extends Document {
	isInitialized = false;
	isPatching = false;
	isDirty = true;
}
