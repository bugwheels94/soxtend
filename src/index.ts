import WebSocket from 'isomorphic-ws';
import { Client, ServerClient, ServerClients } from './client';
import { Router } from './router';
import { ClientOptions, ServerOptions } from 'ws';
import { RedisClientType } from 'redis';
import { Receiver } from './receiver';
type X = WebSocket | string;
type WebSocketPlusOptions = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
};
type Options = ClientOptions & WebSocketPlusOptions;
type Events = 'open' | 'close' | 'message' | 'error';
type RestifyServerEvents = 'connection' | 'close';

const onSocketCreated = (socket: WebSocket, router: Receiver, client: Client) => {
	client.onSocketCreated(socket);
	socket.addEventListener('message', ({ data }) => {
		try {
			const message = JSON.parse(data.toString());
			router.listener(message);
			if (client instanceof Client) client.listener(message);
		} catch (e) {
			console.log('Cannot parse message into JSON!', data.toString());
		}
	});
};
const onServerSocketCreated = (socket: WebSocket, router: Router) => {
	socket.addEventListener('message', ({ data }) => {
		try {
			const message = JSON.parse(data.toString());
			router.listener(message, socket);
		} catch (e) {
			console.log('Cannot parse message into JSON!', data.toString());
		}
	});
};
class RestifyWebSocket<T extends X> {
	static Server = class {
		eventStore: Record<
			RestifyServerEvents,
			{
				listener: (e?: any) => void;
			}[]
		> = {
			connection: [],
			close: [],
		};
		constructor(
			options: ServerOptions & {
				redisClient?: RedisClientType;
			}
		) {
			const { redisClient, ...serverOptions } = options;
			this.server = new WebSocket.Server(serverOptions);
			this.router = new Router();
			this.router.clients = this.clients;
			this.server.on('connection', (socket) => {
				const client = this.clients.add(socket);
				onServerSocketCreated(socket, this.router);
				const connectionEvents = this.eventStore['connection'] || [];
				connectionEvents.forEach(({ listener }) => {
					listener({ client, socket });
				});
				socket.addEventListener('close', () => {
					const connectionEvents = this.eventStore['connection'] || [];
					connectionEvents.forEach(({ listener }) => {
						listener({ client, socket });
					});
					this.clients.remove(socket);
				});
			});
		}
		addEventListener(
			method: 'connection',
			listener: (event: { client: ServerClient; socket: WebSocket }) => void
		): void;
		addEventListener(method: 'close', listener: (event: { client: ServerClient; socket: WebSocket }) => void): void;

		addEventListener(method: string, listener: (e?: any) => void) {
			this.eventStore[method] = this.eventStore[method] || [];
			this.eventStore[method].push({
				listener,
			});
		}
		server: WebSocket.Server;
		router: Router;
		clients: ServerClients = new ServerClients();
	};
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
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], options);
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
			socket = this.connect(options);
		} else {
			socket = urlOrSocket;
			this.onSocketCreated(socket);
		}
		this.socket = socket;
	}
	onConnect(cb: () => void) {
		if (this.socket.readyState === WebSocket.OPEN) return cb();
		this.socket.addEventListener('open', cb);
	}
}
export type { ClientResponse, ClientRequest, Client } from './client';
export type { RouterResponse, RouterRequest, Router } from './router';
export { RestifyWebSocket };
