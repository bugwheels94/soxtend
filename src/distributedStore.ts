import { commandOptions, RedisClientType, createClient } from 'redis';
import { TextDecoder } from 'util';
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

const decoder = new TextDecoder();
export interface DistributedStore {
	initialize: (serverId: string) => Promise<void>;
	sendToGroup: (groupId: string, message: Uint8Array) => void;
	joinGroup: (groupId: string) => void;
	sendToIndividual: (channelId: string, message: Uint8Array) => void;
	listen: (queueId: string, callback: (receiverId: string, message: string) => void) => void;
}
export class RedisStore implements DistributedStore {
	redisClient: RedisClientType;
	private serverId: string;
	constructor(private url: string) {}
	async initialize(serverId: string) {
		this.serverId = serverId;
		const client = createClient({
			url: this.url,
		});

		client.on('error', (err) => console.log('Redis Client Error', err));

		await client.connect();
		// @ts-ignore
		this.redisClient = client;
	}

	async sendToGroup(channelId: string, message: Uint8Array) {
		const servers = await this.redisClient.sMembers(`g:${channelId}`);
		for (let i = 0; i < servers.length; i++) {
			const server = servers[i];
			if (this.serverId !== server) this.redisClient.lPush(`g:${server}`, `${channelId}:${decoder.decode(message)}`); // send to the server oin group channel
		}
	}
	joinGroup(groupId: string) {
		return this.redisClient.sAdd(`g:${groupId}`, this.serverId);
	}
	async sendToIndividual(channelId: string, message: Uint8Array) {
		const server = await this.redisClient.get(`i:${channelId}`);
		this.redisClient.lPush(`i:${server}`, `${channelId}:${decoder.decode(message)}`); // send to the server on individual channel
	}
	async listen(channel: string, callback: (_: string, _s: string) => void) {
		while (true) {
			const { element: message } = await this.redisClient.blPop(commandOptions({ isolated: true }), channel, 0);
			const id = message.substring(0, message.indexOf(':'));
			const remaining = message.substring(message.indexOf(':') + 1);
			callback(id, remaining);
		}
	}
}
