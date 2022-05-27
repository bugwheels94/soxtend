import WebSocket from 'isomorphic-ws';
import { Client } from './client';
import { Router } from './router';
import { store } from './utils';

class WebSocketPlus {
	client: Client;
	router: Router;
	socket: WebSocket;
	constructor(socket: WebSocket) {
		this.client = new Client(socket);
		this.router = new Router(socket);
		if ('id' in socket) store[socket['id']] = socket;
		this.socket = socket;
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
	onConnect(cb: () => void) {
		if (this.socket.readyState === WebSocket.OPEN) return cb();
		this.socket.addEventListener('open', cb);
	}
}
export type { ClientResponse, ClientRequest, MessageData } from './utils';
export { WebSocketPlus };
