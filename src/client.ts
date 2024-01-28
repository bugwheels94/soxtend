import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
// import { MessageStore } from './messageStore';
import crypto from 'crypto';
import EventEmitter from 'events';
import { AllowedType, JsonObject, Serialize } from './utils';
import { SoxtendServer } from '.';

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

export class Socket<DataSentOverWire extends AllowedType = string> extends EventEmitter {
	id: string;
	private serialize: Serialize<DataSentOverWire>;
	storage: Record<string, any> = {};
	mode?: 'string' | 'Uint8Array';
	rawSocket: WebSocket;
	// store?: MessageStore | undefined;
	groups: Set<string> = new Set();
	server: SoxtendServer<DataSentOverWire>;
	send(object: JsonObject) {
		const serializedMessage = this.serialize(object);
		//@ts-ignore
		this.rawSocket.send(serializedMessage);
	}
	setId(id: string) {
		this.id = id;
	}
	constructor(
		socket: WebSocket,
		{
			server,
			mode,
			serialize,
		}: {
			serialize: Serialize<DataSentOverWire>;
			server: SoxtendServer<DataSentOverWire>;
			mode: 'string' | 'Uint8Array';
		} // , store?: MessageStore
	) {
		super();
		this.serialize = serialize;

		this.mode = mode;
		this.rawSocket = socket;
		this.server = server;
		// this.store = store;
		this.id = crypto.randomUUID();
	}
	addListener: (method: 'message', listener: (message: JsonObject) => void) => this;

	public async joinGroup(groupId: string) {
		this.server.socketGroupStore.add(this, groupId);
		if (!this.server.distributor) return undefined;
		return Promise.all([
			this.server.distributor.addListItem(`my-groups:${this.id}`, groupId),
			this.server.distributor.addListItem(`group-servers:${groupId}`, this.server.serverId),
		]);
	}

	async joinGroups(groupdIds: Iterable<string>) {
		for (let groupId of groupdIds) {
			this.server.socketGroupStore.add(this, groupId);
			this.server.distributor.addListItem(`group-servers:${groupId}`, this.server.serverId);
		}
		this.server.distributor.addListItems(`my-groups:${this.id}`, groupdIds);
	}
	async leaveGroup(groupId: string) {
		this.server.socketGroupStore.remove(this, groupId);

		return this.server.distributor.removeListItem(`my-groups:${this.id}`, groupId);
	}
	async leaveAllGroups() {
		const groups = await this.server.distributor.getListItems(`my-groups:${this.id}`);
		for (let group of groups) {
			this.server.socketGroupStore.remove(this, group);
		}
		this.server.distributor.removeListItems(`my-groups:${this.id}`, groups);
	}
	async leaveGroups(groups: string[]) {
		for (let group of groups) {
			this.server.socketGroupStore.remove(this, group);
		}

		return Promise.all([this.server.distributor.removeListItems(`my-groups:${this.id}`, groups)]);
	}
	async getAllGroups() {
		return this.server.distributor.getListItems(`my-groups:${this.id}`);
	}
}
