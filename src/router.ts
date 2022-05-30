import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import { ApiError, Callback, MessageData, Method, Request, RouterResponse, Store } from './utils';
import { match } from 'path-to-regexp';
export class Router {
	store: Store = {
		get: [],
		post: [],
		put: [],
		patch: [],
		delete: [],
	};
	socket: WebSocket;
	registerRoute(method: Method, url: string, ...callbacks: Callback[]) {
		this.store[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	get(url: string, ...callbacks: Callback[]) {
		this.registerRoute('get', url, ...callbacks);
	}
	put(url: string, ...callbacks: Callback[]) {
		this.registerRoute('put', url, ...callbacks);
	}
	post(url: string, ...callbacks: Callback[]) {
		this.registerRoute('post', url, ...callbacks);
	}
	patch(url: string, ...callbacks: Callback[]) {
		this.registerRoute('patch', url, ...callbacks);
	}
	delete(url: string, ...callbacks: Callback[]) {
		this.registerRoute('delete', url, ...callbacks);
	}
	attachSocket(socket: WebSocket) {
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
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message[method]);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++)
					await store[i].callbacks[j]({ ...message, params: matched.params }, response);
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
	}
}
