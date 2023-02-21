import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';

const decoder = new TextDecoder('utf8');

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

export type Method = 'get' | 'put' | 'patch' | 'post' | 'delete';
export const store: Record<string | number, WebSocket[]> = {};
export enum MethodEnum {
	GET = 0,
	POST,
	PUT,
	PATCH,
	DELETE,
}

export async function parseServerMessage(data: WebSocket.Data) {
	if (!(data instanceof Blob)) return null;
	const ui8 = new Uint8Array(await data.arrayBuffer());
	let index = 3;
	const messageId = ui8[0] * 255 * 255 + ui8[1] * 255 + ui8[2];
	const method = ui8[index++];
	const isRespondingToPreviousMessage = ui8[index++];
	const status = ui8[index++] * 255 + ui8[index++];
	const isHeaderPresent = ui8[index++];
	let respondingMessageId: number | undefined;
	if (isRespondingToPreviousMessage) {
		respondingMessageId = ui8[index++] * 255 + ui8[index++];
	}
	const urlLength = ui8[index++] * 255 + ui8[index++];
	const url = decoder.decode(ui8.subarray(index, index + urlLength));
	index += urlLength;

	let header: Record<string, string>;
	if (isHeaderPresent) {
		const headerLength = ui8[index++] * 255 + ui8[index++];
		header = JSON.parse(decoder.decode(ui8.subarray(index, index + headerLength)));
		index += headerLength;
	}
	const dataType = index < ui8.length ? ui8[index] : -1;
	const rawData = dataType !== -1 ? ui8.subarray(index + 1, ui8.length) : null;
	let message: any;
	if (dataType === DataType.JSON) {
		message = JSON.parse(decoder.decode(rawData));
	}
	if (dataType === DataType.TEXT) message = decoder.decode(rawData);
	if (dataType === DataType.BINARY) message = rawData;

	return {
		method,
		header,
		data: message,
		messageId,
		status,
		respondingMessageId,
		url,
	};
}
