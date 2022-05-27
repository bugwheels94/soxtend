import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import { ApiError, Callback, MessageData, Request, RouterResponse, Store } from './utils';

export class Router {
	store: Store = {
		get: {},
		post: {},
		put: {},
		patch: {},
		delete: {},
	};
	socket: WebSocket;

	get(url: string, ...callback: Callback[]) {
		const previous = this.store.get[url] || [];

		this.store.get[url] = [...previous, ...callback];
	}
	delete(url: string, ...callback: Callback[]) {
		const previous = this.store.delete[url] || [];
		this.store.delete[url] = [...previous, ...callback];
	}
	post(url: string, ...callback: Callback[]) {
		const previous = this.store.post[url] || [];
		this.store.post[url] = [...previous, ...callback];
	}
	put(url: string, ...callback: Callback[]) {
		const previous = this.store.put[url] || [];
		this.store.put[url] = [...previous, ...callback];
	}
	patch(url: string, ...callback: Callback[]) {
		const previous = this.store.patch[url] || [];
		this.store.patch[url] = [...previous, ...callback];
	}
	constructor(socket: WebSocket) {
		this.socket = socket;
	}
	async listener(message: Request) {
		// Message is coming from router to client and execution should be skipped
		if ('_id' in message) return;
		let store: Store['get'];
		let method: 'get' | 'post' | 'put' | 'patch' | 'delete';
		if (message.get) {
			store = this.store.get;
			method = 'get';
		} else if (message.post) {
			method = 'post';
			store = this.store.post;
		} else if (message.put) {
			method = 'put';
			store = this.store.put;
		} else if (message.patch) {
			method = 'patch';
			store = this.store.patch;
		} else {
			method = 'delete';
			store = this.store.delete;
		}
		const callbacks = store[message[method]];
		const response: RouterResponse = {
			_id: message.id,
			status: function (status: HttpStatusCode | null) {
				if (this.code !== undefined)
					throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this.code}) `);
				this.code = status;
				return this;
			},
			send: function (data: MessageData) {
				response.data = data;
				return this;
			},
		};
		if (callbacks) {
			try {
				for (let i = 0; i < callbacks.length; i += 1) {
					await callbacks[i](message, response);
					if (response.data !== undefined) break;
				}
				response.code = response.code === undefined ? 200 : response.code;
			} catch (error) {
				if (error instanceof ApiError) {
					response.data = error.message;
					response.code = error.status;
				} else response.code = response.code === undefined ? 500 : response.code;
			}
			if (response.code === null || message.id === undefined) return;
			this.socket.send(JSON.stringify({ _id: response._id, data: response.data, status: response.code }));
		} else {
			// Just send acknowledgement if the router does not handle this message
			if (response.code === null || message.id === undefined) return;
			this.socket.send(JSON.stringify({ _id: response._id, p: message[method], status: 204 }));
		}
	}
}
