import EventEmitter from 'events';
import { MessageDistributor } from '.';
const decoder = new TextDecoder();

export class InMemoryMessageDistributor implements MessageDistributor {
	initialized?: boolean;
	list: Map<string, Set<string>> = new Map();
	keyStore: Map<string, string> = new Map();
	eventEmitter = new EventEmitter();
	constructor() {}
	async initialize() {
		this.initialized = true;
	}

	async addListItem(listId: string, item: string) {
		if (this.list.has(listId)) this.list.get(listId).add(item);
		else this.list.set(listId, new Set([item]));
	}
	async getListItems(listId: string) {
		return this.list.get(listId) || [];
	}
	async removeListItem(listId: string, item: string) {
		return this.list.get(listId)?.delete(item);
	}

	async set(key: string, value: string) {
		return this.keyStore.set(key, value);
	}
	async get(key: string) {
		return this.keyStore.get(key);
	}
	async enqueue(queueId: string, message: Uint8Array) {
		this.eventEmitter.emit(queueId, message);
	}
	async listen(channel: string, callback: (_: string, _s: Uint8Array) => void) {
		this.eventEmitter.on(channel, (message) => {
			const finalMessage = new Uint8Array(message);
			const groupLength = finalMessage[0];
			const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));

			const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);

			callback(id, remaining);
		});
	}
}
