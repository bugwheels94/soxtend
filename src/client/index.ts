import WebSocket from 'isomorphic-ws';

type SoxtendClientOptions = {
	firstReconnectDelay?: number;
	maxReconnectDelay?: number;
};
type Options = SoxtendClientOptions;

export class SoxtendClient extends EventTarget {
	lastMessageId?: number;
	connectionId: string = '';
	socket: WebSocket;
	currentReconnectDelay: number = 100;
	url: string;
	private connect(options: Options = {}) {
		const { firstReconnectDelay = 100, maxReconnectDelay = 30000, ...nativeOptions } = options;
		const socket: WebSocket = new WebSocket(this.url, this.url.split(':')[0], nativeOptions);
		this.socket = socket;
		socket.addEventListener('open', (e) => this.onWebsocketOpen(e, { socket, firstReconnectDelay, maxReconnectDelay }));
		socket.addEventListener('close', (event) => {
			this.onWebsocketClose(event, { ...nativeOptions, firstReconnectDelay, maxReconnectDelay, socket });
			this.emit('close');
		});
		return socket;
	}
	private onSocketCreated(socket: WebSocket) {
		// this.client.onSocketCreatedMeta(socket);
		this.pendingMessageStore.map((message) => socket.send(message));
		this.pendingMessageStore = [];
		socket.addEventListener('message', ({ data }) => {
			try {
				this.emit('message', data);

				// this.receiver.listener(message);
				// this.client.listener(message);
			} catch (e) {
				console.error('Cannot parse message into JSON in browser!', e, data);
			}
		});
	}
	private active: boolean = false;
	private onWebsocketOpen(e: WebSocket.Event, options: SoxtendClientOptions & { socket: WebSocket }) {
		this.currentReconnectDelay = options.firstReconnectDelay || 0;
		if (!this.socket) return;
		this.emit('open', e);
		this.active = true;
		this.onSocketCreated(options.socket);
	}

	private onWebsocketClose(event: WebSocket.CloseEvent, options: SoxtendClientOptions & { socket: WebSocket }) {
		this.active = false;
		if (!event.wasClean) {
			setTimeout(() => {
				this.reconnectToWebsocket(options);
			}, this.currentReconnectDelay);
		}
	}
	private reconnectToWebsocket(options: Options) {
		this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 2, options.maxReconnectDelay || 5 * 1000);
		this.connect(options);
	}
	private emit(eventName: string, data?: any) {
		this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
	}
	private pendingMessageStore: WebSocket.Data[] = [];
	// @ts-ignore
	addEventListener(type: 'message', listener: (evt: CustomEvent<WebSocket.Data>) => void): void;
	addEventListener(type: 'open', listener: () => void): void;
	addEventListener(type: 'close', listener: () => void): void;
	addEventListener(type: 'error', listener: (evt: CustomEvent<Error>) => void): void {
		super.addEventListener(type, listener as EventListener);
	}

	// @ts-ignore
	removeEventListener(type: 'message', listener: (evt: CustomEvent<WebSocket.Data>) => void): void;
	removeEventListener(type: 'open', listener: () => void): void;
	removeEventListener(type: 'close', listener: () => void): void;
	removeEventListener(type: 'error', listener: (evt: CustomEvent<Error>) => void): void {
		// @ts-ignore
		super.removeEventListener(type, listener);
	}

	send(message: WebSocket.Data) {
		if (!this.active || this.socket.CONNECTING === this.socket.readyState) {
			// @ts-ignore
			this.pendingMessageStore.push(message);
		} else {
			this.socket.send(message);
		}
	}

	close() {
		this.socket.close();
	}
	constructor(urlOrSocket: string, options: Options) {
		super();

		// @ts-ignore

		let socket: WebSocket;
		this.url = urlOrSocket;

		this.socket = this.connect(options);
	}
}
declare global {
	interface WebSocket {
		id: string;
	}
}
