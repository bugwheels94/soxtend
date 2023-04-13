import WebSocket from 'isomorphic-ws';
import { DataType, MethodEnum, parseServerMessage } from './utils';
type ParsedServerMessage = Awaited<ReturnType<typeof parseServerMessage>>;
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

export class Client {
	id: number = 0;
	socket: WebSocket;
	promiseStore: ClientPromiseStore = {};
	pendingMessageStore: Uint8Array[] = [];

	method(method: MethodEnum, url: string, options: ClientRequest = {}) {
		let socket: WebSocket, message: Uint8Array;
		const { forget, ...remaining } = options;
		let id: number | undefined;
		this.id += 1;
		id = this.id;
		message = createMessageForServer(url, method, id, remaining);
		socket = this.socket;

		if (socket.CONNECTING === socket.readyState) {
			this.pendingMessageStore.push(message);
		} else {
			socket.send(message);
		}
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
	onSocketCreated(socket: WebSocket) {
		this.socket = socket;
		socket.addEventListener('open', () => {
			this.pendingMessageStore.map((message) => socket.send(message));
			this.pendingMessageStore = [];
		});
	}
	async listener(message: ParsedServerMessage) {
		// Message is coming from client to router and execution should be skipped
		if (message.respondingMessageId === undefined) return;
		// @ts-ignore
		window.ankit = this.promiseStore;
		if (message.status < 300) {
			this.promiseStore[message.respondingMessageId].resolve(message);
		} else if (message.status >= 300) {
			this.promiseStore[message.respondingMessageId].reject(message);
		}
		delete this.promiseStore[message.respondingMessageId];
	}
}

const encoder = new TextEncoder();
export function createMessageForServer(
	url: string | undefined,
	method: MethodEnum,
	id: number | undefined,
	options?: ClientRequest
) {
	/**
	 * Format of message:
	 * To Other Servers
	 * (NBitGrouporConnectionId):[ToBrowser But without empty 24bits prefix]
	 * To Server From Browser
	 * (8BitMethod)(8BitIsIdPresent)(8BitIsHeaderPresent)(16BitRequestId)(16BitURLLength)(URL)(16BitHeaderLength)(Header)(8BitBodytype)(Body)
	 *
	 */
	const finalOptions = options || {};
	const { headers, body } = finalOptions;
	const headerEncoded = headers ? encoder.encode(JSON.stringify(headers)) : '';

	let binaryPayload: Uint8Array | undefined = undefined;
	let bodyType: null | DataType = null;
	if (body instanceof Uint8Array) {
		binaryPayload = body;
		bodyType = DataType.BINARY;
	} else if (typeof body === 'string') {
		bodyType = DataType.TEXT;
		binaryPayload = encoder.encode(body);
	} else if (body) {
		bodyType = DataType.JSON;
		binaryPayload = encoder.encode(JSON.stringify(body));
	}
	const urlEncoded = encoder.encode(url);

	const dataLength =
		1 +
		1 +
		1 +
		(id === undefined ? 0 : 2) +
		2 +
		urlEncoded.length +
		(headerEncoded ? 2 + headerEncoded.length : 0) +
		(binaryPayload ? binaryPayload.length + 1 : 0);
	// Concating TypedArray isfaster than concatting strings
	const finalMessage = new Uint8Array(dataLength);
	let filledLength = 0;
	finalMessage[0] = method;
	if (id !== undefined) {
		finalMessage[1] = 1;
	}

	if (headerEncoded) {
		finalMessage[2] = 1;
	}
	filledLength += 3;

	if (id !== undefined) {
		finalMessage[filledLength++] = Math.floor(id / 255);
		finalMessage[filledLength++] = id % 255;
	}
	const urlLength = urlEncoded.length;
	if (urlLength > 255) {
		finalMessage[filledLength++] = Math.floor(urlLength / 255);
	} else finalMessage[filledLength++] = 0;
	finalMessage[filledLength++] = urlLength % 255;

	finalMessage.set(urlEncoded, filledLength);
	filledLength += urlEncoded.length;
	if (headerEncoded) {
		const headerLength = headerEncoded.length;
		if (headerLength > 255) {
			finalMessage[filledLength++] = Math.floor(headerLength / 255);
		} else finalMessage[filledLength++] = 0;
		finalMessage[filledLength++] = headerLength % 255;

		finalMessage.set(headerEncoded, filledLength);
		filledLength += headerEncoded.length;
	}

	if (bodyType !== null) {
		finalMessage[filledLength++] = bodyType;
		finalMessage.set(binaryPayload, filledLength);
	}
	return finalMessage;
}
