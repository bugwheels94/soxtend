## Restify Websocket

This provides a very lightweight HTTP similar API for using Websockets in Node/Browser. This library is not an alternative to node "ws" package but is intended to be used as a complimentary package.

## Example

    // Sending Message
    const { client, router } = new RestifyWebSocket(socket)
    client.post('/users', { body: {
      userId: 15372
    }})
    client.put('/users/15372', { body: {
      age: 60
    }})


    // Receiving Message
    const { client, router } = new RestifyWebSocket(socket)
    router.post('/users', (req, res) => {
      const userId = req.data.userId
      // save in DB and get user
      res.status(200).send(user)
    })
    router.put('/users/:userId', (req, res) => {
      const userId = req.params.userId
      // save in DB and get user
      res.status(200).send(user)
    })

    // In browser it is recommended to pass url to RestifyWebSocket as it also handles reconnect

    const {router, client, socket} = new RestifyWebSocket("server-url")
    // Avoid using socket because in case of redirect you might end up pointing to old socket instance
