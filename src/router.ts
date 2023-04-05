import { TextEncoder } from 'util';
import HttpStatusCode from './statusCodes';
import { ApiError, MethodEnum, parseBrowserMessage, createMessageForBrowser, Method } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
import { Socket } from './client';
import { DistributedStore } from './distributedStore';
import { SocketGroupStore, IndividualSocketConnectionStore } from './localStores';
export type RouterStore = Record<MethodEnum, Route[]>;

export type RouterRequest<P extends object = object> = ReturnType<typeof parseBrowserMessage> & MatchResult<P>;
type SendMessageFromServerOptions = {
	method?: Method;
	headers?: Record<string, string | number>;
	status?: HttpStatusCode;
	url?: string;
};
const temp = {
	get: MethodEnum.GET,
	post: MethodEnum.POST,
	put: MethodEnum.PUT,
	patch: MethodEnum.PATCH,
	delete: MethodEnum.DELETE,
};
export function createResponse(
	type: 'self' | 'group' | 'individual',
	message: ReturnType<typeof parseBrowserMessage>,
	instance: Socket | string,
	router: Router
) {
	let hasStatusBeenSet = false;
	return {
		...(instance instanceof Socket
			? {
					joinGroup: (groupId: string) => {
						router.joinGroup(groupId, instance);
					},
			  }
			: {}),
		_status: 200,
		_url: String,
		headers: undefined,
		set: function (key: string, value: string) {
			this.headers = this.headers || {};
			this.headers[key] = value;
		},
		socket: instance,
		clients: router.socketGroupStore,
		group: function (groupName: string) {
			return createResponse('group', message, groupName, router);
		},
		to: function (connectionId: string) {
			return createResponse('individual', message, connectionId, router);
		},
		status: function (status: HttpStatusCode) {
			if (hasStatusBeenSet)
				throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this._status}) `);
			this._status = status;
			hasStatusBeenSet = true;
			return this;
		},
		send: function (data: any, options: SendMessageFromServerOptions = {}) {
			const finalMessage = createMessageForBrowser(
				options.url === undefined ? message.url : options.url,
				options.method === undefined ? message.method : temp[options.method],
				options.headers || this.headers,
				options.status === undefined ? this._status : options.status,
				type === 'self' ? message.requestId : undefined,
				data
			);
			if (type === 'group' && typeof instance === 'string') {
				console.log('pushing to redis', message, options);
				router.sendToGroup(instance, finalMessage);
			} else if (type === 'individual' && typeof instance === 'string') router.sendToGroup(instance, finalMessage);
			else if (type === 'self' && instance instanceof Socket) instance.send(finalMessage);
		},
	};
}
export type RouterResponse = ReturnType<typeof createResponse>;
export type RouterCallback<P extends object = object> = (
	request: RouterRequest<P>,
	response: ReturnType<typeof createResponse>
) => Promise<void>;
export type Route = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: RouterCallback[];
};

type Params = Record<string, string>;
const decoder = new TextDecoder();

const encoder = new TextEncoder();
export class Router {
	requestStore: RouterStore = {
		[MethodEnum.GET]: [],
		[MethodEnum.PUT]: [],
		[MethodEnum.POST]: [],
		[MethodEnum.PATCH]: [],
		[MethodEnum.DELETE]: [],
		[MethodEnum.META]: [],
	};
	constructor(private serverId: string, private store?: DistributedStore) {
		this.individualSocketConnectionStore = new IndividualSocketConnectionStore();
		this.socketGroupStore = new SocketGroupStore();
		this.listenToIndividualQueue(`i:${this.serverId}`);
		this.listenToGroupQueue(`server-messages:${this.serverId}`);
	}
	individualSocketConnectionStore: IndividualSocketConnectionStore;

	socketGroupStore: SocketGroupStore;
	async listenToIndividualQueue(queueName: string) {
		// `i:${serverId}`
		if (!this.store) return;
		this.store.listen(queueName, (connectionId: string, message: Uint8Array) => {
			this.individualSocketConnectionStore.find(connectionId).send(message);
		});
	}
	async listenToGroupQueue(queueName: string) {
		// `g:${serverId}`
		if (!this.store) return;
		console.log('Listening to Queue', queueName);
		this.store.listen(queueName, (groupId: string, message: Uint8Array) => {
			console.log('New message received on queue', this.serverId);
			this.socketGroupStore.find(groupId)?.forEach((socket) => {
				console.log('Popped Redis', message);
				socket.send(message);
			});
		});
	}
	async sendToGroup(id: string, message: Uint8Array) {
		console.log('a', this.socketGroupStore, id);

		// this.socketGroupStore.find(id)?.forEach((socket) => {
		// 	socket.send(message);
		// });
		if (!this.store) return;

		const servers = await this.store.getListItems(`group-servers:${id}`);
		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(message.length + 1 + groupArray.length);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(message, 1 + groupArray.length);
		console.log('Found servers for publishing to groups', servers);
		console.log('pushing in array format', messageWithGroupId);
		for (let i = 0; i < servers.length; i++) {
			const server = servers[i];
			this.store.enqueue(`server-messages:${server}`, messageWithGroupId); // send to the server oin group channel
		}
	}
	async joinGroup(id: string, socket: Socket) {
		this.socketGroupStore.add(socket, id);
		socket.groups.add(id); // remove it and use store methods only so in absence of distributedstore use localstore or something
		if (!this.store) return undefined;
		return Promise.all([
			this.store.addListItem(`my-groups:${socket.id}`, id),
			this.store.addListItem(`group-servers:${id}`, this.serverId),
		]);
	}
	async joinGroups(socket: Socket, groupdIds: string[]) {
		groupdIds.forEach((groupId) => {
			this.socketGroupStore.add(socket, groupId);
			if (this.store) this.store.addListItem(`group-servers:${groupId}`, this.serverId);
		});
	}
	async getGroups(connectionId: string) {
		return this.store.getListItems(`my-groups:${connectionId}`);
	}
	async sendToIndividual(id: string, message: Uint8Array) {
		const socket = this.individualSocketConnectionStore.find(id);
		if (socket) {
			socket.send(message);
			return;
		}
		if (!this.store) return;

		const server = await this.store.get(`i:${id}`);
		const groupArray = encoder.encode(id);
		const messageWithGroupId = new Uint8Array(message.length + 1 + groupArray.length);
		messageWithGroupId[0] = groupArray.length;
		messageWithGroupId.set(groupArray, 1);
		messageWithGroupId.set(message, 1 + groupArray.length);
		this.store.enqueue(`i:${server}`, messageWithGroupId);
	}
	registerRoute(method: MethodEnum, url: string, ...callbacks: RouterCallback[]) {
		console.log('pushing');
		this.requestStore[method].push({
			literalRoute: url,
			match: match(url, { decode: decodeURIComponent }),
			callbacks,
		});
	}
	get<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		this.registerRoute(MethodEnum.GET, url, ...callbacks);
	}
	put<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		this.registerRoute(MethodEnum.PUT, url, ...callbacks);
	}
	post<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		this.registerRoute(MethodEnum.POST, url, ...callbacks);
	}
	patch<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		this.registerRoute(MethodEnum.PATCH, url, ...callbacks);
	}
	delete<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		this.registerRoute(MethodEnum.DELETE, url, ...callbacks);
	}
	meta<P extends object = Params>(url: string, ...callbacks: RouterCallback<P>[]) {
		console.log('registering');
		this.registerRoute(MethodEnum.META, url, ...callbacks);
	}
	async listener(message: ReturnType<typeof parseBrowserMessage>, mySocket: Socket) {
		// Message is coming from router to client and execution should be skipped
		let store: RouterStore[MethodEnum.GET];
		let method: MethodEnum = message.method;
		store = this.requestStore[method];
		/**
		 * Response usage
		 *
		 * res.status(number).send()
		 * res.group(string).status(number).send()
		 * res.to(string).status(number).send()
		 *
		 */

		const response = createResponse('self', message, mySocket, this);
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message.url);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++)
					await store[i].callbacks[j]({ ...message, ...matched }, response);
			}
		} catch (error) {
			console.log(error);
			if (error instanceof ApiError) {
				response.status(error.status);
				response.send(error.message);
			} else {
				response.status(500);
				response.send(null);
			}
			console.log(error);
		}
	}
}
