import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
export type ClientResponse = {
	_id: number;
	status: HttpStatusCode;
	data: any;
};
type ServerClientRequest = Partial<Omit<ClientResponse, '_id'>>;
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

const stringify = (v: any) => {
	return JSON.stringify(v);
};
export class Client {
	id: number = -1;
	socket: WebSocket;
	promiseStore: ClientPromiseStore = {};
	pendingMessageStore: string[] = [];
	method(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, options: ClientRequest = {}) {
		let socket: WebSocket, message: string;
		const { forget, ...remaining } = options;
		if (!forget) {
			this.id += 1;
			message = stringify({ ...remaining, [method]: url, id: this.id });
		} else {
			message = stringify({ ...remaining, [method]: url });
		}
		socket = this.socket;
		if (socket.CONNECTING === socket.readyState) {
			this.pendingMessageStore.push(message);
		} else {
			socket.send(message);
		}
		return new Promise<ClientResponse>((resolve, reject) => {
			this.promiseStore[this.id] = { resolve, reject };
		});
	}
	get(url: string, options?: ClientRequest) {
		return this.method('get', url, options);
	}
	post(url: string, options?: ClientRequest) {
		return this.method('post', url, options);
	}
	put(url: string, options?: ClientRequest) {
		return this.method('put', url, options);
	}
	patch(url: string, options?: ClientRequest) {
		return this.method('patch', url, options);
	}
	delete(url: string, options?: ClientRequest) {
		return this.method('delete', url, options);
	}
	onSocketCreated(socket: WebSocket) {
		this.socket = socket;
		socket.addEventListener('open', () => {
			this.pendingMessageStore.map((message) => socket.send(message));
			this.pendingMessageStore = [];
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

export class ServerClient {
	id: number = -1;
	sockets: Set<WebSocket>;
	method(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, options: ServerClientRequest = {}) {
		const { data, ...remaining } = options;
		let sockets = this.sockets,
			message = stringify({ [method]: url, data: data, ...remaining });
		sockets = this.sockets;
		sockets.forEach((socket) => socket.send(message));
	}
	constructor(sockets: Set<WebSocket>) {
		this.sockets = sockets;
	}
	get(url: string, options?: ServerClientRequest) {
		return this.method('get', url, options);
	}
	post(url: string, options?: ServerClientRequest) {
		return this.method('post', url, options);
	}
	put(url: string, options?: ServerClientRequest) {
		return this.method('put', url, options);
	}
	patch(url: string, options?: ServerClientRequest) {
		return this.method('patch', url, options);
	}
	delete(url: string, options?: ServerClientRequest) {
		return this.method('delete', url, options);
	}
}
export class ServerClients {
	clients: Map<string | number, ServerClient> = new Map();
	listOfAllSockets: Set<WebSocket> = new Set();

	add(socket: WebSocket) {
		const socketSet = new Set<WebSocket>();
		socketSet.add(socket);
		if (!('groupId' in socket)) return new ServerClient(socketSet);
		const groupId = socket['groupId'];
		const existingClient = this.clients.get(groupId);
		this.listOfAllSockets.add(socket);
		if (existingClient) {
			existingClient.sockets.add(socket);
			return existingClient;
		}
		const newClient = new ServerClient(socketSet);
		this.clients.set(groupId, newClient);
		return newClient;
	}
	find(id: string | number) {
		return this.clients.get(id);
	}
	remove(socket: WebSocket) {
		if (!('groupId' in socket)) return;
		const client = this.clients.get(socket['groupId']);
		client.sockets.delete(socket);
		this.listOfAllSockets.delete(socket);
	}
	constructor() {
		this.clients.set('*', new ServerClient(this.listOfAllSockets));
	}
}
