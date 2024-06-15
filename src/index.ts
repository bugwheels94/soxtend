import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { ServerOptions } from 'ws';
import { MessageDistributor } from './distributor';
import EventEmitter from 'events';
import { IndividualSocketConnectionStore, SocketGroupStore } from './localStores';
import { AllowedType, DataMapping, Deserialize, JsonObject, Serialize } from './utils';
import { nanoid } from 'nanoid';
type SoxtendServerEvents = 'connection' | 'close';
declare global {
	interface WebSocket {
		id: string;
		groups: string[];
	}
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export class SoxtendServer<MessageType extends AllowedType = 'string'> extends EventEmitter {
	id: string;
	rawWebSocketServer: WebSocket.Server;
	distributor: MessageDistributor<MessageType, any>;
	eventStore: Record<
		SoxtendServerEvents,
		{
			listener: (e?: any) => void;
		}[]
	> = {
		connection: [],
		close: [],
	};
	socketGroupStore: SocketGroupStore<MessageType>;
	individualSocketConnectionStore: IndividualSocketConnectionStore<MessageType>;
	async sendToIndividual(id: string, message: WebSocket.Data) {
		if (typeof message === 'string') {
			const socket = this.individualSocketConnectionStore.find(id);
			if (socket) {
				socket.rawSocket.send(message);
				return;
			}
			if (!this.distributor) return;
			const serverId = id.slice(0, 21);
			const messageWithGroupId = id + ':' + message;
			//@ts-ignore
			this.distributor.enqueue(`${serverId}`, messageWithGroupId);
		} else if (message instanceof Uint8Array) {
			const socket = this.individualSocketConnectionStore.find(id);
			if (socket) {
				socket.rawSocket.send(message);
				return;
			}
			if (!this.distributor) return;
			const serverId = id.slice(0, 21);
			const groupArray = encoder.encode(id);
			const messageWithGroupId = new Uint8Array(message.length + groupArray.length + 1);
			messageWithGroupId[0] = groupArray.length;
			messageWithGroupId.set(groupArray, 1);
			messageWithGroupId.set(message, 1 + groupArray.length); // @ts-ignore
			this.distributor.enqueue(`${serverId}`, messageWithGroupId);
		}
	}
	async sendToGroup(id: string, message: WebSocket.Data) {
		if (typeof message === 'string') {
			const messageWithGroupId = id + ':' + message; // @ts-ignore
			this.distributor.enqueue(`broadcast`, messageWithGroupId); // send to the server oin group channel
		} else if (message instanceof Uint8Array) {
			const groupArray = encoder.encode(id);
			const messageWithGroupId = new Uint8Array(message.length + groupArray.length + 1);
			messageWithGroupId[0] = groupArray.length;
			messageWithGroupId.set(groupArray, 1);
			messageWithGroupId.set(message, 1 + groupArray.length); //@ts-ignore
			this.distributor.enqueue(`broadcast`, messageWithGroupId); // send to the server oin group channel
		}
	}
	async listenToGroupQueue(queueName: string) {
		if (!this.distributor) return; // @ts-ignore
		this.distributor.listen(queueName, (message: Uint8Array | string) => {
			if (typeof message === 'string') {
				const separator = message.indexOf(':');
				const id = message.substring(0, separator);
				const remaining = message.substring(separator + 1, message.length);
				this.socketGroupStore.find(id)?.forEach((socket) => {
					socket.rawSocket.send(remaining);
				});
			} else if (message instanceof Uint8Array) {
				const finalMessage = new Uint8Array(message);
				const groupLength = finalMessage[0];
				const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));
				const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);
				this.socketGroupStore.find(id)?.forEach((socket) => {
					socket.rawSocket.send(remaining);
				});
			}
		});
	}

	async listenToIndividualQueue(queueName: string) {
		if (!this.distributor) return; // @ts-ignore
		this.distributor.listen(queueName, (message: string | Uint8Array) => {
			if (typeof message === 'string') {
				const separator = message.indexOf(':');
				const id = message.substring(1, separator);
				const remaining = message.substring(separator + 1, message.length);
				this.individualSocketConnectionStore.find(id)?.rawSocket.send(remaining);
			} else if (message instanceof Uint8Array) {
				const finalMessage = new Uint8Array(message);
				const groupLength = finalMessage[0];
				const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));
				const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);
				this.individualSocketConnectionStore.find(id)?.rawSocket.send(remaining);
			}
		});
	}
	private async listenToStringGroupQueue(queueName: string) {
		if (!this.distributor) return; // @ts-ignore
		this.distributor.listen(queueName, (message: string) => {});
	}
	constructor(
		options: ServerOptions & {
			distributor: MessageDistributor<MessageType, any>;
			serialize?: Serialize<DataMapping<MessageType>>;
			deserialize?: Deserialize;
		}
	) {
		super();
		const { distributor } = options; // @ts-ignore
		let messageType: MessageType = 'string';
		this.distributor = distributor;
		this.id = nanoid();
		this.individualSocketConnectionStore = new IndividualSocketConnectionStore();
		this.socketGroupStore = new SocketGroupStore<MessageType>();
		this.rawWebSocketServer = new WebSocket.Server(options);
		Promise.all([
			this.distributor
				? this.distributor.initialize(this.id, {
						messageType,
				  })
				: undefined,
		])
			.then(() => {
				this.listenToIndividualQueue(`${this.id}`);
				this.listenToGroupQueue(`broadcast`);
				this.emit('ready');
				this.rawWebSocketServer.on('connection', (rawSocket: WebSocket) => {
					const socket = new Socket<MessageType>(rawSocket, {
						mode: messageType,
						server: this,
					});
					this.emit('connection', socket);
					rawSocket.on('ping', () => {
						rawSocket.pong();
					});
					rawSocket.addListener('message', (data) => {
						try {
							socket.emit('message', data);
						} catch (e) {
							console.error('Cannot parse message from browser!', e);
						}
					});
					rawSocket.addEventListener('close', () => {
						this.emit('close');
						socket.leaveAllGroups();
						socket.clear();
					});
				});
			})
			.catch((e) => console.error(e));
	}

	addListener(method: 'connection', listener: (socket: Socket<MessageType>) => void): this;
	addListener(method: 'close', listener: (socket: Socket<MessageType>) => void): this;
	addListener(method: 'ready', listener: () => void): this;
	addListener(method: string, listener: (e?: any) => void): this {
		super.addListener(method, listener);
		return this;
	}
}
export type { Socket } from './client';
export { ApiError } from './utils';
export type { JsonObject } from './utils';
