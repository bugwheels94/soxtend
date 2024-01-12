import WebSocket from 'isomorphic-ws';
import { ClientOptions } from 'ws';
import { Receiver } from './receiver';
import { JsonObject } from './utils';
import { DefaultDeserialize, DefaultSerialize, FlexibleDeserialize, FlexibleSerialize } from './utils';

export type X = WebSocket | string;
type SoxtendClientOptions<
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
	connectWithDelay?: number;
	serialize?: Serialize;
	deserialize?: Deserialize;
};
type Options<
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> = ClientOptions & SoxtendClientOptions<Deserialize, Serialize>;

export class SoxtendClient<
	T extends X,
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> extends EventTarget {
	receiver: Receiver;
	lastMessageId?: number;
	connectionId: string;
	socket: WebSocket;
	currentReconnectDelay: number = 100;
	url: string;
	private connect(options: Options<Deserialize, Serialize> = {}) {
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], nativeOptions);
		socket.binaryType = 'arraybuffer';
		this.socket = socket;
		socket.addEventListener('open', () => this.onWebsocketOpen({ socket, firstReconnectDelay, maxReconnectDelay }));
		socket.addEventListener('close', (event) =>
			this.onWebsocketClose({ event, ...nativeOptions, firstReconnectDelay, maxReconnectDelay, socket })
		);
		return socket;
	}
	onSocketCreated(socket: WebSocket) {
		// this.client.onSocketCreatedMeta(socket);
		this.pendingMessageStore.map((message) => socket.send(message));
		this.pendingMessageStore = [];
		socket.addEventListener('message', ({ data }) => {
			try {
				// @ts-ignore
				const message = this.deserialize(data);

				this.emit('message', message);
				// this.receiver.listener(message);
				// this.client.listener(message);
			} catch (e) {
				console.error('Cannot parse message into JSON in browser!', e, data);
			}
		});
	}
	private active: boolean;
	onWebsocketOpen(options: SoxtendClientOptions<Deserialize, Serialize> & { socket: WebSocket }) {
		this.emit('open', '');
		this.currentReconnectDelay = options.firstReconnectDelay;
		// this.client.setSocket(options.socket);
		this.socket.send(this.connectionId || '');
		const newConnection = ({ data }) => {
			this.connectionId = data;
			this.active = true;
			this.onSocketCreated(options.socket);
			this.socket.removeEventListener('message', newConnection);
		};
		this.socket.addEventListener('message', newConnection);
		if (this.lastMessageId) this.socket;
	}

	onWebsocketClose(
		options: SoxtendClientOptions<Deserialize, Serialize> & { socket: WebSocket; event: WebSocket.CloseEvent }
	) {
		this.socket = null;
		if (!options.event.wasClean) {
			setTimeout(() => {
				this.reconnectToWebsocket(options);
			}, this.currentReconnectDelay);
		}
	}
	reconnectToWebsocket(options: Options<Deserialize, Serialize>) {
		this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 2, options.maxReconnectDelay);
		this.connect(options);
	}
	emit(eventName: string, data: any) {
		const event = new CustomEvent(eventName, { detail: data });
		this.dispatchEvent(event);
	}
	pendingMessageStore: ReturnType<Serialize>[] = [];

	private serialize: Serialize;
	private deserialize: Deserialize;
	send(message: Parameters<Serialize>[0]) {
		const s = this.serialize(message);
		if (!this.active || this.socket.CONNECTING === this.socket.readyState) {
			// @ts-ignore
			this.pendingMessageStore.push(s);
		} else {
			this.socket.send(s);
		}
	}
	addEventListener(event: 'message', callback: (event: CustomEvent) => void);
	addEventListener(method: string, listener: (e?: CustomEvent) => void): this {
		super.addEventListener(method, listener);
		return this;
	}
	close() {
		this.socket.close();
	}
	constructor(
		urlOrSocket: T,
		options: T extends string ? SoxtendClientOptions<Deserialize, Serialize> : Options<Deserialize, Serialize> = {}
	) {
		super();

		this.receiver = new Receiver();
		const { serialize, deserialize } = options;
		this.serialize = serialize || (((string) => JSON.stringify(string)) as Serialize);
		// @ts-ignore
		this.deserialize =
			deserialize ||
			((string: string) => {
				return JSON.parse(string) as JsonObject;
			});

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
			this.onWebsocketOpen({ ...options, socket });
		}
		if (this.serialize({}) instanceof Uint8Array) {
			socket.binaryType = 'arraybuffer';
		}

		if (options.connectWithDelay) return;
		this.socket = socket;
	}
}
export type { ClientRequest } from './client';
export { Client } from './client';
declare global {
	interface WebSocket {
		id: string;
	}
}
