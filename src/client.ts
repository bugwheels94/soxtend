import WebSocket from 'isomorphic-ws';
import { ClientPromiseStore, ClientResponse, Request } from './utils';

export class Client {
	id: number = -1;
	socket: WebSocket.WebSocket;
	promiseStore: ClientPromiseStore = {};
	get(url: string, options: Request) {
		this.id += 1;
		this.socket.send(JSON.stringify({ get: url, id: this.id, options }));
		return new Promise<ClientResponse>((resolve, reject) => {
			this.promiseStore[this.id] = { resolve, reject };
		});
	}
	post(url: string, options: Request) {
		this.id += 1;
		this.socket.send(JSON.stringify({ post: url, id: this.id, options }));
		return new Promise((resolve, reject) => {
			this.promiseStore[this.id] = { resolve, reject };
		});
	}
	constructor(socket: WebSocket.WebSocket) {
		this.socket = socket;
	}
	async listener(message: ClientResponse) {
		// Message is coming from client to router and execution should be skipped
		if ('id' in message) return;
		if (message.status <= 200) {
			this.promiseStore[message._id].resolve(message);
		} else if (message.status > 200) {
			this.promiseStore[message._id].reject(message);
		}
		delete this.promiseStore[message._id];
	}
}
