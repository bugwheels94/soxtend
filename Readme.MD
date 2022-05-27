## Websocket Plus

This provides an HTTP similar API for using Websockets in Node/Browser.

## Example

    // Sending Message
    const wsp = new WebSocket(socket)
    wsp.client.post('/friend-request', { body: {
      userId: 'johndoe'
    }})


    // Receiving Message
    const wsp = new WebSocket(socket)
    wsp.router.post('/friend-request', (req, res) => {
      const userId = req.data.userId
      wsp.client.post('/friend-request', {
        body: {
          senderId: socket.id
        },
        socketId: userId
      })
    })

    // Receiving Message on the receiver browser

    const wsp = new WebSocket(socket)
    wsp.router.post('/friend-request', (req, res) => {
      const userId = req.data.userId
      // Show friend request popup using req.data
      res.status(200)
    })

## Template
