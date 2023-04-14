import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { Router } from './router';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { MessageDistributor, InMemoryMessageDistributor } from './distributor';
// import { MessageStore } from './messageStore';
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
			distributor?: MessageDistributor;
			// messageStore?: MessageStore;
		}
	) {
		super();
		const { distributor } = options;
		this.serverId = crypto.randomUUID();

		Promise.all([
			options.distributor ? options.distributor.initialize(this.serverId) : undefined,
			// options.messageStore ? options.messageStore.initialize(this.serverId) : undefined,
		])
			.then(() => {
				this.rawWebSocketServer = new WebSocket.Server(options);

				this.router = new Router(this.serverId, distributor);
				this.router.meta('/connection', async (req, res) => {
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
				this.emit('ready');
				this.on('connection', (rawSocket) => {
					const socket = new Socket(rawSocket);
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
export { InMemoryMessageDistributor };
