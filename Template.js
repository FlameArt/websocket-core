/**
 * Пример реализации АПИ и вебсокетов
 */

// Исходные классы
const WebSocketCore = require ("./WebSocketCore.js");

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
	
	/**
	 * Override this method for custom auth
	 * @param login
	 * @param passw
	 * @param session
	 * @return {Promise<boolean|object>}
	 */
	async authPure(login, passw, session) {
		// return auth result: user info, if success, and false if auth failed
		return login === passw ? {UserID: 'UserWithCoolPassw'} : false;
	}
	
}

const MyWS = new MyWebSocket();
MyWS.start(7000);
