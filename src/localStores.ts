import { Socket } from './client';

/**
 * Interfaces to support
 * res.send
 * res.to("connectionId")
 * res.in("groupId")
 *
 * on browser side,
 * normal fetch will have response
 * receiver.get|post|put1
 */
export class SocketGroupStore {
	store: Map<string | number, Set<Socket>> = new Map();

	add(socket: Socket, groupId: string | number) {
		// if (!groupId) {
		// 	return new SocketGroup(socketSet);
		// }
		const existingClient = this.store.get(groupId);
		if (existingClient) {
			existingClient.add(socket);
			return existingClient;
		}
		const newClient = new Set<Socket>();
		newClient.add(socket);
		this.store.set(groupId, newClient);
		return newClient;
	}
	find(id: string | number) {
		return this.store.get(id);
	}
	remove(socket: Socket, groupId: string | number) {
		const group = this.store.get(groupId);
		group.delete(socket);
	}
	constructor() {
		// this.clients.set('*', new SocketGroup());
	}
}
export class IndividualSocketConnectionStore {
	store: Map<string, Socket> = new Map();

	add(socket: Socket) {
		this.store.set(socket.id, socket);
		// if (!groupId) {
		// 	return new SocketGroup(socketSet);
		// }
	}
	find(id: string) {
		return this.store.get(id);
	}
	remove(id: string) {
		this.store.delete(id);
	}
	constructor() {
		// this.clients.set('*', new SocketGroup());
	}
}
