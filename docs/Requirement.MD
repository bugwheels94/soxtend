# User Stories

1. Should support multi node
2. Should support delivery of messages again for reconnected browsers
3. Should be as close to HTTP as possible
4. Should support middle ware auth like expressJS and also support tradition auth of WS, i.e. check auth during upgrade WS request
5. Should support addition of new WS servers dynamically

## When browser loses Server Connection

1. When browser loses connection then attempt reconnect using exponential backoff algorithm
2. On reconnect, pass last message id that was received/processed by browser and request messages from that point
3. Timely sent ack from browsers to server to clear messages that have been consumed

### Data Structures

1. Message structure to browser

   $BrowserMessage = $method$status|$url|$data

## When server loses Redis Connection

### Problems

1. Server will be unaware of other ws servers
2. Server will not be able to push into redis the messages for browser reconnects

### Solutions

1. Solution 1: On Redis Reconnect, reload all browser connections

### Strategy to inform other WS Server of new message from one server

1. Pub/Sub

   1. Each server will have an id named serverId and redis will store {[connectionId]: serverId}.
   2. Each server will store map of all connectionId to Websocket instance
   3. Redis will have pub/sub channel equal to serverId
   4. To send a message to server with serverId just publish message on the channel named serverId

      (groupId|connectionId):$BrowserMessage

   5. Listening server will get the message and send it to proper connection
   6. Group messaging can be done via a structure SET with (serverId)
   7. Each server will store groups in nodejs memory {[groupId]: Set<Wrapper<WebSocket>>)}, plus we need {[connectionId]: Wrapper<WebSocket>}
   8. Message will be prepared once for all the sockets and ideally we should also do one redis call for one message

2. Persisting (Blpop, stream, kafka)

### Strategy to keep message so the browsers can request on reconnect

1. Push batches into redis stream/kafka with message sent to browser in parallel

Exception: When browser reconnects and few messages are still waiting to be batched to redis so we need to take the pending messages into account too.

2. Browser will give last message id for the remaining messages
3. Timely sent ack from browsers to server to clear messages that have been consumed
4. Inspect on the side of browser by message sequence number to know any lost messages(for UDP only needed and WS is TCP so kind of not needed)
   .
