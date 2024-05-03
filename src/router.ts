import HttpStatusCode from './statusCodes';
import { ApiError, MethodEnum, Method } from './utils';
import { match, MatchFunction, MatchResult } from 'path-to-regexp';
import { Socket } from './client';
import { SoxtendServer } from '.';
export type RouterStore = Record<MethodEnum, Route[]>;

export type RouterRequest<P extends object = object> = {
	id: string;
	url: string;
	method: MethodEnum;
	header: Record<string, string>;
	body: any;
} & MatchResult<P>;
type SendMessageFromServerOptions = {
	method?: Method;
	headers?: Record<string, string | number>;
	status?: HttpStatusCode;
	url?: string;
};
const temp: Record<Method, MethodEnum> = {
	get: MethodEnum.GET,
	post: MethodEnum.POST,
	put: MethodEnum.PUT,
	patch: MethodEnum.PATCH,
	delete: MethodEnum.DELETE,
	meta: MethodEnum.META,
};
function createIndividualRespone(connectionId: string, message: RouterRequest, server: SoxtendServer) {
	let hasStatusBeenSet = false;
	return {
		_status: 200,
		_url: String,
		headers: {} as { [key: string]: string },
		set: function (key: string, value: string) {
			this.headers = this.headers || {};
			this.headers[key] = value;
		},

		status: function (status: HttpStatusCode) {
			if (hasStatusBeenSet)
				throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this._status}) `);
			this._status = status;
			hasStatusBeenSet = true;
			return this;
		},
		send: function (data: any, options: SendMessageFromServerOptions = {}) {
			const finalMessage = {
				url: options.url === undefined ? message.url : options.url,
				method: options.method === undefined ? message.method : temp[options.method],
				headers: options.headers || this.headers,
				status: options.status === undefined ? this._status : options.status,
				data,
			};
			server.sendToIndividual(connectionId, finalMessage);
			return this;
		},
	};
}
function createGroupResponse(groupId: string, message: RouterRequest, server: SoxtendServer) {
	let hasStatusBeenSet = false;
	return {
		_status: 200,
		_url: String,
		headers: {} as { [key: string]: string },
		set: function (key: string, value: string) {
			this.headers = this.headers || {};
			this.headers[key] = value;
		},
		status: function (status: HttpStatusCode) {
			if (hasStatusBeenSet)
				throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this._status}) `);
			this._status = status;
			hasStatusBeenSet = true;
			return this;
		},
		send: function (data: any, options: SendMessageFromServerOptions = {}) {
			const finalMessage = {
				url: options.url === undefined ? message.url : options.url,
				method: options.method === undefined ? message.method : temp[options.method],
				headers: options.headers || this.headers,
				status: options.status === undefined ? this._status : options.status,
				data,
			};
			server.sendToGroup(groupId, finalMessage);
			return this;
		},
	};
}
function createSelfResponse(instance: Socket, message: RouterRequest, server: SoxtendServer) {
	let hasStatusBeenSet = false;
	return {
		joinGroup: async (groupId: string) => {
			return instance.joinGroup(groupId);
		},
		leaveGroup: async (groupId: string) => {
			return instance.leaveGroup(groupId);
		},
		leaveGroups: async (groups: string[]) => {
			return instance.leaveGroups(groups);
		},
		leaveAllGroups: async () => {
			return instance.leaveAllGroups();
		},
		_status: 200,
		_url: String,
		headers: {} as Record<string, string>,
		set: function (key: string, value: string) {
			this.headers = this.headers || {};
			this.headers[key] = value;
		},
		socket: instance,
		clients: server.socketGroupStore,
		group: function (groupName: string) {
			return createGroupResponse(groupName, message, server);
		},
		to: function (connectionId: string) {
			return createIndividualRespone(connectionId, message, server);
		},
		status: function (status: HttpStatusCode) {
			if (hasStatusBeenSet)
				throw new Error(`Cannot overwrite status status(${status}) from previously set status(${this._status}) `);
			this._status = status;
			hasStatusBeenSet = true;
			return this;
		},
		send: function (data: any, options: SendMessageFromServerOptions = {}) {
			const finalMessage = {
				url: options.url === undefined ? message.url : options.url,
				method: options.method === undefined ? message.method : temp[options.method],
				headers: options.headers || this.headers,
				status: options.status === undefined ? this._status : options.status,
				_id: message.id,
				data,
			};
			instance.send(finalMessage);
			return this;
		},
	};
}
export type RouterResponse = ReturnType<typeof createSelfResponse>;
export type RouterCallback<P extends object = object> = (
	request: RouterRequest<P>,
	response: ReturnType<typeof createSelfResponse>
) => Promise<void> | void;
export type Route = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: RouterCallback<any>[];
};

type Params = Record<string, string>;
const onServerSocketInitialized = (socket: Socket, router: Router) => {
	socket.addListener('message', (data) => {
		try {
			// @ts-ignore
			router.listener(data, socket);
		} catch (e) {
			console.error('Cannot parse message from browser!', e);
		}
	});
};

export class Router {
	requestStore: RouterStore = {
		[MethodEnum.GET]: [],
		[MethodEnum.PUT]: [],
		[MethodEnum.POST]: [],
		[MethodEnum.PATCH]: [],
		[MethodEnum.DELETE]: [],
		[MethodEnum.META]: [],
	};
	onConnectStore: ((socket: Socket) => void)[] = [];
	constructor(private server: SoxtendServer) {
		this.server.addListener('connection', (socket) => {
			onServerSocketInitialized(socket, this);
		});
	}

	onConnect(callback: (socket: Socket) => void) {
		this.onConnectStore.push(callback);
	}
	newConnectionInitialized(socket: Socket) {
		this.onConnectStore.forEach((cb) => cb(socket));
	}

	registerRoute<T extends object>(method: MethodEnum, url: string, ...callbacks: RouterCallback<T>[]) {
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
		this.registerRoute(MethodEnum.META, url, ...callbacks);
	}
	async listener(message: RouterRequest, mySocket: Socket) {
		// Message is coming from router to client and execution should be skipped
		let store: RouterStore[MethodEnum.GET];
		let method: MethodEnum = message.method as MethodEnum;
		store = this.requestStore[method];
		/**
		 * Response usage
		 *
		 * res.status(number).send()
		 * res.group(string).status(number).send()
		 * res.to(string).status(number).send()
		 *
		 */

		const response = createSelfResponse(mySocket, message, this.server);
		try {
			for (let i = 0; i < store.length; i += 1) {
				const matched = store[i].match(message.url as string);
				if (!matched) continue;
				for (let j = 0; j < store[i].callbacks.length; j++)
					await store[i].callbacks[j]({ ...message, ...matched }, response);
			}
		} catch (error) {
			if (error instanceof ApiError) {
				response.status(error.status);
				response.send(error.message);
			} else {
				response.status(500);
				response.send(null);
			}
		}
	}
}
export { ApiError } from './utils';
