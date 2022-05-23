import WebSocket from 'ws';
import HttpStatusCode from './statusCodes';

export class ApiError extends Error {
	status: number;
	// partialResponse will come below
	constructor(message: string | null, status: HttpStatusCode, err?: Error) {
		super();
		const error = err === undefined ? Error.call(this, message || '') : err;
		this.name = error === err ? 'RunTimeError' : 'UserGeneratedError';
		this.message = message || '';
		this.stack = error.stack;
		this.status = status;
	}
}
interface Json {
	[x: string]: string | number | boolean | Date | Json | [Json];
}
export type MessageData = Json | string | number | boolean | MessageData[];
export type Callback = (request: Request, response: RouterResponse) => Promise<void>;
export type Store = Record<'get' | 'put' | 'patch' | 'post' | 'delete', Record<string, Callback[]>>;

export type RouterResponse = {
	_id: number;
	code?: HttpStatusCode | null;
	status: (code: HttpStatusCode | null) => RouterResponse;
	data?: MessageData | null;
	send: (data: MessageData) => RouterResponse;
};
export type ClientResponse = {
	_id: number;
	status: HttpStatusCode;
	data: MessageData;
};
export type ClientRequest = {
	body: MessageData;
	forget?: boolean;
};
export type Request = {
	id?: number;
	body: MessageData;
	get?: string;
	post?: string;
	put?: string;
	patch?: string;
	delete?: string;
};
export type ClientPromiseStore = Record<
	string,
	{
		resolve: (value: ClientResponse | PromiseLike<ClientResponse>) => void;
		reject: (value: ClientResponse | PromiseLike<ClientResponse>) => void;
	}
>;
export const store: Record<string | number, WebSocket.WebSocket> = {};
