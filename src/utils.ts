import { TextEncoder, TextDecoder } from 'util';

import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
export enum DataType {
	JSON = 0,
	TEXT,
	BINARY,
}
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
export type JsonObject =
	| string
	| {
			[key: string]: string | number | boolean | null | JsonObject | JsonObject[];
	  };
export type Method = 'get' | 'put' | 'patch' | 'post' | 'delete' | 'meta';
export const store: Record<string | number, WebSocket[]> = {};
export enum MethodEnum {
	GET = 0,
	POST,
	PUT,
	PATCH,
	DELETE,
	META,
}
export type AllowedType = 'string' | 'binary';
export type DataMapping<T> = T extends 'string' ? string : T extends 'binary' ? Uint8Array : never;

export type Serialize<T> = (message: JsonObject) => T;
export type Deserialize = (_: Buffer) => JsonObject;
export type DefaultSerialize = (_: JsonObject) => string;
export type FlexibleSerialize = (_: JsonObject) => AllowedType;
export type DefaultDeserialize = (_: Buffer) => JsonObject;
export type FlexibleDeserialize = (_: Buffer) => any;

export function serialize(obj: { id: number; name: string; data: any }): Uint8Array {
	const encoder = new TextEncoder();

	// Convert id to 2 bytes
	const idBuffer = new Uint8Array(2);
	idBuffer[0] = obj.id & 0xff;
	idBuffer[1] = (obj.id >> 8) & 0xff;

	// Convert name to Uint8Array
	const nameBuffer = encoder.encode(obj.name);

	// Convert body to Uint8Array
	let bodyBuffer: Uint8Array;
	if (typeof obj.data === 'string') {
		bodyBuffer = encoder.encode(obj.data);
	} else if (obj.data instanceof Uint8Array) {
		bodyBuffer = obj.data;
	} else {
		const bodyJson = JSON.stringify(obj.data);
		bodyBuffer = encoder.encode(bodyJson);
	}

	// Create result buffer
	const buffer = new Uint8Array(2 + 1 + nameBuffer.length + 1 + bodyBuffer.length);
	buffer.set(idBuffer, 0);
	buffer[2] = nameBuffer.length;
	buffer.set(nameBuffer, 3);
	buffer[3 + nameBuffer.length] = bodyBuffer.length;
	buffer.set(bodyBuffer, 4 + nameBuffer.length);

	return buffer;
}
export function deserialize(buffer: Uint8Array): { id: number; name: string; data: any } {
	const decoder = new TextDecoder();

	// Extract id
	const id = buffer[0] | (buffer[1] << 8);

	// Extract name
	const nameLength = buffer[2];
	const nameBuffer = buffer.slice(3, 3 + nameLength);
	const name = decoder.decode(nameBuffer);

	// Extract body
	const bodyLength = buffer[3 + nameLength];
	const bodyBuffer = buffer.slice(4 + nameLength, 4 + nameLength + bodyLength);
	let body: any;
	try {
		body = JSON.parse(decoder.decode(bodyBuffer));
	} catch (e) {
		body = bodyBuffer;
	}

	return { id, name, data: body };
}
