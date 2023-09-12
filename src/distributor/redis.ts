import { commandOptions, RedisClientType, createClient } from 'redis';
import { MessageDistributor } from '.';

const decoder = new TextDecoder();

export class RedisMessageDistributor<T> implements MessageDistributor<T, string[]> {
	redisClient: RedisClientType;
	initialized?: boolean;
	mode?: 'string' | 'Uint8Array';
	constructor(private url: string) {}
	enqueue: (queueId: string, message: T) => Promise<void>;
	listen: (queueId: string, callback: (receiverId: string, message: T) => void) => void;
	async initialize(_serverId: string) {
		const client = createClient({
			url: this.url,
		});

		client.on('error', (err) => console.log('Redis Client Error', err));

		await client.connect();
		this.initialized = true;
		// @ts-ignore
		this.redisClient = client;

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
	async enqueueString(queueId: string, message: string) {
		this.redisClient.rPush(queueId, message);
	}
	async enqueueBuffer(queueId: string, message: Uint8Array) {
		const buffer = message.buffer;
		const length = buffer.byteLength;
		this.redisClient.rPush(commandOptions({ returnBuffers: true }), queueId, Buffer.from(buffer, 0, length));
	}
	async addListItem(listId: string, item: string) {
		return this.redisClient.sAdd(listId, item);
	}
	async addListItems(listId: string, item: string[]) {
		return this.redisClient.sAdd(listId, item);
	}
	async getListItems(listId: string) {
		return this.redisClient.sMembers(listId);
	}
	async removeListItem(listId: string, item: string) {
		return this.redisClient.sRem(listId, item);
	}
	async removeListItems(listId: string, item: string[]) {
		return this.redisClient.sRem(listId, item);
	}

	async set(key: string, value: string) {
		return this.redisClient.set(key, value);
	}
	async get(key: string) {
		return this.redisClient.get(key);
	}

	async listenString(channel: string, callback: (_: string, _s: string) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		while (true) {
			try {
				const pp = redisClient.blPop(channel, 0);
				const result = await pp;
				if (!result) continue;
				const { element: message } = result;
				const separator = message.indexOf(':');
				const id = message.substring(0, separator);
				const remaining = message.substring(separator + 1, message.length);

				callback(id, remaining);
			} catch (e) {
				console.log(e);
			}
		}
	}
	async listenBuffer(channel: string, callback: (_: string, _s: Uint8Array) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		while (true) {
			try {
				const pp = redisClient.blPop(commandOptions({ returnBuffers: true }), channel, 0);
				const result = await pp;
				if (!result) continue;
				const { element: message } = result;
				const finalMessage = new Uint8Array(message);
				const groupLength = finalMessage[0];
				const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));

				const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);

				callback(id, remaining);
			} catch (e) {
				console.log(e);
			}
		}
	}
}
