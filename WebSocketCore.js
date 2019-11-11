/**
 * Вебсокет
 */

// Для доп функций
let http = require('http');
let https = require('https');
let OneUser = require('./OneUser.js');
let bcrypt = require('bcryptjs');
let util = require('util');


/**
 * Сервер
 */
let WebSocketServer = require('ws').Server, wss;

/**
 * Шифрование на серве
 */
let fs = require('fs');

/*
let options = {
	key:fs.readFileSync('key.pem'),
	cert:fs.readFileSync('cert.pem')
};
*/

// Хеш-функции
let crypto = require('crypto');

// Ключ рандомизации хеша
let randomHashKey = "yT7P/9B{.RWPLQu,Alj86F,/l]6=h_m_?R2yokw=kUH1<<(mm9yMm(]JS~lCY8Bt";

/**
 * Класс, реализующий стандартные механизмы вебсокетов: коннект, получение и отправку сообщений
 */
class BaseWebSocket {
    
    /**
     * Базовый конструктор для предзагрузки значений
     */
    constructor() {
    
        /**
         * К этому сокету можно подключаться
         * @type {boolean}
         */
        this.init = true;
        
        /**
         * Пользователи
         * @type {Array<OneUser>}
         */
        this.USERS = [];
    
        /**
         * Использовать ли переопределяемый метод PureAuth для авторизации или пропускать всех
         * @type {boolean}
         */
        this.useCustomAuth = false;
        
    }
    
    
    /**
     * Старт нового сервера и запуск соединения
     * Определение базовых методов
     */
    start(port) {
    
        // Сервер
        wss = new WebSocketServer({port: port});
    
        // Базовый класс для доступа извне
        let me = this;
    
        /**
         * При новом соединении
         */
        wss.on('connection', function (ws) {
        
            /**
             * Проверяем работоспособность систем
             * При отсутствии работоспособности разрываем любые коннекты
             */
            if (!me.init) {
                //console.log('Сервер не инициализирован, сброс соединения через 3 сек');
                setTimeout(function () {
                    me.closeConnect(ws);
                }, 3000);
                return false;
            }
        
            // Логируем коннекты
            console.log('Новое соединение');
        
            // Теперь ждём сообщения авторизации
        
            // Получили сообщение
            ws.on('message', async function (message) {
            
                /**
                 * Все запросы имеют формат:
                 * [
                 *      type=> тип запроса
                 *      data=> данные
                 * ]
                 */
            
                // Парсим сообщение
                let json;
            
            
                let d = new Date();
                let LogDT = d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
            
                // Пробуем парсить
                try {
                    json = JSON.parse(message);
                } catch (exception) {
                    // Неверное JSON сообщение-> разрываем коннект [и в будущем даём бан]
                    console.log('Неверное JSON сообщение-> разрываем коннект');
                    console.log(LogDT + ' ' + message);
                    me.closeConnect(ws);
                    return false;
                }
            
                // В лог
                //console.log('Входящее сообщение. Распаршено успешно');
            
                /**
                 * Проходимся по типам запроса
                 */
                switch (json.type) {
            
                // Авторизация
                    case 'auth': {
                    
                        // Авторизацию всегда логируем
                        console.log(LogDT + ' AUTH ' + message);
                    
                        /**
                         * Делаем авторизацию внешним классом, который должен вернуть её результат
                         */
                        await me.auth(json, ws, (user, errMessage) => {
                        
                            // Авторизация не прошла
                            if (user === false || !user.isAuthorized) {
                                console.log('Авторизация не прошла' + ': ' + errMessage);
                                me.closeConnect(ws, errMessage, "auth error");
                                return true;
                            }
                        
                            // Успешное подключение
                            console.log('Авторизация пройдена: ' + "ID#" + user.ID + " " + user.login);
                        
                            // Записываем сессию в WS
                            ws.UserSession = user.session;
                        
                            // Первичная прогрузка данных
                            me.loadUser(user, json);
                        
                        });
                    
                        break;
                    }
            
                // Любое другое сообщение
                    default: {
                    
                        // Логируем все остальные пакеты, если нужно
                        if (me.isLog(json.type)) {
                            console.log(LogDT + " " + message);
                        }
                    
                        /**
                         * Текущий пользователь
                         * @type OneUser;
                         */
                        let me_user;
                    
                        // Если нет авторизации: прерываем соединение
                        // Пропускаем в дальнейшую обработку только авторизованных
                        if (ws.UserSession === undefined) {
                            console.log("Нет авторизации. Закрываю");
                            me.closeConnect(ws);
                            return false;
                        } else {
                        
                            // Ключ сессии послан: находим пользователя по ключу
                            me_user = me.findUserBySession(ws.UserSession);
                        
                        
                            // Если пользователя не найдено - дисконнект и бан
                            if (me_user === false) {
                                console.log("Пользователя не найдено - подозрение на хак");
                                me.closeConnect(ws);
                                return false;
                            }
                        
                        }
                    
                        // Пользователь найден и авторизован - передаём управление в переопределяемый метод
                        // обработки любых сообщений
                        let isMessageOk = await me.getMessage(json, me_user, message);
                    
                        // При плохом исходе парса - делаем дисконнект
                        if (!isMessageOk) {
                            me.closeConnect(ws, "");
                            console.log("Bad parsing client message");
                            return false;
                        }
                    
                    }
                
                }
            
            
            });
        
            // Не завершаем работу при ошибках коннекта, а просто их логируем
            ws.on('error', async (err) => {
                if (ws.UserSession !== undefined) {
                    await me.userDisconnect(ws.UserSession, ws);
                }
                console.log('Socket Error: ' + err);
                me.closeConnect(ws, err);
            });
        
            // При закрытии соединения [по любой причине]: закрываем сессию
            ws.on('close', async function () {
                await me.userDisconnect(ws.UserSession, ws);
            });
        
            // Реализуем механику пинг-понга для вычисления соединений, которые были сброшены без закрывающего фрейма (из-за чего они не стимулируют onClose самостоятельно)
            ws.isAlive = true;
            ws.on('pong', function () {
                this.isAlive = true;
            });
            ws.PingPongInterval = setInterval(async function ping() {
                if (ws.isAlive === false) return await me.userDisconnect(ws.UserSession, ws);
                ws.isAlive = false;
                ws.ping();
            }, 10800000); // 3 часа (для сервера надо ставить 30 сек-минута) - период проверки, и одновременно таймаут. Просто проверяет за каждый тик дошёл ли предыдущий. Очень быстрая реализация.
        
        });
    
        console.log("Сервер запущен на порт " + port);
    
    }
    
    /**
     * Базовый коннект
     * @returns {OneUser}
     */
    userConnect(ws,userID, session) {
        
        // Создаём новую модель пользователя
        let user=new OneUser(ws);
        
        // Генерим ID сессии
        let hash = crypto.createHash('sha256').update(Date.now() + randomHashKey + userID).digest('hex');
        
        if(session===undefined)
            user.session = hash;
        else
            user.session = session;
        
        // ID пользователя
        user.ID = userID;
        
        
        // Добавляем нового пользователя в массив
        this.USERS.push(user);
        
        // Логируем соединение
        console.log('Пользователь подключён, сессия: ' + hash);
        
        // возвращаем ссылку на пользователя
        return user;
        
    }
    
    /**
     * Завершить сессию пользователя
     * @param sessionID
     * @param {WebSocket} ws
     */
    async userDisconnect(sessionID, ws = null) {
        
        let that = this;
        
        if(ws===null) debugger;
        
        // Если сессия ещё не была назначена - просто завершаем
        if(sessionID===undefined || sessionID===null){
            if(ws!==null) {
                clearInterval(ws.PingPongInterval);
                ws.close();
                console.log('Пользователь ' + ws._socket.remoteAddress + '[не присвоена сессия] - отключён');
            }
            else
                console.log('Ошибка: не переданно сессии, не передано объекта при закрытии');
            
            return true;
        }
        
        
        
        // ищем пользователя по сессии
        for(let i=0;i<that.USERS.length;i++) {
            
            if(that.USERS[i].WebSocket===ws) {
                
                // Чистим интервал
                clearInterval(that.USERS[i].WebSocket.PingPongInterval);
                
                // Делаем дисконнект
                that.USERS[i].WebSocket.close();
                
                // Удаляем сессию
                let removedUser = that.USERS.splice(i, 1);
                
                // Юзер отсоединён
                console.log('Сессия пользователя ' + sessionID + ' закрыта');
                
                await that.AfterDisconnect(removedUser, ws);
                
            }
            
        }
        
    }
    
    /**
     * Закрыть текущий коннект
     */
    closeConnect(ws,err,type) {
        
        console.log('Разрываю соединение с пользователем.');
        
        // Отсылаю сообщение об ошибке перед разрывом
        if(err!==undefined) {
            
            let msg = '';
            
            if (type===undefined) msg = '{"type":"err","errText":"'+err+'"}';
            else msg = '{"type":"'+type+'","errText":"'+err+'"}';
            
            // Если есть сообщение - отсылаем его
            ws.send(msg,()=>{
                
                // и в консоль тоже
                console.log(err);
                
                // Чистим пинг-понг
                clearInterval(ws.PingPongInterval);
                
                // Делаем дисконнект после отсылки
                ws.close();
                
            });
            
            
        }
        else {
            
            // Чистим пинг-понг
            clearInterval(ws.PingPongInterval);
            
            // Сообщения нет: просто разрываем
            ws.close();
        }
        
        return true;
    }
    
    /**
     * Переопределяемое событие после дисконнекта
     * @param user
     * @param ws
     * @return {Promise.<void>}
     * @constructor
     */
    async AfterDisconnect(user, ws) {
        return;
    }
    
    /**
     * Авторизация
     * @param json
     * @param ws
     * @param callback
     * @returns {OneUser}
     */
    async auth(json,ws,callback) {
        
        let that = this;
        
        // Если авторизация по сессии - запускаем её
        let userid;
        if(json.session!==undefined) {
            if( await that.authSession(json.session) )
                userid = that.USERS.length;
            else {
                callback(false, "Bad session");
                return;
            }
        }
        else {
            // Если не нужна сложная авторизация
            if (!that.useCustomAuth)
            // Присваиваем порядковый номер стандартному пользователю
                userid = that.USERS.length;
            
            // Авторизуемся сложной авторизацией, она должна вернуть ID человечка
            else if (!(userid = await that.authPure(json.login, json.password, json.session))) {
                callback(false, "Bad login or password");
                return;
            }
        }
        
        // Новый юзер
        let user = this.userConnect(ws,userid);
        
        // Указываем, что юзер авторизован
        user.isAuthorized = true;
        
        // Запускаем коллбек с готовым результатом
        callback(user);
        
        // Возвращаем его для генерации ключей сессии
        return user;
        
    }
    
    /**
     * Сложная авторизация
     * Функция по-умолчанию авторизуется в базе https://github.com/FlameArt/auto-rest-template-yii2
     * Надо переопределить, чтобы реализовать вашу авторизацию
     * @param login
     * @param passw
     * @param session
     * @return Promise<boolean|object>
     */
    async authPure(login, passw, session) {
    
        let that = this;
    
        // Если проверка по сессии
        if (session !== undefined && login === undefined && passw === undefined) {
            if(await that.authSession(session)) ;
            return false;
        }
    
        // Проверяем наличие всех параметров
        if (passw === undefined || login === undefined) {
            console.log('Не все параметры в логине Чистой авторизации. Подозрение на хак');
            return false;
        }
    
        let passwHash = OneUser.hashPassword(passw);
    
        // Делаем запрос в базу и ищем пользователя
        let findedUser = await that.SQL.one("SELECT * FROM users_backend WHERE username=?", [login, passwHash]);
    
        // Юзер не найден - дисконнектимся
        if (findedUser.length===0) {
            return false;
        }
    
        // Сравниваем хеш пароля
        let hashVerify = bcrypt.compareSync(passw, findedUser.password_hash.replace("\$2y\$", "\$2a\$"));
    
        // Проверка пароля не пройдена
        if (!hashVerify) {
            return false;
        }
    
        // TODO: копии пользователей пропускаем сейчас [пока на сайте не сделана авторизация все будут CatViewer]
        
    
        // Авторизация пройдена
        return findedUser;
    
    }
    
    /**
     * Авторизация по сессии
     * @param uuid
     * @param callback
     * @return {Promise<boolean>}
     */
    async authSession(uuid, callback) {
        // По-умолчанию успешна
        return true;
    }
    
    
    /**
     * Получено нестандартное сообщение: обработать его
     * @param {object} json
     * @param {OneUser} user
     * @param {string} rawdata Чистые пришедшие данные
     * @returns {Promise<boolean>}
     */
    async getMessage(json, user, rawdata) {
        
        // По умолчанию возвращаем успешный распарс
        return true;
        
    }
    
    /**
     * Первичная прогрузка всех данных или действие
     */
    loadUser(user){
        return true;
    }
    
    /**
     * Найти пользователя по его сессии
     * @param sessID
     * @returns {*}
     */
    findUserBySession(sessID) {
        let that = this;
        for(let usr=0; usr<that.USERS.length; usr++) {
            if(that.USERS[usr].session===sessID) {
                return that.USERS[usr];
            }
        }
        return false;
    }
    
    /**
     * Отправить всем пользователям
     * @param data
     * @param isLogging
     */
    sendAllUsers(data, isLogging=false) {
        
        let that = this;
        
        // сводим объект к строке
        let json;// = JSON.stringify(data);
        
        // Если на вход подана уже строка, то не делаем этого
        if( typeof data !== "string" )
            json = JSON.stringify(data);
        else
            json = data;
        
        // перебираем всех пользователей
        for(let i=0;i<this.USERS.length;i++) {
            
            // Проверяем если пользователь авторизован
            if(that.USERS[i].isAuthorized) {
                
                // отправляем каждому
                if(that.USERS[i].WebSocket.readyState===1) {
                    that.USERS[i].WebSocket.send(json);
                }
                
            }
            
        }
        
        if(isLogging)
            console.log("SEND: " + json);
        
    }
    
    /**
     * Логировать ли сообщение в консоль?
     * @param jsonType
     * @return {boolean}
     */
    isLog(jsonType) {
        // По умолчанию логируем все пакеты
        return true;
    }
    
}

module.exports=BaseWebSocket;