import crypto from 'crypto';

export interface MessageStore {
	initialize: (serverId: string) => Promise<void>;
	insert: (messageId: string, message: Uint8Array) => void;
	getMessagesAfterId: (messageId: string) => Uint8Array[];
	sendToIndividual: (channelId: string, message: Uint8Array) => void;
	listen: (queueId: string, callback: (receiverId: string, message: string) => void) => void;
}
export abstract class StorageClass<Client> {
	client: Client;
	serverId: string;
	constructor(options: { client: Client }) {
		this.client = options.client;
		this.serverId = crypto.randomUUID();
	}
	addToMap(_mapName: string, _key: string, _value: string) {}
	deleteFromMap(_mapName: string, _key: string) {}
	addToGroup(_groupName: string) {
		// Insert this server id to thes passed groupName in storage
		// store websocket instance corresponsing to groupName[] in local memory
	}
	removeFromGroup(_groupName: string) {
		// remove websocket instance corresponsing to groupName[] in local memory
		// if groupName[] is empty them remove this server id from the passed groupName in storage
	}
}
