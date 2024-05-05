import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { MessageDistributor } from './distributor';
// import { MessageStore } from './messageStore';
import EventEmitter from 'events';
import { IndividualSocketConnectionStore, SocketGroupStore } from './localStores';
import { AllowedType, DataMapping, Deserialize, JsonObject, Serialize } from './utils';
import { SERVERS_HAVING_GROUP, SERVER_MESSAGES_GROUP_QUEUE } from './constants';
type SoxtendServerEvents = 'connection' | 'close';

declare global {
	interface WebSocket {
		id: string;
		groups: string[];
	}
}
const encoder = new TextEncoder();

// class Serializer {

// 	constructor(private format:{name:string,size?:number, type?: "number" | "json" | "string" | "mixed"}[] = []) {
// 		this.format = format;
// 	}
// 	serialize(message: Record<string, string | Record<string, string|number>>) {
// 		const values = [];
// 		let length = 0;
// 		for (let i = 0; i < this.format.length; i++) {
// 			const currentProperty = this.format[i];
// 			if (currentProperty.type === "json") {
// 				const stringified = encoder.encode(JSON.stringify(message[currentProperty.name]));
// 				values.push(stringified);
// 				length+=2 + stringified.length;
// 			} else if (currentProperty.type === "mixed") {
// 				const value = message[currentProperty.name];
// 				let processedValue;
// 				if (value instanceof Uint8Array) {
// 					processedValue = value;
// 				} else if (typeof value === "string") {
// 					processedValue = encoder.encode(value);
// 				} else {
// 					processedValue = encoder.encode(JSON.stringify(value));
// 				}
// 				length += processedValue.length;
// 				length += 2;
// 				values.push(processedValue);
// 			} else {
// 				// @ts-ignore
// 				const value = encoder.encode(message[currentProperty.name]);
// 				length += value.length;
// 				values.push(value)
// 				if (!currentProperty.size) {
// 					length += 2;
// 				}

// 			}
// 		}
// 		let filledTill = 0;
// 		const finalMessage = new Uint8Array(length);
// 		for (let i = 0; i < this.format.length; i++) {
// 			const currentProperty = this.format[i];
// 			const value = values[i];

// 			if (!currentProperty.size) {
// 				finalMessage[filledTill++] = value.length % 255
// 				finalMessage[filledTill++] = Math.floor(value.length / 255);
// 			}
// 			finalMessage.set(value, filledTill)
// 			filledTill += value.length;
// 	}
// 	return finalMessage
// }
// }

const decoder = new TextDecoder();
export class SoxtendServer<MessageType extends AllowedType = 'string'> extends EventEmitter {
	serverId: string;
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
	sendToIndividual: (individualId: string, message: JsonObject) => Promise<void>;
	sendToGroup: (groupId: string, message: JsonObject) => Promise<void>;
	private async sendMessageAsBufferToIndividual(id: string, message: JsonObject) {
		const socket = this.individualSocketConnectionStore.find(id);
		const serializedMessage = this.serialize(message) as Uint8Array;
		if (socket) {
			socket.rawSocket.send(serializedMessage);
			return;
		}
		if (!this.distributor) return;

		const server = await this.distributor.get(`i:${id}`);
		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(serializedMessage.length + groupArray.length + 1);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(serializedMessage, 1 + groupArray.length);
		// @ts-ignore
		this.distributor.enqueue(`${server}`, messageWithGroupId);
	}
	private async sendMessageAsBufferToGroup(id: string, message: JsonObject) {
		// this.socketGroupStore.find(id)?.forEach((socket) => {
		// 	socket.send(message);
		// });
		const serializedMessage = this.serialize(message) as Uint8Array;

		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(serializedMessage.length + groupArray.length + 1);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(serializedMessage, 1 + groupArray.length);
		//@ts-ignore
		this.distributor.enqueue(`broadcast`, messageWithGroupId); // send to the server oin group channel
	}
	private async sendMessageAsStringToIndividual(id: string, message: JsonObject) {
		const socket = this.individualSocketConnectionStore.find(id);
		const serializedMessage = this.serialize(message) as string;
		if (socket) {
			socket.rawSocket.send(serializedMessage);
			return;
		}
		if (!this.distributor) return;

		const server = await this.distributor.get(`i:${id}`);
		const messageWithGroupId = id + ':' + serializedMessage;

		//@ts-ignore
		this.distributor.enqueue(`${server}`, messageWithGroupId);
	}
	private async sendMessageAsStringToGroup(id: string, message: JsonObject) {
		const serializedMessage = this.serialize(message) as string;

		const messageWithGroupId = id + ':' + serializedMessage;
		// @ts-ignore
		this.distributor.enqueue(`broadcast`, messageWithGroupId); // send to the server oin group channel
	}
	private serialize: Serialize<DataMapping<MessageType>>;
	private deserialize: Deserialize;

	listenToGroupQueue: (queueId: string) => void;
	listenToIndividualQueue: (queueId: string) => void;
	private async listenToBufferGroupQueue(queueName: string) {
		if (!this.distributor) return;
		// @ts-ignore
		this.distributor.listen(queueName, (message: Uint8Array) => {
			const finalMessage = new Uint8Array(message);
			const groupLength = finalMessage[0];
			const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));

			const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);
			this.socketGroupStore.find(id)?.forEach((socket) => {
				socket.rawSocket.send(remaining);
			});
		});
	}
	private async listenToBufferIndividualQueue(queueName: string) {
		if (!this.distributor) return;
		// @ts-ignore
		this.distributor.listen(queueName, (message: Uint8Array) => {
			const finalMessage = new Uint8Array(message);
			const groupLength = finalMessage[0];
			const id = decoder.decode(finalMessage.subarray(1, 1 + groupLength));
			const remaining = finalMessage.subarray(1 + groupLength, finalMessage.length);
			this.individualSocketConnectionStore.find(id)?.rawSocket.send(remaining);
		});
	}

	private async listenToStringIndividualQueue(queueName: string) {
		if (!this.distributor) return;
		// @ts-ignore
		this.distributor.listen(queueName, (message: string) => {
			const separator = message.indexOf(':');
			const id = message.substring(1, separator);
			const remaining = message.substring(separator + 1, message.length);
			this.individualSocketConnectionStore.find(id)?.rawSocket.send(remaining);
		});
	}
	private async listenToStringGroupQueue(queueName: string) {
		if (!this.distributor) return;
		// @ts-ignore
		this.distributor.listen(queueName, (message: string) => {
			const separator = message.indexOf(':');
			const id = message.substring(0, separator);
			const remaining = message.substring(separator + 1, message.length);
			this.socketGroupStore.find(id)?.forEach((socket) => {
				socket.rawSocket.send(remaining);
			});
		});
	}
	constructor(
		options: ServerOptions & {
			distributor: MessageDistributor<MessageType, any>;
			serialize?: Serialize<DataMapping<MessageType>>;
			deserialize?: Deserialize;

			// messageStore?: MessageStore;
		}
	) {
		super();
		const { distributor, serialize, deserialize } = options;
		// @ts-ignore
		let messageType: MessageType = 'string';
		this.serialize =
			serialize || (((string: JsonObject) => JSON.stringify(string)) as Serialize<DataMapping<MessageType>>);
		this.deserialize =
			deserialize || (((string: Buffer) => JSON.parse(string.toString()) as JsonObject) as Deserialize);

		if (this.serialize({}) instanceof Uint8Array) {
			// @ts-ignore
			messageType = 'binary';
			this.listenToGroupQueue = this.listenToBufferGroupQueue;
			this.listenToIndividualQueue = this.listenToBufferIndividualQueue;
			this.sendToIndividual = this.sendMessageAsBufferToIndividual;
			this.sendToGroup = this.sendMessageAsBufferToGroup;
		} else {
			this.listenToGroupQueue = this.listenToStringGroupQueue;
			this.listenToIndividualQueue = this.listenToStringIndividualQueue;
			this.sendToIndividual = this.sendMessageAsStringToIndividual;
			this.sendToGroup = this.sendMessageAsStringToGroup;
		}
		this.distributor = distributor;
		this.serverId = crypto.randomUUID();
		this.individualSocketConnectionStore = new IndividualSocketConnectionStore();
		this.socketGroupStore = new SocketGroupStore<MessageType>();
		this.rawWebSocketServer = new WebSocket.Server(options);

		Promise.all([
			this.distributor
				? this.distributor.initialize(this.serverId, {
						messageType,
				  })
				: undefined,
			// options.messageStore ? options.messageStore.initialize(this.serverId) : undefined,
		])
			.then(() => {
				this.listenToIndividualQueue(`${this.serverId}`);
				this.listenToGroupQueue(`broadcast`);
				this.emit('ready');
				this.rawWebSocketServer.on('connection', (rawSocket: WebSocket) => {
					const socket = new Socket<MessageType>(rawSocket, {
						mode: messageType,
						serialize: this.serialize,
						server: this,
					});
					const newConnection = async (buffer: Buffer) => {
						const data = buffer.toString();

						// Very hard to properly ensure if all groups will be restored hence completely skipping
						// if (data) {
						// 	const connectionId = data;
						// 	const groups = await socket.getAllGroups(connectionId);
						// 	socket.joinGroups(groups);
						// }
						rawSocket.send(socket.id);
						this.emit('connection', socket);
						rawSocket.on('ping', () => {
							rawSocket.pong();
						});
						rawSocket.addListener('message', (data) => {
							try {
								// @ts-ignore
								const parsedData = this.deserialize(data);
								if (parsedData === null) return;
								socket.emit('message', parsedData);
								// router.listener(parsedData, socket);
							} catch (e) {
								console.error('Cannot parse message from browser!', e);
							}
						});
						rawSocket.removeListener('message', newConnection);
					};
					rawSocket.addListener('message', newConnection);

					// connectionEvents.forEach(({ listener }) => {
					// 	listener(socket);
					// });

					rawSocket.addEventListener('close', () => {
						this.emit('close');
						socket.leaveAllGroups();
						socket.clear();
						// this.socketGroupStore.remove(socket);
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
