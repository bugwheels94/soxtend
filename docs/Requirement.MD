# User Stories

1. Should support multi node
2. Should support delivery of messages again for reconnected browsers
3. Should provide an interface as close to REST as possible
4. Should support middle ware auth like expressJS and also support tradition auth of WS, i.e. check auth during upgrade WS request
5. Should support addition of new WS servers dynamically
6. Should also be usable purely dual channel unlike REST.

Raw Generic API should be:

On Server

const server = new WebsocketServer("", {
serializer, deserializer
});
const [de]serializer = new [De]Serializer([
{
name: "status",
size: 1
},
{
name: "method",
size: 1
},
{
name: "body"
}
])
server.on("connection", socket => {
socket.on(message, Uint8Array => {
const data = deserialize(Uint8Array)
})
Uint8Array = serializer.serialize({

})
Uint8Array = serializer.serialize([])
server.send(message, Uint8Array)

})

server.sendToGroup()
socket.joinGroup()
server.sendToIndividual()
const router = new Router(server);
router.get("/resource/:resourceId", async (req, res) => {

})

We need a way to let know of the formatting

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

   1. Each server will have an id named serverId and redis will store
      connectionId: serverId
   1. Each server will store map of all connectionId to Websocket instance
   1. Redis will have pub/sub channel equal to serverId
   1. To send a message to server with serverId just publish message on the channel named serverId

      Message format: `${(groupId|connectionId):${BrowserMessage}`

      groupId: Set<serverId>
      connectionId: serverId
      Above DS can be used to get all servers for a group/connection

   1. Listening server will get the message and send it to proper connection using two data structures

      groupId: Set<Socket>
      connectionId: Socket

   1. Message will be prepared once for all the sockets and ideally we should also do one redis call for one message
   1. On Reconnect of socket,

      1. Browser will send a message with connectionId to the server

      1. Get all of the groupId from some store stored in below data structure
         connectionId: Set<groupId>

      1. In #3 add newly connected socket's server Id to the groupId: Set<serverId>
      1. In #3, replace old serverId with newly connected socket's serverId in connectionId: serverId
      1. In #4, add current socket to all of the groupId: Set<Socket> and connectionId: Socket

2. Persisting (Blpop, stream, kafka)

### Strategy to keep message so the browsers can request on reconnect

1. Push batches into redis stream/kafka with message sent to browser in parallel

Exception: When browser reconnects and few messages are still waiting to be batched to redis so we need to take the pending messages into account too.

2. Browser will give last message id for the remaining messages
3. Timely sent ack from browsers to server to clear messages that have been consumed
4. Inspect on the side of browser by message sequence number to know any lost messages(for UDP only needed and WS is TCP so kind of not needed)
   .
   Conclusion: Too hard to implement. Solution will be very buggy and might use significant storage and performance. Very hard to adapt to individual app needs as many apps might need more granular control over what to fetch on reconnect or not.

### Restify Adapter

Servers can either respond to client or just send one way to client.
Clients can either make request to server or just listen to server via a receiver.
client.addServerResponseListenerFor.get("/resource").stopListening()
