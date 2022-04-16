import WebSocket from 'isomorphic-ws';
import { Client } from './client';
import { Router } from './router';

export class WebsocketPlus {
	client: Client;
	router: Router;
	socket: WebSocket.WebSocket;
	constructor(socket: WebSocket.WebSocket) {
		this.client = new Client(socket);
		this.router = new Router(socket);
		this.socket = socket;
		socket.addEventListener('message', (data) => {
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
