import WebSocket from 'isomorphic-ws';
import { ClientOptions } from 'ws';
import { Receiver } from './receiver';
import { JsonObject } from './utils';
import { DefaultDeserialize, DefaultSerialize, FlexibleDeserialize, FlexibleSerialize } from './utils';

type SoxtendClientOptions<
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
	serialize?: Serialize;
	deserialize?: Deserialize;
};
type Options<
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> = ClientOptions & SoxtendClientOptions<Deserialize, Serialize>;
class SoxtendClientEvent extends Event {
	detail: any;
	constructor(message: string, data: any) {
		super(message, data);
		this.detail = data;
	}
}
export class SoxtendClient<
	Deserialize extends FlexibleDeserialize = DefaultDeserialize,
	Serialize extends FlexibleSerialize = DefaultSerialize
> extends EventTarget {
	receiver: Receiver;
	lastMessageId?: number;
	connectionId: string = '';
	socket: WebSocket;
	currentReconnectDelay: number = 100;
	url: string;
	private connect(options: Options<Deserialize, Serialize> = {}) {
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], nativeOptions);
		socket.binaryType = 'arraybuffer';
		this.socket = socket;
		socket.addEventListener('open', (e) => this.onWebsocketOpen(e, { socket, firstReconnectDelay, maxReconnectDelay }));
		socket.addEventListener('close', (event) =>
			this.onWebsocketClose(event, { ...nativeOptions, firstReconnectDelay, maxReconnectDelay, socket })
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
	private active: boolean = false;
	onWebsocketOpen(e: WebSocket.Event, options: SoxtendClientOptions<Deserialize, Serialize> & { socket: WebSocket }) {
		this.emit('open', e);
		this.currentReconnectDelay = options.firstReconnectDelay || 0;
		if (!this.socket) return;
		this.socket.send(this.connectionId);
		const newConnection = ({ data }: WebSocket.MessageEvent) => {
			this.connectionId = data.toString();
			this.active = true;
			this.onSocketCreated(options.socket);
			if (this.socket) this.socket.removeEventListener('message', newConnection);
		};
		this.socket.addEventListener('message', newConnection);
	}

	onWebsocketClose(
		event: WebSocket.CloseEvent,
		options: SoxtendClientOptions<Deserialize, Serialize> & { socket: WebSocket }
	) {
		this.active = false;
		if (!event.wasClean) {
			setTimeout(() => {
				this.reconnectToWebsocket(options);
			}, this.currentReconnectDelay);
		}
	}
	reconnectToWebsocket(options: Options<Deserialize, Serialize>) {
		this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 2, options.maxReconnectDelay || 5 * 1000);
		this.connect(options);
	}
	emit(eventName: string, data: any) {
		const event = new SoxtendClientEvent(eventName, data);
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
	// @ts-ignore
	addEventListener(event: 'message', callback: (event: SoxtendClientEvent) => void);
	// @ts-ignore
	addEventListener(method: string, callback: (e?: SoxtendClientEvent) => void): this {
		// @ts-ignore
		super.addEventListener(method, callback);
		return this;
	}
	close() {
		this.socket.close();
	}
	constructor(urlOrSocket: string, options: Options<Deserialize, Serialize>) {
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
		this.url = urlOrSocket;
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;

		this.socket = this.connect(options);
		if (this.serialize({}) instanceof Uint8Array) {
			this.socket.binaryType = 'arraybuffer';
		}
	}
}
export type { ClientRequest } from './client';
export { Client } from './client';
declare global {
	interface WebSocket {
		id: string;
	}
}
