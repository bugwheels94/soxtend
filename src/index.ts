import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { Router } from './router';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { DistributedStore, RedisStore } from './distributedStore';
import { MessageStore } from './storageAdapter';
import { MethodEnum, parseBrowserMessage } from './utils';
import EventEmitter from 'events';
type RestifyServerEvents = 'connection' | 'close';

const onServerSocketInitialized = (socket: Socket, router: Router) => {
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

const onServerSocketCreated = (socket: Socket, router: Router) => {
	const temporary = async ({ data }) => {
		socket.socket.removeEventListener('message', temporary);
		try {
			const parsedData = parseBrowserMessage(data);

			if (parsedData === null) return;
			if (parsedData.method === MethodEnum.META) {
				const connectionId = parsedData.body;
				if (connectionId) {
					socket.setId(connectionId);
					const groups = await router.getGroups(connectionId);
					router.joinGroups(socket, groups);
					onServerSocketInitialized(socket, router);
				} else {
					socket.setId(crypto.randomUUID());
					onServerSocketInitialized(socket, router);
					console.log('wow', parsedData);
					router.listener(parsedData, socket);
				}
			}
		} catch (e) {
			console.log('Cannot parse message from browser!', e);
		}
	};
	socket.socket.addEventListener('message', temporary);
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
			messageStore?: MessageStore;
		}
	) {
		super();
		const { distributedStore } = options;
		this.serverId = crypto.randomUUID();

		Promise.all([
			options.distributedStore ? options.distributedStore.initialize(this.serverId) : undefined,
			options.messageStore ? options.messageStore.initialize(this.serverId) : undefined,
		])
			.then(() => {
				console.log('Stores Initialized!');
				this.rawWebSocketServer = new WebSocket.Server(options);

				this.router = new Router(this.serverId, distributedStore);
				this.router.meta('/connection', async (req, res) => {
					console.log('hahah');
					if (!req.body) {
						// @ts-ignore
						return res.send(res.socket.id, {
							method: 'meta',
							url: '/connection',
						});
					}
					// @ts-ignore
					res.socket.setId(req.body);
				});
				console.log('emitting ready!');
				this.emit('ready');
				this.on('connection', (rawSocket) => {
					console.log('New Connection!');
					const socket = new Socket(rawSocket, options.messageStore);
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
			})
			.catch((e) => console.log(e));
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
export type { RouterRequest, Router, RouterResponse } from './router';
export { RedisMessageStore } from './storageAdapter';
export { RedisStore };
