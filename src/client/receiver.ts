import { MethodEnum, parseServerMessage } from './utils';
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
	callbacks: ReceiverCallback[];
};
export type ReceiverRequest<P extends object = object> = {} & MatchResult<P>;

type Params = Record<string, string>;

export class Receiver {
	store: ReceiverStore = {
		[MethodEnum.GET]: [],
		[MethodEnum.POST]: [],
		[MethodEnum.PUT]: [],
		[MethodEnum.PATCH]: [],
		[MethodEnum.DELETE]: [],
		[MethodEnum.META]: [],
	};
	registerRoute(method: MethodEnum, url: string, ...callbacks: ReceiverCallback[]) {
		this.store[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	get<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.GET, url, ...callbacks);
	}
	put<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.PUT, url, ...callbacks);
	}
	post<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.POST, url, ...callbacks);
	}
	patch<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.PATCH, url, ...callbacks);
	}
	delete<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.DELETE, url, ...callbacks);
	}
	meta<P extends object = Params>(url: string, ...callbacks: ReceiverCallback<P>[]) {
		this.registerRoute(MethodEnum.META, url, ...callbacks);
	}
	async listener(message: Awaited<ReturnType<typeof parseServerMessage>>) {
		// Message is coming from router to client and execution should be skipped
		let store: ReceiverStore[MethodEnum.GET] = this.store[message.method];
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message.url);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++) await store[i].callbacks[j](matched, { ...message });
			}
		} catch (error) {}
	}
}
