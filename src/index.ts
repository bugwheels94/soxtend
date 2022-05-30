import WebSocket from 'isomorphic-ws';
import { Client } from './client';
import { Router } from './router';
import { store } from './utils';
import { ClientOptions } from 'ws';
type X = WebSocket | string;
type WebSocketPlusOptions = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
};
type Options = ClientOptions & WebSocketPlusOptions;

class RestifyWebSocket<T extends X> {
	client: Client;
	router: Router;
	socket: WebSocket;
	currentReconnectDelay: number = 100;
	url: string;
	eventStore: Record<
		'open' | 'close' | 'message' | 'error',
		{
			listener: (e?: any) => void;
			options?: WebSocket.EventListenerOptions;
		}
	>;
	connect(options: Options = {}) {
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], options);
		this.socket = socket;
		for (let event in this.eventStore) {
			const eventEntry = this.eventStore[event];
			socket.addEventListener(event, eventEntry.listener, eventEntry.options);
		}

		socket.addEventListener('open', () => this.onWebsocketOpen({ firstReconnectDelay, maxReconnectDelay }));
		socket.addEventListener('close', () =>
			this.onWebsocketClose({ ...nativeOptions, firstReconnectDelay, maxReconnectDelay })
		);
		this.attachSocket(socket);
		return socket;
	}
	attachSocket(socket: WebSocket) {
		this.client.attachSocket(socket);
		this.router.attachSocket(socket);
		socket.addEventListener('message', ({ data }) => {
			try {
				const message = JSON.parse(data.toString());
				this.router.listener(message);
				this.client.listener(message);
			} catch (e) {
				console.log('Cannot parse message into JSON!', data.toString());
			}
		});
	}
	onWebsocketOpen(options: WebSocketPlusOptions) {
		console.log('SSS');
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
		this.eventStore[method] = this.eventStore[method] || {
			listener,
			options,
		};
	}
	constructor(urlOrSocket: T, options?: T extends string ? WebSocketPlusOptions : Options) {
		this.client = new Client();
		this.router = new Router();
		let socket: WebSocket;
		if (typeof urlOrSocket === 'string') {
			this.url = urlOrSocket;
			socket = this.connect(options);
		} else {
			socket = urlOrSocket;
			this.attachSocket(socket);
		}
		if ('id' in socket) store[socket['id']] = socket;
		this.socket = socket;
	}
	onConnect(cb: () => void) {
		if (this.socket.readyState === WebSocket.OPEN) return cb();
		this.socket.addEventListener('open', cb);
	}
}
export type { ClientResponse, ClientRequest, MessageData } from './utils';
export { RestifyWebSocket };
