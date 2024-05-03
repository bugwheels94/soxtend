import { commandOptions, RedisClientType, createClient } from 'redis';
import { MessageDistributor } from '.';
import { AllowedType, DataMapping } from '../utils';

const decoder = new TextDecoder();

// @ts-ignore
export class RedisMessageDistributor<T extends AllowedType = 'string'> implements MessageDistributor<T, string[]> {
	// @ts-ignore
	redisClient: RedisClientType;
	initialized?: boolean;
	messageType?: T;
	constructor(private url: string) {}
	// @ts-ignore
	enqueue: (queueId: string, message: DataMapping<T>) => void;
	// @ts-ignore
	listen: (channel: string, callback: (_s: DataMapping<T>) => void) => void;
	async initialize(_serverId: string) {
		const client = createClient({
			url: this.url,
		});

		client.on('error', (err) => console.log('Redis Client Error', err));

		await client.connect();
		this.initialized = true;
		// @ts-ignore
		this.redisClient = client;

		if (this.messageType === 'binary') {
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
		console.log('distributor sending to', queueId, message);
		this.redisClient.publish(queueId, message);
	}
	async enqueueBuffer(queueId: string, message: Uint8Array) {
		const buffer = message.buffer;
		const length = buffer.byteLength;
		this.redisClient.publish(commandOptions({ returnBuffers: true }), queueId, Buffer.from(buffer, 0, length));
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
	async remove(key: string) {
		return this.redisClient.del(key);
	}

	async listenString(channel: string, callback: (_s: string) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		redisClient.subscribe(channel, (message) => {
			callback(message);
		});
	}
	// async listenString(channel: string, callback: (_: string, _s: string) => void) {
	// 	const redisClient = createClient({
	// 		url: this.url,
	// 	});
	// 	await redisClient.connect();
	// 	while (true) {
	// 		try {
	// 			const pp = redisClient.blPop(channel, 0);
	// 			const result = await pp;
	// 			if (!result) continue;
	// 			const { element: message } = result;
	// 			const separator = message.indexOf(':');
	// 			const id = message.substring(0, separator);
	// 			const remaining = message.substring(separator + 1, message.length);

	// 			callback(id, remaining);
	// 		} catch (e) {
	// 			console.log(e);
	// 		}
	// 	}
	// }
	async listenBuffer(channel: string, callback: (_s: Uint8Array) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		redisClient.subscribe(
			channel,
			(message) => {
				callback(message);
			},
			true
		);
	}
}
