export interface MessageDistributor<T, ListType = Iterable<string>> {
	mode?: 'string' | 'Uint8Array';

	initialize: (
		serverId: string,
		_: {
			mode: 'string' | 'Uint8Array';
		}
	) => Promise<void>;
	listen: (queueId: string, callback: (receiverId: string, message: T) => void) => void;
	enqueue: (queueId: string, message: T) => void;
	addListItem: (listId: string, item: string) => Promise<any>;
	addListItems: (listId: string, items: ListType) => Promise<any>;
	removeListItem: (listId: string, item: string) => Promise<any>;
	removeListItems: (listId: string, item: ListType) => Promise<any>;
	getListItems: (listId: string) => Promise<ListType>;
	set: (key: string, value: string) => Promise<any>;
	get: (key: string) => Promise<string | null | undefined>;
}

export { InMemoryMessageDistributor } from './inMemory';
