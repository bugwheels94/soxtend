import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import crypto from 'crypto';
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

export class Socket {
	id: string;
	socket: WebSocket;
	groups: Set<string> = new Set();
	lastMessageId = 0;
	send(data: Uint8Array) {
		let socket = this.socket;
		let id = ++this.lastMessageId;
		data[2] = id & 255;
		id = id >> 8;
		data[1] = id & 255;
		id = id >> 8;
		data[0] = id & 255;

		socket = this.socket;
		// inject code for insert into reconnect queue here
		// 1. Save locally for 5 seconds(configurable)
		// 2. If browser sends ack before then discard messages directly
		// 3. otherwise, start inserting into redis
		// 4. After, n seconds or given length clear the queue
		socket.send(data);
	}
	constructor(socket: WebSocket) {
		this.socket = socket;
		this.id = crypto.randomUUID();
	}
}
