import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
// import { MessageStore } from './messageStore';
import EventEmitter from 'events';
import { AllowedType, DataMapping, JsonObject, Serialize } from './utils';
import { SoxtendServer } from '.';
import { nanoid } from 'nanoid';
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
	public readonly id: string;
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
		this.server.individualSocketConnectionStore.add(this);
	}
	public async clear() {
		const id = this.id;
		this.server.individualSocketConnectionStore.remove(id);
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
		this.id = this.server.id + nanoid();

		// this.store = store;
		this.initialize();
	}
	// addListener: (method: 'message', listener: (message: JsonObject) => void) => this;

	public async joinGroup(groupId: string) {
		this.server.socketGroupStore.add(this, groupId);
	}

	async joinGroups(groupdIds: Iterable<string>) {
		for (let groupId of groupdIds) {
			this.server.socketGroupStore.add(this, groupId);
		}
	}
	async leaveGroup(groupId: string) {
		this.server.socketGroupStore.remove(this, groupId);
	}
	async leaveAllGroups() {
		const groups = this.server.socketGroupStore.myGroups.get(this.id);
		if (!groups) return;
		return this.leaveGroups(groups);
	}
	async leaveGroups(groups: Set<string | number>) {
		for (let group of groups) {
			this.server.socketGroupStore.remove(this, group);
		}
	}
	async getAllGroups() {
		return this.server.socketGroupStore.myGroups.get(this.id);
	}
}
