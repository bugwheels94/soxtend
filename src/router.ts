import { TextEncoder } from 'util';
import HttpStatusCode from './statusCodes';
import { ApiError, MethodEnum, parseBrowserMessage, createMessageForBrowser, Method } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
import { Socket } from './client';
import { DistributedStore } from './distributedStore';
import { SocketGroupStore, IndividualSocketConnectionStore } from './localStores';
export type RouterStore = Record<MethodEnum, Route[]>;

export type RouterRequest<P extends object = object> = {
	requestId?: number;
	message?: any;
	method: MethodEnum;
	url: string;
	header?: Record<string, string>;
} & MatchResult<P>;
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
function createResponse(
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
				options.url || message.url,
				options.method === undefined ? message.method : temp[options.method],
				options.headers || this.headers,
				options.status === undefined ? this._status : options.status,
				type === 'self' ? message.requestId : undefined,
				data
			);
			if (type === 'group' && typeof instance === 'string') router.sendToGroup(instance, finalMessage);
			else if (type === 'individual' && typeof instance === 'string') router.sendToGroup(instance, finalMessage);
			else if (type === 'self' && instance instanceof Socket) instance.send(finalMessage);
		},
	};
}
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
const encoder = new TextEncoder();
export class Router {
	store: RouterStore = {
		[MethodEnum.GET]: [],
		[MethodEnum.PUT]: [],
		[MethodEnum.POST]: [],
		[MethodEnum.PATCH]: [],
		[MethodEnum.DELETE]: [],
	};
	constructor(private serverId: string, private distributedStore?: DistributedStore) {
		this.individualSocketConnectionStore = new IndividualSocketConnectionStore();
		this.socketGroupStore = new SocketGroupStore();
		this.listenToIndividualQueue(`i:${this.serverId}`);
		this.listenToGroupQueue(`g:${this.serverId}`);
	}
	individualSocketConnectionStore: IndividualSocketConnectionStore;

	socketGroupStore: SocketGroupStore;
	async listenToIndividualQueue(queueName: string) {
		// `i:${serverId}`
		if (!this.distributedStore) return;
		this.distributedStore.listen(queueName, (connectionId: string, message: string) => {
			this.individualSocketConnectionStore.find(connectionId).send(encoder.encode(message));
		});
	}
	async listenToGroupQueue(queueName: string) {
		// `g:${serverId}`
		if (!this.distributedStore) return;
		this.distributedStore.listen(queueName, (groupId: string, message: string) => {
			this.socketGroupStore.find(groupId).forEach((socket) => {
				socket.send(encoder.encode(message));
			});
		});
	}
	async sendToGroup(id: string, message: Uint8Array) {
		this.socketGroupStore.find(id).forEach((socket) => {
			socket.send(message);
		});
		if (!this.distributedStore) return;
		this.distributedStore.sendToGroup(id, message);
	}
	async joinGroup(id: string, socket: Socket) {
		this.socketGroupStore.add(socket, id);
		socket.groups.add(id);
		if (!this.distributedStore) return;
		this.distributedStore.joinGroup(id);
	}
	async sendToIndividual(id: string, message: Uint8Array) {
		const socket = this.individualSocketConnectionStore.find(id);
		if (socket) {
			socket.send(message);
			return;
		}
		if (!this.distributedStore) return;
		this.distributedStore.sendToIndividual(id, message);
	}
	registerRoute(method: MethodEnum, url: string, ...callbacks: RouterCallback[]) {
		this.store[method].push({
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
	async listener(message: ReturnType<typeof parseBrowserMessage>, mySocket: Socket) {
		// Message is coming from router to client and execution should be skipped
		let store: RouterStore[MethodEnum.GET];
		let method: MethodEnum = message.method;
		store = this.store[method];
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
