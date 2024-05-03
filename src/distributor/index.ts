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
type Values = string | Uint8Array;

// Define a helper type that maps 'AllowedType' to corresponding 'Values'
type DataMapping<T> = T extends 'string' ? string : T extends 'binary' ? Uint8Array : never;

class X<MessageType extends AllowedType> {
	data: DataMapping<MessageType>;

	constructor(data: DataMapping<MessageType>) {
		this.data = data;
	}
}

// Usage examples
const instanceWithString = new X<'string'>('hello world');
const instanceWithUint8Array = new X<'binary'>(new Uint8Array([1, 2, 3]));

console.log(instanceWithString.data); // data is string
console.log(instanceWithUint8Array.data);
