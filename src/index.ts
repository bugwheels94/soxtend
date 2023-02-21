import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { Router } from './router';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { DistributedStore } from './distributedStore';
import { parseBrowserMessage } from './utils';
import EventEmitter from 'events';
type RestifyServerEvents = 'connection' | 'close';

const onServerSocketCreated = (socket: Socket, router: Router) => {
	socket.socket.addEventListener('message', ({ data }) => {
		try {
			const parsedData = parseBrowserMessage(data);
			if (parsedData === null) return;
			router.listener(parsedData, socket);
		} catch (e) {
			console.log('Cannot parse message from browser!', e);
		}
	});
};

declare global {
	interface WebSocket {
		id: string;
		groups: string[];
	}
}

export class RestifyWebSocketServer extends EventEmitter {
	serverId: string;
	rawWebSocketServer: WebSocket.Server;
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
			distributedStore?: DistributedStore;
		}
	) {
		super();
		this.rawWebSocketServer = new WebSocket.Server(options);
		const { distributedStore } = options;
		this.serverId = crypto.randomUUID();

		if (options.distributedStore) {
			options.distributedStore.initialize(this.serverId).then(() => {
				this.router = new Router(this.serverId, distributedStore);
				this.emit('ready');
			});
		}

		this.router = new Router(this.serverId);
		this.on('connection', (rawSocket) => {
			const socket = new Socket(rawSocket);
			// @ts-ignore
			if (rawSocket.groups) {
				// @ts-ignore
				rawSocket.groups.forEach((group) => {
					this.router.joinGroup(group, socket);
				});
			}
			onServerSocketCreated(socket, this.router);
			const connectionEvents = this.eventStore['connection'] || [];
			connectionEvents.forEach(({ listener }) => {
				listener({ socket });
			});
			rawSocket.addEventListener('close', () => {
				const connectionEvents = this.eventStore['connection'] || [];
				connectionEvents.forEach(({ listener }) => {
					listener({ socket });
				});
				// this.socketGroupStore.remove(socket);
			});
		});
	}
	addEventListener(method: 'connection', listener: (event: { client: Socket; socket: WebSocket }) => void): void;
	addEventListener(method: 'close', listener: (event: { client: Socket; socket: WebSocket }) => void): void;

	addEventListener(method: string, listener: (e?: any) => void) {
		this.eventStore[method] = this.eventStore[method] || [];
		this.eventStore[method].push({
			listener,
		});
	}
	router: Router;
}
export type { RouterRequest, Router } from './router';
