import { Socket } from './client';
import { AllowedType } from './utils';

export interface LocalGroupStore {
	add: (socketId: string, groupId: string | number) => void;
}

export class SocketGroupStore<DataSentOverWire extends AllowedType = 'string'> {
	store: Map<string | number, Set<Socket<DataSentOverWire>>> = new Map();
	myGroups: Map<string, Set<string | number>> = new Map();
	add(socket: Socket<DataSentOverWire>, groupId: string | number) {
		const existingClient = this.store.get(groupId);
		if (existingClient) {
			existingClient.add(socket);
			return existingClient;
		}
		const newClient = new Set<Socket<DataSentOverWire>>();
		newClient.add(socket);
		this.store.set(groupId, newClient);
		let set = this.myGroups.get(socket.id);
		if (!set) {
			set = new Set();
			this.myGroups.set(socket.id, set);
		}
		set.add(groupId);
		return newClient;
	}
	find(id: string | number) {
		return this.store.get(id);
	}
	remove(socket: Socket<DataSentOverWire>, groupId: string | number) {
		const group = this.store.get(groupId);
		this.myGroups.get(socket.id)?.delete(groupId);
		group?.delete(socket);
	}
}
export class IndividualSocketConnectionStore<DataSentOverWire extends AllowedType = 'string'> {
	store: Map<string, Socket<DataSentOverWire>> = new Map();
	add(socket: Socket<DataSentOverWire>) {
		this.store.set(socket.id, socket);
	}
	find(id: string) {
		return this.store.get(id);
	}
	remove(id: string) {
		this.store.delete(id);
	}
}
