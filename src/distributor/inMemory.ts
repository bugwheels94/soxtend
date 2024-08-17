import EventEmitter from 'events';
import { MessageDistributor } from '.';
import { AllowedType, DataMapping } from '../utils';

export class InMemoryMessageDistributor<T extends AllowedType = 'string'> implements MessageDistributor<T> {
	initialized?: boolean;
	list: Map<string, Set<string>> = new Map();
	messageType?: T;

	keyStore: Map<string, string> = new Map();
	eventEmitter = new EventEmitter();
	constructor() {}

	async initialize() {
		this.initialized = true;
	}

	async addListItem(listId: string, item: string) {
		if (this.list.has(listId)) this.list.get(listId)?.add(item);
		else this.list.set(listId, new Set([item]));
	}
	async addListItems(listId: string, items: Iterable<string>) {
		if (!this.list.has(listId)) this.list.set(listId, new Set());
		const list = this.list.get(listId);
		if (!list) return;
		for (const item of items) list.add(item);
	}
	async getListItems(listId: string) {
		return this.list.get(listId) || [];
	}
	async removeListItem(listId: string, item: string) {
		return this.list.get(listId)?.delete(item);
	}
	async removeListItems(listId: string, items: Iterable<string>) {
		if (!this.list.has(listId)) return;
		const list = this.list.get(listId);
		if (!list) return;
		for (const item of items) list.delete(item);
	}
	async removeList(listId: string) {
		return this.list.delete(listId);
	}

	async set(key: string, value: string) {
		return this.keyStore.set(key, value);
	}
	async get(key: string) {
		return this.keyStore.get(key);
	}
	async remove(key: string) {
		this.keyStore.delete(key);
	}
	async enqueue(queueId: string, message: DataMapping<T>) {
		this.eventEmitter.emit(queueId, message);
	}
	async listen(channel: string, callback: (_s: DataMapping<T>) => void) {
		this.eventEmitter.on(channel, (message: DataMapping<T>) => {
			callback(message);
		});
	}
}
