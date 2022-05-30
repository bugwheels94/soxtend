import WebSocket from 'isomorphic-ws';
import { MatchFunction } from 'path-to-regexp';
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
export type Route = {
	literalRoute: string;
	match: MatchFunction<any>;
	callbacks: Callback[];
};
export type Method = 'get' | 'put' | 'patch' | 'post' | 'delete';
export type Store = Record<Method, Route[]>;

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
	body?: MessageData;
	forget?: boolean;
	id?: never;
	get?: never;
	put?: never;
	patch?: never;
	delete?: never;
	post?: never;
};
export type Request = {
	id?: number;
	body?: MessageData;
	params: Record<string, string | number>;
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
export const store: Record<string | number, WebSocket> = {};
