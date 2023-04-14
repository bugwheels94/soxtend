export interface MessageDistributor {
	initialize: (serverId: string) => Promise<void>;
	listen: (queueId: string, callback: (receiverId: string, message: Uint8Array) => void) => void;
	enqueue: (queueId: string, message: Uint8Array) => void;
	addListItem: (listId: string, item: string) => Promise<any>;
	getListItems: (listId: string) => Promise<Iterable<string>>;
	set: (key: string, value: string) => Promise<any>;
	get: (key: string) => Promise<string>;
}

export { InMemoryMessageDistributor } from './inMemory';
