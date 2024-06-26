import { ParsedServerMessage } from './client';
import { Method, MethodEnum } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
export type ReceiverStore = Record<MethodEnum, ReceiverRoute[]>;

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
) => Promise<void> | void;
export type ReceiverRoute = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: ReceiverCallback<any>[];
};
export type ReceiverRequest<P extends object = object> = {} & MatchResult<P>;

type Params = Record<string, string>;

export class ListenersStore {
	private id: number;
	constructor(private receiver: Receiver) {
		this.id = receiver.lastListenerId++;
	}
	get<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.GET, url, this.id, ...callbacks);
		return this;
	}
	put<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.PUT, url, this.id, ...callbacks);
		return this;
	}
	post<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.POST, url, this.id, ...callbacks);
		return this;
	}
	patch<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.PATCH, url, this.id, ...callbacks);
		return this;
	}
	delete<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.DELETE, url, this.id, ...callbacks);
		return this;
	}
	meta<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.receiver.registerRoute(MethodEnum.META, url, this.id, ...callbacks);
		return this;
	}
	stopListening() {
		this.receiver.clearChain(this.id);
	}
	removeListener(method: MethodEnum, callback: ReceiverCallback) {
		this.receiver.store[method] = this.receiver.store[method].map((route: ReceiverRoute) => {
			if (route.callbacks.includes(callback)) {
				route.callbacks = route.callbacks.filter((c) => c !== callback);
			}
			return route;
		});
	}
}
export class Receiver {
	chainInfo: Record<string, any[]> = {};
	lastListenerId = 1;
	store: ReceiverStore = {
		[MethodEnum.GET]: [],
		[MethodEnum.POST]: [],
		[MethodEnum.PUT]: [],
		[MethodEnum.PATCH]: [],
		[MethodEnum.DELETE]: [],
		[MethodEnum.META]: [],
	};
	registerRoute<T extends object>(method: MethodEnum, url: string, chain: number, ...callbacks: ReceiverCallback<T>[]) {
		this.chainInfo[chain] = this.chainInfo[chain] || [];
		this.chainInfo[chain].push({
			method,
			callbacks,
		});
		this.store[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	clearChain(chainName: number) {
		this.chainInfo[chainName]?.forEach((route) => {
			const method: MethodEnum = route.method;
			this.store[method] = this.store[method].filter((r: ReceiverRoute) => r.callbacks !== route.callbacks);
		});
		delete this.chainInfo[chainName];
	}
	async listener(message: Omit<ParsedServerMessage, '_id'>) {
		// Message is coming from router to client and execution should be skipped
		if ('_id' in message) return;
		const method: MethodEnum = message.method;

		let store: ReceiverStore[MethodEnum.GET] = this.store[method];
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message.url);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++) await store[i].callbacks[j](matched, { ...message });
			}
		} catch (error) {}
	}
}
