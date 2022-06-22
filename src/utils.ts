import WebSocket from 'isomorphic-ws';
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

export type Method = 'get' | 'put' | 'patch' | 'post' | 'delete';
export const store: Record<string | number, WebSocket> = {};
