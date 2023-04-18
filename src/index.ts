import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { Router } from './router';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { MessageDistributor, InMemoryMessageDistributor } from './distributor';
// import { MessageStore } from './messageStore';
import { parseBrowserMessage } from './utils';
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
					const socket = res.socket as Socket;
					let connectionId: string;
					if (!req.body) {
						connectionId = crypto.randomUUID();
						// @ts-ignore
						socket.setId(connectionId);
					} else {
						connectionId = req.body;
						socket.setId(connectionId);
						const groups = await this.router.getGroups(connectionId);
						this.router.joinGroups(groups, socket);
					}
					res.send(connectionId);
					this.router.newConnectionInitialized(socket);
				});
				this.emit('ready');
				this.on('connection', (rawSocket) => {
					const socket = new Socket(rawSocket);
					onServerSocketInitialized(socket, this.router);
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
