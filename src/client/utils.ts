import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';

export enum DataType {
	JSON = 0,
	TEXT,
	BINARY,
}
export type DefaultSerialize = (_: JsonObject) => string;
export type FlexibleSerialize = (_: JsonObject) => AllowedType;
export type DefaultDeserialize = (_: ArrayBuffer | string) => JsonObject;
export type FlexibleDeserialize = (_: ArrayBuffer | string) => any;

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
export const store: Record<string | number, WebSocket[]> = {};
export enum MethodEnum {
	GET = 0,
	POST,
	PUT,
	PATCH,
	DELETE,
	META,
}
export type JsonObject = {
	[key: string]: string | number | boolean | null | JsonObject | JsonObject[];
};
export type AllowedType = string | Uint8Array;
