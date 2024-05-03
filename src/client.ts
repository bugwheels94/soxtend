import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
// import { MessageStore } from './messageStore';
import crypto from 'crypto';
import EventEmitter from 'events';
import { AllowedType, DataMapping, JsonObject, Serialize } from './utils';
import { SoxtendServer } from '.';
import { GROUPS_BY_CONNECTION_ID, SERVERS_HAVING_GROUP } from './constants';

export type ClientResponse = {
	_id: number;
	status: HttpStatusCode;
	data: any;
};

export type ClientRequest = {
	body?: any;
	// if the client is supposed to forget the message after delivery to the server so no promise wrapping. less overhead
	forget?: boolean;
	id?: never;
	get?: never;
	put?: never;
	patch?: never;
	delete?: never;
	post?: never;
};
export type ClientPromiseStore = Record<
	string,
	{
		resolve: (value: ClientResponse | PromiseLike<ClientResponse>) => void;
		reject: (value: ClientResponse | PromiseLike<ClientResponse>) => void;
	}
>;

export class Socket<DataSentOverWire extends AllowedType = 'string'> extends EventEmitter {
	public readonly id: string = crypto.randomUUID();
	private serialize: Serialize<DataMapping<DataSentOverWire>>;
	storage: Record<string, any> = {};
	mode?: string | Uint8Array;
	rawSocket: WebSocket;
	// store?: MessageStore | undefined;
	groups: Set<string> = new Set();
	server: SoxtendServer<DataSentOverWire>;
	send(object: JsonObject) {
		const serializedMessage = this.serialize(object);
		//@ts-ignore
		this.rawSocket.send(serializedMessage);
	}
	public async initialize() {
		const id = this.id;
		this.server.individualSocketConnectionStore.add(this);
		return this.server.distributor.set(`i:${id}`, this.server.serverId);
	}
	public async clear() {
		const id = this.id;
		this.server.individualSocketConnectionStore.remove(id);
		return this.server.distributor.set(`i:${id}`, this.server.serverId);
	}
	constructor(
		socket: WebSocket,
		{
			server,
			mode,
			serialize,
		}: {
			serialize: Serialize<DataMapping<DataSentOverWire>>;
			server: SoxtendServer<DataSentOverWire>;
			mode: string | Uint8Array;
		} // , store?: MessageStore
	) {
		super();
		this.serialize = serialize;

		this.mode = mode;
		this.rawSocket = socket;
		this.server = server;
		// this.store = store;
		this.initialize();
	}
	// addListener: (method: 'message', listener: (message: JsonObject) => void) => this;

	public async joinGroup(groupId: string) {
		this.server.socketGroupStore.add(this, groupId);
		return Promise.all([
			this.server.distributor.addListItem(`${GROUPS_BY_CONNECTION_ID}${this.id}`, groupId),
			this.server.distributor.addListItem(`${SERVERS_HAVING_GROUP}${groupId}`, this.server.serverId),
		]);
	}

	async joinGroups(groupdIds: Iterable<string>) {
		for (let groupId of groupdIds) {
			this.server.socketGroupStore.add(this, groupId);
			this.server.distributor.addListItem(`${SERVERS_HAVING_GROUP}${groupId}`, this.server.serverId);
		}
		this.server.distributor.addListItems(`${GROUPS_BY_CONNECTION_ID}${this.id}`, groupdIds);
	}
	async leaveGroup(groupId: string) {
		this.server.socketGroupStore.remove(this, groupId);

		return this.server.distributor.removeListItem(`${GROUPS_BY_CONNECTION_ID}${this.id}`, groupId);
	}
	async leaveAllGroups() {
		const groups = await this.server.distributor.getListItems(`${GROUPS_BY_CONNECTION_ID}${this.id}`);
		return this.leaveGroups(groups);
	}
	async leaveGroups(groups: string[]) {
		if (!groups.length) return;
		for (let group of groups) {
			this.server.socketGroupStore.remove(this, group);
		}

		return Promise.all([this.server.distributor.removeListItems(`${GROUPS_BY_CONNECTION_ID}${this.id}`, groups)]);
	}
	async getAllGroups(socketId?: string) {
		return this.server.distributor.getListItems(`${GROUPS_BY_CONNECTION_ID}${socketId || this.id}`);
	}
}
