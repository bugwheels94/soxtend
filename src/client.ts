import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import { store } from './utils';
export type ClientResponse = {
	_id: number;
	status: HttpStatusCode;
	data: any;
};
export type ClientRequest = {
	body?: any;
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

export class Client {
	id: number = -1;
	socket: WebSocket;
	promiseStore: ClientPromiseStore = {};
	pendinMessageStore: string[] = [];
	method(
		method: 'get' | 'post' | 'put' | 'patch' | 'delete',
		url: string,
		options: ClientRequest = {},
		socketId?: string | number
	) {
		let socket: WebSocket, message: string;
		if (!options.forget) {
			this.id += 1;
			message = JSON.stringify({ [method]: url, id: this.id, ...options });
		} else {
			message = JSON.stringify({ [method]: url, ...options });
		}
		if (socketId) {
			socket = store[socketId];
		} else {
			socket = this.socket;
		}
		if (socket.OPEN !== socket.readyState) {
			this.pendinMessageStore.push(message);
		} else {
			socket.send(message);
		}
		return new Promise<ClientResponse>((resolve, reject) => {
			this.promiseStore[this.id] = { resolve, reject };
		});
	}
	get(url: string, options?: ClientRequest, socketId?: string | number) {
		return this.method('get', url, options, socketId);
	}
	post(url: string, options?: ClientRequest, socketId?: string | number) {
		return this.method('post', url, options, socketId);
	}
	put(url: string, options?: ClientRequest, socketId?: string | number) {
		return this.method('put', url, options, socketId);
	}
	patch(url: string, options?: ClientRequest, socketId?: string | number) {
		return this.method('patch', url, options, socketId);
	}
	delete(url: string, options?: ClientRequest, socketId?: string | number) {
		return this.method('delete', url, options, socketId);
	}
	attachSocket(socket: WebSocket) {
		this.socket = socket;
		socket.addEventListener('open', () => {
			this.pendinMessageStore.map((message) => socket.send(message));
			this.pendinMessageStore = [];
		});
	}
	async listener(message: ClientResponse) {
		// Message is coming from client to router and execution should be skipped
		if (!('_id' in message)) return;
		if (message.status < 300) {
			this.promiseStore[message._id].resolve(message);
		} else if (message.status >= 300) {
			this.promiseStore[message._id].reject(message);
		}
		delete this.promiseStore[message._id];
	}
}
