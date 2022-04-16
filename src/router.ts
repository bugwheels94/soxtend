import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import { ApiError, Callback, MessageData, Request, RouterResponse, Store } from './utils';

export class Router {
	onGetStore: Store = {};
	onPostStore: Store = {};
	socket: WebSocket.WebSocket;

	get(url: string, ...callback: Callback[]) {
		this.onGetStore[url] = callback;
	}
	post(url: string, ...callback: Callback[]) {
		this.onPostStore[url] = callback;
	}
	constructor(socket: WebSocket.WebSocket) {
		this.socket = socket;
	}
	async listener(message: Request) {
		// Message is coming from router to client and execution should be skipped
		if ('_id' in message) return;
		let store: Store;
		let method: 'get' | 'post';
		if (message.get) {
			store = this.onGetStore;
			method = 'get';
		} else {
			method = 'post';
			store = this.onPostStore;
		}
		const callbacks = store[message[method]];
		const response: RouterResponse = {
			_id: message.id,
			data: null,
			code: null,
			status: function (status: HttpStatusCode | null) {
				if (this.status !== null)
					throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this.status}) `);
				this.status = status;
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
				response.code = response.code || 200;
			} catch (error) {
				if (error instanceof ApiError) {
					response.data = error.message;
					response.code = error.status;
				} else response.code = response.code || 500;
			}
			this.socket.send(JSON.stringify({ _id: response._id, data: response.data, status: response.status }));
		} else {
			// Just send acknowledgement if the router does not handle this message
			this.socket.send(JSON.stringify({ _id: response._id, status: 204 }));
		}
	}
}
