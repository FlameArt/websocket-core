/**
 * Один пользователь, подключённый к WebSocket`у
 */
class OneUser {
    
    constructor(ws=null) {
        
        /**
         * Номер в базе, если есть
         * @type {number}
         */
        this.ID = 0;
        
        /**
         * Авторизован ли пользователь
         * @type {boolean}
         */
        this.isAuthorized = false;
        
        /**
         * Логин пользователя, если есть
         * @type {string}
         */
        this.login = "";
        
        if ( ws !== null )
            /**
             * Ссылка на соединение с пользователем для оптравки сообщений
             * @type {WebSocket}
             */
            this.WebSocket = ws;
        
        /**
         * Уникальный ключ сессии
         * @type {string}
         */
        this.session = "";
        
        if ( ws !== null )
            /**
             * IP адрес
             * @type {string}
             */
            this.ip = this.WebSocket._socket.remoteAddress;
        
        /**
         * Тип пользователя: 0 - смотритель админки, 1 - работа в клиенте
         * @type {number}
         */
        this.type = 0;
    
        /**
         * Информация о пользователе из базы
         * @type {{id: number}}
         */
        this.info = {
            id: 0
        };
        
    }
    
}

module.exports = OneUser;