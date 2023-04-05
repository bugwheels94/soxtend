import { RedisClientType, createClient } from 'redis';

const textDecoder = new TextDecoder();
export interface MessageStore {
	initialize: (serverId: string) => Promise<void>;
	insert: (key: string, messages: [string, Uint8Array][]) => void;
	getMessagesAfterId: (messageId: string) => Uint8Array[];
}
export class RedisMessageStore {
	redisClient: RedisClientType;
	constructor(private url?: string) {}

	async initialize() {
		const client = this.url
			? createClient({
					url: this.url,
			  })
			: createClient();

		client.on('error', (err) => console.log('Redis Client Error', err));

		await client.connect();
		// @ts-ignore
		this.redisClient = client;
	}
	insert(key: string, messages: [string, Uint8Array][]) {
		messages.map(([messageId, message]) => {
			return this.redisClient.xAdd(key, messageId, { '0': textDecoder.decode(message) });
		});
	}
	async getMessagesAfterId(key: string, messageId: string) {
		const data = await this.redisClient.xRange(key, messageId, '+');
		return data;
	}
}
