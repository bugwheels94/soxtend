import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { SoxtendServer, InMemoryMessageDistributor, Router } from '../dist/esm/index.js';
import { SoxtendClient, Client } from '../dist/esm/client/index.js';
let server;
class CustomEventMock extends Event {
	constructor(eventType, eventInit = {}) {
		super(eventType, eventInit);
		this.detail = eventInit.detail;
	}
}

global.CustomEvent = CustomEventMock;
global.crypto = require('crypto');
beforeAll(() => {
	console.log('Starting Server');
	server = new SoxtendServer({
		port: 2000,
		distributor: new InMemoryMessageDistributor(),
	});
	// server.addListener("connection", socket => {
	//   console.log("connection made on server side");
	//   socket.send({
	//     "server": "Sending first message on connect"
	//   })
	//   socket.addListener("message", (data)=> {
	//     console.log('received from client:', data, typeof data);
	//     socket.send({
	//       server: "sending second message"
	//     });

	//   })
	// })
	const router = new Router(server);
	router.get('/resource/:resourceId', async (req, res) => {
		res.send({ server: 'sending response' });
		res.joinGroup('all').then(() => {
			console.log('JOINED GROUP');
			res.group('all').send(
				{ server: 'sending by itself' },
				{
					url: '/sent-from-server',
				}
			);
		});
		console.log('Received Request', req);
	});
	// Start your server here
});

afterAll(() => {
	console.log('Closing Server');
	server.rawWebSocketServer.close(() => {});
	// Stop the server here
});
describe('sum module', () => {
	const ws = new SoxtendClient('ws://127.0.0.1:2000');
	console.log(Client);
	const fetch = new Client(ws);
	// ws.('error', console.error);

	// ws.on('open', function open() {
	//   ws.send('something');
	// });
	test('adds 1 + 2 to equal 3', () => {
		expect.assertions(1);
		let count = 0;
		return new Promise((resolve) => {
			ws.addEventListener('open', () => {
				console.log('connection made on client side');
				fetch.addServerResponseListenerFor.get('/sent-from-server', (req, res) => {
					console.log('Received SSD', req, res);
					count++;
					expect(1).toBe(1);
					ws.close();
					resolve(true);
				});
				fetch
					.get('/resource/1', {
						body: { client: 'sending data along with request' },
					})
					.then((response) => {
						console.log('received response', response);
					});
				// ws.send( {"client": "sending first message message"} )
			});
			// ws.addEventListener('message', function message(data) {
			//   count++
			//   console.log('received from server:', data.detail);
			//   if (count === 2) {
			//     resolve(true);
			//     ws.close()
			//     expect(2).toBe(2);
			//   }
			// });
		});
	});
});
