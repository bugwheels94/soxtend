const express = require('express');
const ws = require('ws');
const path = require('path');
const app = express();

// Set up a headless websocket server that prints any
// events that come in.
const wsServer = new ws.Server({ noServer: true });
wsServer.on('connection', (socket) => {
	socket.on('message', (message, isBinary) => {
		console.log(message instanceof ArrayBuffer, 'isArrayBuffer', message.constructor);
		if (message instanceof Buffer) {
			console.log('Received', { message, value: message.toString(), type: typeof message, isBinary });
		} else if (typeof message === 'string') {
			// Process the string data here
			console.log('Received String:', { message, isBinary });
		}
	});
	setInterval(() => {
		socket.send('string message');
		socket.send(new Uint8Array([0, 1, 2]));

		const buffer = new ArrayBuffer(4); // Create a buffer
		const view = new DataView(buffer);
		view.setInt32(0, 12345); // Write some data into the buffer
		socket.send(buffer);
	}, 5 * 1000);
});

// `server` is a vanilla Node.js HTTP server, so use
// the same ws upgrade process described here:
// https://www.npmjs.com/package/ws#multiple-servers-sharing-a-single-https-server
const server = app.listen(9107);
server.on('upgrade', (request, socket, head) => {
	wsServer.handleUpgrade(request, socket, head, (socket) => {
		wsServer.emit('connection', socket, request);
	});
});
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, './index.html'));
});
