import { commandOptions, RedisClientType, createClient } from 'redis';
import crypto from 'crypto';

export abstract class StorageClass<Client> {
	client: Client;
	serverId: string;
	constructor(options: { client: Client }) {
		this.client = options.client;
		this.serverId = crypto.randomUUID();
	}
	addToMap(_mapName: string, _key: string, _value: string) {}
	deleteFromMap(_mapName: string, _key: string) {}
	addToGroup(_groupName: string) {
		// Insert this server id to thes passed groupName in storage
		// store websocket instance corresponsing to groupName[] in local memory
	}
	removeFromGroup(_groupName: string) {
		// remove websocket instance corresponsing to groupName[] in local memory
		// if groupName[] is empty them remove this server id from the passed groupName in storage
	}
}

export interface DistributedStore {
	initialize: (serverId: string) => Promise<void>;
	listen: (queueId: string, callback: (receiverId: string, message: Uint8Array) => void) => void;
	enqueue: (queueId: string, message: Uint8Array) => void;
	addListItem: (listId: string, item: string) => Promise<any>;
	getListItems: (listId: string) => Promise<string[]>;
	set: (key: string, value: string) => Promise<any>;
	get: (key: string) => Promise<string>;
}

const decoder = new TextDecoder();
export class RedisStore implements DistributedStore {
	redisClient: RedisClientType;
	private serverId: string;
	initialized?: boolean;
	constructor(private url: string) {}
	async initialize(serverId: string) {
		this.serverId = serverId;
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
	async getListItems(listId: string) {
		return this.redisClient.sMembers(listId);
	}
	async removeListItem(listId: string, item: string) {
		return Promise.all([this.redisClient.sRem(listId, item)]);
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
		this.redisClient.lPush(commandOptions({ returnBuffers: true }), queueId, Buffer.from(buffer, 0, length));
	}
	async addIndividualToServer(connectionId: string) {
		return this.redisClient.set(`i:${connectionId}`, this.serverId);
	}

	async listen(channel: string, callback: (_: string, _s: Uint8Array) => void) {
		const redisClient = createClient({
			url: this.url,
		});
		await redisClient.connect();
		while (true) {
			console.log('BLOCKING LIST', channel);
			try {
				const pp = redisClient.blPop(commandOptions({ returnBuffers: true }), channel, 0);
				const { element: message } = await pp;
				const finalMessage = new Uint8Array(message);
				console.log('MNESSAGE FOUND', message, finalMessage);
				const groupLength = finalMessage[0];
				const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));

				const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);
				console.log('ITEM FOUND', { id, remaining });

				callback(id, remaining);
			} catch (e) {
				console.log('OKOK', e);
			}
		}
	}
}
