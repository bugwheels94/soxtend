import WebSocket from 'isomorphic-ws';
import { Socket } from './client';
import { ServerOptions } from 'ws';
import crypto from 'crypto';
import { MessageDistributor, InMemoryMessageDistributor } from './distributor';
// import { MessageStore } from './messageStore';
import EventEmitter from 'events';
import { IndividualSocketConnectionStore, SocketGroupStore } from './localStores';
import { AllowedType, Deserialize, JsonObject, Serialize } from './utils';
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

export class SoxtendServer<DataSentOverWire extends AllowedType = string> extends EventEmitter {
	serverId: string;
	rawWebSocketServer: WebSocket.Server;
	private distributor?: MessageDistributor<DataSentOverWire>;
	eventStore: Record<
		SoxtendServerEvents,
		{
			listener: (e?: any) => void;
		}[]
	> = {
		connection: [],
		close: [],
	};
	socketGroupStore: SocketGroupStore<DataSentOverWire>;
	individualSocketConnectionStore: IndividualSocketConnectionStore<DataSentOverWire>;
	sendToIndividual: (individualId: string, message: Parameters<Serialize>[0]) => Promise<void>;
	sendToGroup: (groupId: string, message: Parameters<Serialize>[0]) => Promise<void>;
	private async sendMessageAsBufferToIndividual(id: string, message: Parameters<Serialize>[0]) {
		const socket = this.individualSocketConnectionStore.find(id);
		const serializedMessage = this.serialize(message) as Uint8Array;
		if (socket) {
			socket.rawSocket.send(serializedMessage);
			return;
		}
		if (!this.distributor) return;

		const server = await this.distributor.get(`i:${id}`);
		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(serializedMessage.length + 1 + groupArray.length);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(serializedMessage, 1 + groupArray.length);
		// @ts-ignore
		this.distributor.enqueue(`i:${server}`, messageWithGroupId);
	}
	private async sendMessageAsBufferToGroup(id: string, message: Parameters<Serialize>[0]) {
		// this.socketGroupStore.find(id)?.forEach((socket) => {
		// 	socket.send(message);
		// });
		const serializedMessage = this.serialize(message) as Uint8Array;

		const servers = await this.distributor.getListItems(`group-servers:${id}`);
		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(serializedMessage.length + 1 + groupArray.length);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(serializedMessage, 1 + groupArray.length);
		for (let server of servers) {
			//@ts-ignore
			this.distributor.enqueue(`server-messages:${server}`, messageWithGroupId); // send to the server oin group channel
		}
	}
	private async sendMessageAsStringToIndividual(id: string, message: Parameters<Serialize>[0]) {
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
		this.distributor.enqueue(`i:${server}`, messageWithGroupId);
	}
	private async sendMessageAsStringToGroup(id: string, message: Parameters<Serialize>[0]) {
		// this.socketGroupStore.find(id)?.forEach((socket) => {
		// 	socket.send(message);
		// });

		const serializedMessage = this.serialize(message) as Uint8Array;

		const servers = await this.distributor.getListItems(`group-servers:${id}`);
		const messageWithGroupId = id + ':' + serializedMessage;
		for (let server of servers) {
			// @ts-ignore
			this.distributor.enqueue(`server-messages:${server}`, messageWithGroupId); // send to the server oin group channel
		}
	}
	private serialize: Serialize<DataSentOverWire>;
	private deserialize: Deserialize;

	constructor(
		options: ServerOptions & {
			distributor?: MessageDistributor<DataSentOverWire>;
			serialize?: Serialize<DataSentOverWire>;
			deserialize?: Deserialize;

			// messageStore?: MessageStore;
		}
	) {
		super();
		const { distributor, serialize, deserialize } = options;
		let mode: 'string' | 'Uint8Array' = 'string';
		this.serialize = serialize || (((string: JsonObject) => JSON.stringify(string)) as Serialize<DataSentOverWire>);
		this.deserialize =
			deserialize || (((string: Buffer) => JSON.parse(string.toString()) as JsonObject) as Deserialize);

		if (this.serialize({}) instanceof Uint8Array) {
			mode = 'Uint8Array';
			this.sendToIndividual = this.sendMessageAsBufferToIndividual;
			this.sendToGroup = this.sendMessageAsBufferToGroup;
		} else {
			this.sendToIndividual = this.sendMessageAsStringToIndividual;
			this.sendToGroup = this.sendMessageAsStringToGroup;
		}
		this.distributor = distributor;
		this.distributor.mode = mode;
		this.serverId = crypto.randomUUID();
		this.individualSocketConnectionStore = new IndividualSocketConnectionStore();
		this.socketGroupStore = new SocketGroupStore<DataSentOverWire>();

		Promise.all([
			this.distributor
				? this.distributor.initialize(this.serverId, {
						mode: 'string',
				  })
				: undefined,
			// options.messageStore ? options.messageStore.initialize(this.serverId) : undefined,
		])
			.then(() => {
				this.listenToIndividualQueue(`i:${this.serverId}`);
				this.listenToGroupQueue(`server-messages:${this.serverId}`);
				this.rawWebSocketServer = new WebSocket.Server(options);
				this.emit('ready');
				this.rawWebSocketServer.on('connection', (rawSocket) => {
					const socket = new Socket<DataSentOverWire>(rawSocket, { mode, serialize: this.serialize });
					const newConnection = async (buffer: Buffer) => {
						const data = buffer.toString();
						let connectionId: string;
						if (!data) {
							connectionId = crypto.randomUUID();
							// @ts-ignore
							socket.setId(connectionId);
						} else {
							connectionId = data;
							socket.setId(connectionId);
							const groups = await this.getGroups(connectionId);
							this.joinGroups(groups, socket);
						}
						rawSocket.send(connectionId);
						this.emit('connection', socket);

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
						// this.socketGroupStore.remove(socket);
					});
				});
			})
			.catch((e) => console.error(e));
	}

	async listenToGroupQueue(queueName: string) {
		// `g:${serverId}`
		if (!this.distributor) return;
		this.distributor.listen(queueName, (groupId, message) => {
			this.socketGroupStore.find(groupId)?.forEach((socket) => {
				socket.rawSocket.send(message);
			});
		});
	}
	async listenToIndividualQueue(queueName: string) {
		// `i:${serverId}`
		if (!this.distributor) return;
		this.distributor.listen(queueName, (connectionId, message) => {
			this.individualSocketConnectionStore.find(connectionId).rawSocket.send(message);
		});
	}

	async joinGroup(id: string, socket: Socket<DataSentOverWire>) {
		this.socketGroupStore.add(socket, id);
		if (!this.distributor) return undefined;
		return Promise.all([
			this.distributor.addListItem(`my-groups:${socket.id}`, id),
			this.distributor.addListItem(`group-servers:${id}`, this.serverId),
		]);
	}
	async joinGroups(groupdIds: Iterable<string>, socket: Socket<DataSentOverWire>) {
		for (let groupId of groupdIds) {
			this.socketGroupStore.add(socket, groupId);
			this.distributor.addListItem(`group-servers:${groupId}`, this.serverId);
		}
		this.distributor.addListItems(`my-groups:${socket.id}`, groupdIds);
	}
	async leaveGroup(groupId: string, socket: Socket<DataSentOverWire>) {
		this.socketGroupStore.remove(socket, groupId);

		return this.distributor.removeListItem(`my-groups:${socket.id}`, groupId);
	}
	async leaveAllGroups(socket: Socket<DataSentOverWire>) {
		const groups = await this.distributor.getListItems(`my-groups:${socket.id}`);
		for (let group of groups) {
			this.socketGroupStore.remove(socket, group);
		}
		this.distributor.removeListItems(`my-groups:${socket.id}`, groups);
	}
	async leaveGroups(groups: string[], socket: Socket<DataSentOverWire>) {
		for (let group of groups) {
			this.socketGroupStore.remove(socket, group);
		}

		return Promise.all([this.distributor.removeListItems(`my-groups:${socket.id}`, groups)]);
	}
	async getGroups(connectionId: string) {
		return this.distributor.getListItems(`my-groups:${connectionId}`);
	}

	addListener(method: 'connection', listener: (socket: Socket<DataSentOverWire>) => void): this;
	addListener(method: 'close', listener: (socket: Socket<DataSentOverWire>) => void): this;
	addListener(method: 'ready', listener: () => void): this;

	addListener(method: string, listener: (e?: any) => void): this {
		super.addListener(method, listener);
		return this;
	}
}
export type { RouterRequest, RouterResponse } from './router';
export { Router } from './router';
export { InMemoryMessageDistributor };
export { ApiError } from './utils';
