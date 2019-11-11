# WebSockets

Websocket mini-framework for fast start work with many-clients and process messages on `Node.js`

    npm install --save FlameArt/websocket-core

## Features
* Run websocket server and work with json-messages in 3 lines of code
* **Multiply users model** with session per each
* All messages in json with `type` for each action
* **Authentication model**: by default with any login and pass.
* You can create you own async authentication and authorization  methods
* Automatic **Ping-Pong** all clients and normal close dirty-disconnected users
* Send message to all clients or override with you own filter
* Lib has not map, filters and other slowly methods, but you can use it

## Getting started

Just extend `WebSocketCore` and override handlers:

```
const WebSocketCore = require("websocket-core");

class MyWebSocket extends WebSocketCore {
	
	async getMessage(json, user, rawdata) {
		
		console.log("Detected message from user #" + user.ID + "/" + user.ip + " [" + json.type + "] " + rawdata);
		
		// Send to that client
		user.WebSocket.send("Hello, newbie! Your session now is " + user.session);
		
		// Send to all clients
		this.sendAllUsers("Welcome to our new user #" + user.ID);
		
		// Message correct
		return true;
		
	}

}

// Run websocket on port 7000
const MyWS = new MyWebSocket();
MyWS.start(7000);

```

## Custom auth method

Just override `WebSocketCore->authPure` method and set `WebSocketCore.useCustomAuth = true`

	async authPure(login, passw, session) {
		// return auth result: user info, if success, and false if auth failed
		return login === passw ? {UserID: 'UserWithCoolPassw'} : false;
	}

User info will be stored in `user.info`

## License
MIT