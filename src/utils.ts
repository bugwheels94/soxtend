import { TextEncoder, TextDecoder } from 'util';

import WebSocket from 'isomorphic-ws';
import HttpStatusCode from './statusCodes';
export enum DataType {
	JSON = 0,
	TEXT,
	BINARY,
}
const decoder = new TextDecoder('utf8');
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

export function parseBrowserMessage(data: WebSocket.Data) {
	/**
	 * To Server From Browser
	 * (8BitMethod)(8BitIsIdPresent)(8BitIsHeaderPresent)(16BitRequestId)(16BitURLLength)(URL)(16BitHeaderLength)(Header)(8BitBodytype)(Body)

	 * 
	 */

	if (!(data instanceof Buffer)) return null;
	const ui8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	let index = 3;
	const isHeaderPresent = ui8[2];
	const isIdPresent = ui8[1];
	const method = ui8[0];
	let requestId: number | undefined;
	if (isIdPresent) {
		requestId = ui8[index++] * 255 + ui8[index++];
	}
	// const status = highestPrecedenceStatusBit * 255 + ui8[index++];
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

	try {
		if (dataType === DataType.JSON) message = JSON.parse(decoder.decode(rawData));
		if (dataType === DataType.TEXT) message = decoder.decode(rawData);
		if (dataType === DataType.BINARY) message = rawData;
	} catch (e) {
		const str = decoder.decode(rawData);
		console.log(
			'WOWOW',
			`<>${str}<>`,
			{ method, isHeaderPresent, isIdPresent, url, urlLength },
			{ 16: str[16], 17: str[17], 18: str[18], 19: str[19], 20: str[20], 21: str[21], 22: str[22] },
			e
		);
	}
	return {
		requestId,
		url,
		method,
		header,
		body: message,
	};
}
const encoder = new TextEncoder();

export function createMessageForBrowser(
	url: string | undefined,
	method: MethodEnum,
	headers: Record<string, string | number> | undefined,
	status: HttpStatusCode | undefined,
	requestId: number | undefined,
	data?: any
) {
	/**
	 * Format of message:
	 * To Browsers:
	 * (24BitMessageId)(Method)(wasRequestIdPresent)(16BitStatus)(isHeaderPresent)(16BitRequestIdToResolveBrowserPromise)(16BitURLLength)(URL)(16BitHeaderLength)(Header)(8BitDatatype)(Data)
	 *
	 */
	const headerEncoded = headers ? encoder.encode(JSON.stringify(headers)) : '';

	let binaryPayload: Uint8Array | undefined = undefined;
	let dataType: null | DataType = null;
	if (data instanceof Uint8Array) {
		binaryPayload = data;
		dataType = DataType.BINARY;
	} else if (typeof data === 'string') {
		dataType = DataType.TEXT;
		binaryPayload = encoder.encode(data);
	} else if (data) {
		dataType = DataType.JSON;
		binaryPayload = encoder.encode(JSON.stringify(data));
	}

	const urlEncoded = encoder.encode(url);

	const messageIdLength = 3;
	const dataLength =
		messageIdLength +
		1 +
		1 +
		2 +
		1 +
		(requestId ? 2 : 0) +
		2 +
		urlEncoded.length +
		(headerEncoded ? 2 + headerEncoded.length : 0) +
		(binaryPayload ? binaryPayload.length + 1 : 0);
	// Concating TypedArray isfaster than concatting strings
	const finalMessage = new Uint8Array(dataLength);
	let filledLength = messageIdLength;
	finalMessage[filledLength++] = method;

	if (requestId !== undefined) {
		finalMessage[filledLength++] = 1;
	} else filledLength++;

	if (status) {
		finalMessage[filledLength++] = Math.floor(status / 255);
		finalMessage[filledLength++] = status % 255;
	} else filledLength += 2;

	if (headerEncoded) {
		finalMessage[filledLength++] = 1;
	} else filledLength++;

	if (requestId !== undefined) {
		finalMessage[filledLength++] = Math.floor(requestId / 255);
		finalMessage[filledLength++] = requestId % 255;
	}
	finalMessage[filledLength++] = Math.floor(urlEncoded.length / 255);
	finalMessage[filledLength++] = urlEncoded.length % 255;

	finalMessage.set(urlEncoded, filledLength);
	filledLength += urlEncoded.length;

	if (headerEncoded) {
		const headerLength = headerEncoded.length;
		if (headerLength > 255) {
			finalMessage[filledLength++] = Math.floor(headerLength / 255);
		} else finalMessage[filledLength++] = 0;
		finalMessage[filledLength++] = headerLength % 255;

		finalMessage.set(headerEncoded, filledLength);
		filledLength += headerEncoded.length;
	}

	if (dataType !== null) {
		finalMessage[filledLength++] = dataType;
		finalMessage.set(binaryPayload, filledLength);
	}
	return finalMessage;
}
