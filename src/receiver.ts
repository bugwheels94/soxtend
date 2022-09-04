import { Method } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
export type ReceiverStore = Record<Method, ReceiverRoute[]>;

/**
 * Simlar Socket means sockets with same socket.id
 */
export type ReceiverResponse = {
	data?: any | null;
	get?: string;
	post?: string;
	put?: string;
	patch?: string;
	delete?: string;
};
export type ReceiverCallback<P extends object = object> = (
	request: ReceiverRequest<P>,
	response: ReceiverResponse
) => void;
export type ReceiverRoute = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: ReceiverCallback[];
};
export type ReceiverRequest<P extends object = object> = {} & MatchResult<P>;

type Params = Record<string, string | number>;

export class Receiver {
	store: ReceiverStore = {
		get: [],
		post: [],
		put: [],
		patch: [],
		delete: [],
	};
	registerRoute(method: Method, url: string, ...callbacks: ReceiverCallback[]) {
		this.store[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	get<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute('get', url, ...callbacks);
	}
	put<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute('put', url, ...callbacks);
	}
	post<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute('post', url, ...callbacks);
	}
	patch<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute('patch', url, ...callbacks);
	}
	delete<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute('delete', url, ...callbacks);
	}
	async listener(message: ReceiverResponse) {
		// Message is coming from router to client and execution should be skipped
		let store: ReceiverStore['get'];
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
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message[method]);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++) await store[i].callbacks[j](matched, { ...message });
			}
		} catch (error) {}
	}
}
