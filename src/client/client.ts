import WebSocket from 'isomorphic-ws';
import { MethodEnum } from './utils';
import { SoxtendClient } from '.';
import { ListenersStore, Receiver } from './receiver';
export type ParsedServerMessage = {
	method: number;
	header: Record<string, string>;
	data: any;
	messageId: number;
	status: number;
	_id: number;
	url: string;
};
export type ClientRequest = {
	body?: any;
	headers?: Record<string, number | string>;
	// if the client is supposed to forget the message after delivery to the server so no promise wrapping. less overhead
	forget?: boolean;
	id?: never;
};
export type ClientPromiseStore = Record<
	string,
	{
		resolve: (value: ParsedServerMessage | PromiseLike<ParsedServerMessage>) => void;
		reject: (value: ParsedServerMessage | PromiseLike<ParsedServerMessage>) => void;
	}
>;

export class Client<MyWebSocketPlus extends SoxtendClient> {
	id: number = 0;
	promiseStore: ClientPromiseStore = {};
	receiver: Receiver;
	constructor(private websocketPlus: MyWebSocketPlus) {
		this.receiver = new Receiver();
		this.websocketPlus.addEventListener('message', ({ detail }) => {
			this.receiver.listener(detail);
			this.listener(detail);
		});
	}
	get addServerResponseListenerFor() {
		return new ListenersStore(this.receiver);
	}
	method(method: MethodEnum, url: string, options: ClientRequest = {}) {
		const { forget, ...remaining } = options;
		let id: number | undefined;
		this.id += 1;
		id = this.id;
		this.websocketPlus.send({
			url,
			method,
			id,
			...remaining,
		});
		if (forget) return null;
		return new Promise<ParsedServerMessage>((resolve, reject) => {
			this.promiseStore[this.id] = { resolve, reject };
		});
	}
	get(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.GET, url, options);
	}
	post(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.POST, url, options);
	}
	put(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.PUT, url, options);
	}
	patch(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.PATCH, url, options);
	}
	delete(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.DELETE, url, options);
	}
	meta(url: string, options?: ClientRequest) {
		return this.method(MethodEnum.META, url, options);
	}
	async listener(message: ParsedServerMessage) {
		// Message is coming from client to router and execution should be skipped
		if (message._id === undefined) return;
		const thisPromise = this.promiseStore[message._id];
		if (!thisPromise) return;
		if (message.status < 300) {
			this.promiseStore[message._id].resolve(message);
		} else if (message.status >= 300) {
			this.promiseStore[message._id].reject(message);
		}
		delete this.promiseStore[message._id];
	}
}
