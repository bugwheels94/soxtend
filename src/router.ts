import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
import { ApiError, Method } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
import { ServerClient, ServerClients } from './client';
export type RouterStore = Record<Method, Route[]>;

/**
 * Simlar Socket means sockets with same socket.id
 */
export type RouterResponse = {
	_id?: string | number;
	code?: HttpStatusCode | null;
	status: (code: HttpStatusCode | null) => RouterResponse;
	data?: any | null;
	groupedClients: ServerClient;
	send: (data: any) => RouterResponse;
	group: Omit<RouterResponse, 'group' | 'othersInGroup' | 'groupedClients'>;
	othersInGroup: Omit<RouterResponse, 'group' | 'othersInGroup' | 'groupedClients'>;
};
export type RouterRequest = {
	id?: number;
	body?: any;
	get?: string;
	post?: string;
	put?: string;
	patch?: string;
	delete?: string;
} & MatchResult<Record<string, string | number>>;
export type RouterCallback = (request: RouterRequest, response: RouterResponse) => Promise<void>;
export type Route = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: RouterCallback[];
};

export class Router {
	store: RouterStore = {
		get: [],
		post: [],
		put: [],
		patch: [],
		delete: [],
	};
	clients: ServerClients;
	registerRoute(method: Method, url: string, ...callbacks: RouterCallback[]) {
		this.store[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	get(url: string, ...callbacks: RouterCallback[]) {
		this.registerRoute('get', url, ...callbacks);
	}
	put(url: string, ...callbacks: RouterCallback[]) {
		this.registerRoute('put', url, ...callbacks);
	}
	post(url: string, ...callbacks: RouterCallback[]) {
		this.registerRoute('post', url, ...callbacks);
	}
	patch(url: string, ...callbacks: RouterCallback[]) {
		this.registerRoute('patch', url, ...callbacks);
	}
	delete(url: string, ...callbacks: RouterCallback[]) {
		this.registerRoute('delete', url, ...callbacks);
	}
	async listener(message: RouterRequest, socket: WebSocket) {
		// Message is coming from router to client and execution should be skipped
		if ('_id' in message) return;
		let store: RouterStore['get'];
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
		const groupedClients = this.clients.find(socket['groupId']);
		const response: RouterResponse = {
			groupedClients,
			status: function (status: HttpStatusCode | null) {
				if (this.code !== undefined)
					throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this.code}) `);
				this.code = status;
				return this;
			},
			send: function (data: any) {
				this.data = data;
				return this;
			},
			group: {
				status: (status: HttpStatusCode | null) => {
					return response.status.bind(response.group)(status);
				},
				send: function (data: any) {
					return response.send.bind(response.group)(data);
				},
			},
			othersInGroup: {
				status: (status: HttpStatusCode | null) => {
					return response.status.bind(response.othersInGroup)(status);
				},
				send: function (data: any) {
					return response.send.bind(response.othersInGroup)(data);
				},
			},
		};
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message[method]);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++)
					await store[i].callbacks[j]({ ...message, ...matched }, response);
				if (response.data !== undefined) break;
			}
			// By default send one acknowledgment
			response.code = response.code === undefined ? 200 : response.code;
		} catch (error) {
			if (error instanceof ApiError) {
				response.data = error.message;
				response.code = error.status;
			} else response.code = response.code === undefined ? 500 : response.code;
			console.log(error);
		}

		if (response.code !== null && message.id !== undefined) {
			socket.send(JSON.stringify({ _id: message.id, data: response.data, status: response.code }));
		}
		if (response.group.data != null || response.group.code != null) {
			groupedClients.method(method, message[method], {
				data: response.group.data,
			});
		}
		if (response.othersInGroup.data != null || response.othersInGroup.code != null) {
			groupedClients.method(method, message[method], {
				data: response.data,
			});
		}
	}
}
