import { commandOptions, RedisClientType, createClient } from 'redis';
import { MessageDistributor } from '.';

const decoder = new TextDecoder();

export class RedisMessageDistributor implements MessageDistributor {
	redisClient: RedisClientType;
	initialized?: boolean;

	constructor(private url: string) {}
	async initialize() {
		const client = createClient({
			url: this.url,
		});

		client.on('error', (err) => console.log('Redis Client Error', err));

		await client.connect();
		this.initialized = true;
		// @ts-ignore
		this.redisClient = client;
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
	async enqueue(queueId: string, message: Uint8Array) {
		const buffer = message.buffer;
		const length = buffer.byteLength;

		this.redisClient.rPush(commandOptions({ returnBuffers: true }), queueId, Buffer.from(buffer, 0, length));
	}

	async listen(channel: string, callback: (_: string, _s: Uint8Array) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		while (true) {
			try {
				const pp = redisClient.blPop(commandOptions({ returnBuffers: true }), channel, 0);
				const { element: message } = await pp;
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
