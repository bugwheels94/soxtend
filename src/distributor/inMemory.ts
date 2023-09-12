import EventEmitter from 'events';
import { MessageDistributor } from '.';
import { AllowedType } from '../utils';
const decoder = new TextDecoder();

export class InMemoryMessageDistributor<T extends AllowedType = string> implements MessageDistributor<T> {
	initialized?: boolean;
	list: Map<string, Set<string>> = new Map();
	mode?: 'string' | 'Uint8Array';

	keyStore: Map<string, string> = new Map();
	eventEmitter = new EventEmitter();
	constructor() {}
	enqueue: (queueId: string, message: T) => Promise<void>;
	listen: (queueId: string, callback: (receiverId: string, message: T) => void) => void;

	async initialize() {
		this.initialized = true;
		if (this.mode === 'Uint8Array') {
			// @ts-ignore
			this.enqueue = this.enqueueBuffer;
			// @ts-ignore
			this.listen = this.listenBuffer;
		} else {
			// @ts-ignore
			this.enqueue = this.enqueueString;
			// @ts-ignore
			this.listen = this.listenString;
		}
	}

	async addListItem(listId: string, item: string) {
		if (this.list.has(listId)) this.list.get(listId).add(item);
		else this.list.set(listId, new Set([item]));
	}
	async addListItems(listId: string, items: Iterable<string>) {
		if (!this.list.has(listId)) this.list.set(listId, new Set());
		const list = this.list.get(listId);
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
	async enqueueBuffer(queueId: string, message: Uint8Array) {
		this.eventEmitter.emit(queueId, message);
	}
	async enqueueString(queueId: string, message: string) {
		this.eventEmitter.emit(queueId, message);
	}
	async listenBuffer(channel: string, callback: (_: string, _s: Uint8Array) => void) {
		this.eventEmitter.on(channel, (message: Uint8Array) => {
			const finalMessage = new Uint8Array(message);
			const groupLength = finalMessage[0];
			const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));

			const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);

			callback(id, remaining);
		});
	}
	async listenString(channel: string, callback: (_: string, _s: string) => void) {
		this.eventEmitter.on(channel, (message: string) => {
			const separator = message.indexOf(':');
			const id = message.substring(0, separator);
			const remaining = message.substring(separator + 1, message.length);
			callback(id, remaining);
		});
	}
}
