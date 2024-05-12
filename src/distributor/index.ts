import { AllowedType } from '../utils';

export interface MessageDistributor<T extends AllowedType, ListType = Iterable<string>> {
	messageType?: T;

	initialize: (
		serverId: string,
		_: {
			messageType: T;
		}
	) => Promise<void>;
	listen: (queueId: string, callback: (message: DataMapping<T>) => void) => void;
	enqueue: (queueId: string, message: DataMapping<T>) => void;
	addListItem: (listId: string, item: string) => Promise<any>;
	addListItems: (listId: string, items: ListType) => Promise<any>;
	removeListItem: (listId: string, item: string) => Promise<any>;
	removeListItems: (listId: string, item: ListType) => Promise<any>;
	getListItems: (listId: string) => Promise<ListType>;
	set: (key: string, value: string) => Promise<any>;
	get: (key: string) => Promise<string | null | undefined>;
	remove: (key: string) => Promise<any>;
}

export { InMemoryMessageDistributor } from './inMemory';

// Define a helper type that maps 'AllowedType' to corresponding 'Values'
type DataMapping<T> = T extends 'string' ? string : T extends 'binary' ? Uint8Array : never;

// Usage examples
