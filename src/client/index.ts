import WebSocket from 'isomorphic-ws';
import { Client } from './client';
import { ClientOptions } from 'ws';
import { Receiver } from './receiver';
import { parseServerMessage } from './utils';

type X = WebSocket | string;
type WebSocketPlusOptions = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
	connectWithDelay?: number;
};
type Options = ClientOptions & WebSocketPlusOptions;
type Events = 'open' | 'close' | 'message' | 'error';

const onSocketCreated = (socket: WebSocket, router: Receiver, client: Client) => {
	client.onSocketCreated(socket);
	socket.addEventListener('message', async ({ data }) => {
		try {
			const message = await parseServerMessage(data);
			console.log('Received', message);
			router.listener(message);
			if (client instanceof Client) client.listener(message);
		} catch (e) {
			console.log('Cannot parse message into JSON!', e, data);
		}
	});
};

class RestifyWebSocket<T extends X> {
	client: Client;
	receiver: Receiver;
	socket: WebSocket;
	currentReconnectDelay: number = 100;
	url: string;
	eventStore: Record<
		Events,
		{
			listener: (e?: any) => void;
			options?: WebSocket.EventListenerOptions;
		}[]
	>;
	connect(options: Options = {}) {
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], nativeOptions);
		this.socket = socket;
		let event: Events;
		for (event in this.eventStore) {
			const eventEntry = this.eventStore[event];
			// @ts-ignore
			socket.addEventListener(event, eventEntry.listener, eventEntry.options);
		}

		socket.addEventListener('open', () => this.onWebsocketOpen({ firstReconnectDelay, maxReconnectDelay }));
		socket.addEventListener('close', () =>
			this.onWebsocketClose({ ...nativeOptions, firstReconnectDelay, maxReconnectDelay })
		);
		this.onSocketCreated(socket);
		return socket;
	}
	onSocketCreated(socket: WebSocket) {
		onSocketCreated(socket, this.receiver, this.client);
	}
	onWebsocketOpen(options: WebSocketPlusOptions) {
		this.currentReconnectDelay = options.firstReconnectDelay;
	}

	onWebsocketClose(options: WebSocketPlusOptions) {
		this.socket = null;
		setTimeout(() => {
			this.reconnectToWebsocket(options);
		}, this.currentReconnectDelay);
	}
	reconnectToWebsocket(options: Options) {
		this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 2, options.maxReconnectDelay);
		this.connect(options);
	}
	addEventListener(
		method: 'message',
		listener: (event: { data: any; type: string; target: WebSocket }) => void,
		options?: WebSocket.EventListenerOptions
	): void;
	addEventListener(
		method: 'close',
		listener: (event: { wasClean: boolean; code: number; reason: string; target: WebSocket }) => void,
		options?: WebSocket.EventListenerOptions
	): void;
	addEventListener(
		method: 'error',
		listener: (event: { error: any; message: any; type: string; target: WebSocket }) => void,
		options?: WebSocket.EventListenerOptions
	): void;
	addEventListener(
		method: 'open',
		listener: (event: { target: WebSocket }) => void,
		options?: WebSocket.EventListenerOptions
	): void;
	addEventListener(method: string, listener: (e?: any) => void, options?: WebSocket.EventListenerOptions) {
		this.eventStore[method] = this.eventStore[method] || [];
		this.eventStore[method].push({
			listener,
			options,
		});
	}
	constructor(urlOrSocket: T, options?: T extends string ? WebSocketPlusOptions : Options) {
		this.client = new Client();
		this.receiver = new Receiver();
		let socket: WebSocket;
		if (typeof urlOrSocket === 'string') {
			this.url = urlOrSocket;
			if (options.connectWithDelay) {
				setTimeout(() => {
					socket = this.connect(options);
				}, options.connectWithDelay);
			} else socket = this.connect(options);
		} else {
			socket = urlOrSocket;
			this.onSocketCreated(socket);
		}
		if (options.connectWithDelay) return;
		this.socket = socket;
	}
	onConnect(cb: () => void) {
		if (this.socket.readyState === WebSocket.OPEN) return cb();
		this.socket.addEventListener('open', cb);
	}
}
export type { ClientRequest, Client } from './client';
export { RestifyWebSocket };
declare global {
	interface WebSocket {
		id: string;
	}
}
