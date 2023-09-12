import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
// import { MessageStore } from './messageStore';
import crypto from 'crypto';
import EventEmitter from 'events';
import { AllowedType, JsonObject, Serialize } from './utils';

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
			mode,
			serialize,
		}: {
			serialize: Serialize<DataSentOverWire>;

			mode: 'string' | 'Uint8Array';
		} // , store?: MessageStore
	) {
		super();
		this.serialize = serialize;

		this.mode = mode;

		this.rawSocket = socket;
		// this.store = store;
		this.id = crypto.randomUUID();
	}
	addListener: (method: 'message', listener: (message: JsonObject) => void) => this;
}
