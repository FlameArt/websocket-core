/**
 * Вебсокет
 */

// Для доп функций
let http = require('http');
let https = require('https');


/**
 * Сервер
 */
let WebSocketServer = require('ws').Server,
	wss;
/**
 * Активные пользователи
 * Формат:
 * {User Encrypted Key} = User
 * Доступ по шифрованному ключу (случайный набор символов), который он присылает для своей авторизации при загруке
 * и затем хранит всю сессию
 */
let USERS = [];

// Хеш-функции
let crypto = require('crypto');

// Секретные ключи для авторизации и подписывания
let currentSecretKey = "yT7P/9B{.RWPLQu,Alj86F,/l]6=h_m_?R2yokw=kUH1<<(mm9yMm(]JS~lCY8Bt";
let currentPasswSalt = "ddC?IP*PNRWU99v8Gj0i0*dy;m?L:)g!ci4npz*cV7M069zy2?5XUDcEz+4p[}Ye";

/**
 * Класс, реализующий стандартные механизмы вебсокетов: коннект, получение и отправку сообщений
 */
class BaseWebSocket {

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
            if (!me.sql.connected) {
                this.closeConnect(ws);
				console.log('Нет соединения с базой. Сброс входящего соединения');
                return false;
            }

            // Логируем коннекты
            console.log('Новое соединение');

            // Теперь ждём сообщения авторизации

            // Получили сообщение
            ws.on('message', function (message) {

                /**
                 * Все запросы имеют формат:
                 * [
                 *      type=> тип запроса
                 *      data=> данные
                 * ]
                 */

                    // Парсим сообщение
                let json;

				let d=new Date(); let dt = d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
                console.log(dt+' '+message);

                // Пробуем парсить
                try {
                    json = JSON.parse(message);
                }
                catch (exception){
                    // Неверное JSON сообщение-> разрываем коннект [и в будущем даём бан]
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

						 /**
                         * Делаем авторизацию внешним классом, который должен вернуть её результат
						 */
						me.auth(json,ws,(user, errMessage)=>{

							// Авторизация не прошла
							if (user===false || !user.isAuthorized) {
								console.log('Авторизация не прошла'+': ' + errMessage);
								me.closeConnect(ws,errMessage,"auth error");
								return true;
							}

							// Успешное подключение
							console.log('Авторизация пройдена');

							// При закрытии соединения [по любой причине]: закрываем сессию
							ws.on ('close', function () {
								me.userDisconnect(user.session)
							});

							// Первичная прогрузка данных
							me.loadUser(user);

						});

                        break;
                    }

                    // Любое другое сообщение
                    default: {

                        /**
                         * Текущий пользователь
                         * @type OneUser;
                         */
                        let me_user;

                        // Если нет авторизации: прерываем соединение
                        // Пропускаем в дальнейшую обработку только авторизованных
                        if(json.session===undefined) {
                            console.log("Нет авторизации. Закрываю");
                            me.closeConnect(ws);
                            return false;
                        }
                        else {

                            // Ключ сессии послан: находим пользователя по ключу
							me_user =  me.findUserBySession(json.session);


                            // Если пользователя не найдено - дисконнект и бан
                            if (me_user===false) {
								console.log("Пользователя не найдено - подозрение на хак");
								me.closeConnect(ws);
                                return false;
                            }

                        }

                        // Пользователь найден и авторизован - передаём управление в переопределяемый метод
                        // обработки любых сообщений
                        let isMessageOk = me.getMessage(json,me_user);

                        // При плохом исходе парса - делаем дисконнект
                        if(!isMessageOk) {
                            me.closeConnect();
                            return false;
                        }

                    }

                }


            });

		});

        console.log("Сервер запущен");

    }

    /**
     * Базовый коннект
     * @returns {OneUser}
     */
    userConnect(ws,userID) {

        // Создаём новую модель пользователя
        let user=new OneUser(ws);

        // Генерим ID сессии
        let hash = crypto.createHash('sha256').update(Date.now() + currentSecretKey + userID).digest('hex');
        user.session = hash;

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
	 */
	userDisconnect(sessionID) {

		let that = this;

		// ищем пользователя по сессии
		for(let i=0;i<that.USERS.length;i++) {

			if(that.USERS[i].session===sessionID) {

				// Делаем дисконнект
				that.USERS[i].WebSocket.close();

				// Удаляем сессию
				that.USERS.splice(i, 1);

				// Юзер отсоединён
				console.log('Сессия пользователя ' + sessionID + ' закрыта')

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

				// Делаем дисконнект после отсылки
				ws.close();

			});


		}
		else {

			// Сообщения нет: просто разрываем
			ws.close();
		}

        return true;
    }

	/**
     * Авторизация
	 * @param json
     * @param ws
	 * @param callback
	 * @returns {boolean}
	 */
	auth(json,ws,callback) {

		// Присваиваем порядковый номер стандартному пользователю
		let userid = that.USERS.length;

	    // Стандартный новый юзер без авторизаций
        let user = this.userConnect(ws,userid);

        // Указываем, что юзер авторизован
		user.isAuthorized = true;

        // Запускаем коллбек с готовым результатом
		callback(user);

        // Возвращаем его для генерации ключей сессии
        return user;

    }

    /**
     * Получено нестандартное сообщение: обработать его
     */
    getMessage(json,user) {

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
	 */
	sendAllUsers(data) {

		let that = this;

		// сводим объект к строке
		let json = JSON.stringify(data);

		// перебираем всех пользователей
		for(let i=0;i<this.USERS.length;i++) {

			// Проверяем если пользователь авторизован
			if(that.USERS[i].isAuthorized) {

				// отправляем каждому
				that.USERS[i].WebSocket.send(json);

			}

		}

	}

}

/**
 * Один пользователь: базовая структура
 */
class OneUser {

    /**
     * @param ID integer ID пользователя в базе
     */

    /**
     * Логин пользователя
     */

    /**
     * Прошёл ли пользователь авторизацию
     */

    /**
     * WS-объект соединения
     */

    constructor(ws) {

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

		/**
         * Ссылка на соединение с пользователем для оптравки сообщений
		 */
		this.WebSocket=ws;

		/**
         * Уникальный ключ сессии
		 * @type {string}
		 */
		this.session = "";
    }

}

/**
 * Обёртка над БД
 */
class mysqlClass {

    constructor() {
        this.connected=false;
    }

    connect(host,user,password,database,callback) {

    	let that = this;

        // Делаем коннект с базой
        this.con = mysqlObject.createConnection({
            host: host,
            user: user,
            password: password,
            database: database
        });

        // При успешном коннекте
        this.con.connect((err) => {
            if(err){
                console.log('Соединение с базой НЕ установлено. Ошибка: '+err);
                return;
            }
            console.log('Соединение с базой установлено');
            this.connected=true;

            // Запускаем таймер, который будет пинговать сервер, чтобы он не закрывал соединение
			setInterval(function () {
				that.con.query('SELECT 1');
			}, 10000);

            // Выполняем коллбек
            callback();

        });

        /*
        this.con.end((err) => {
            console.log('Соединение с базой разорвано'+(err ? ". Причина: "+ err : ""));
        });
        */

    }

    /**
     * Получить все записи
     * @param query
	 * @param params
	 * @param array Массив, куда поместить результаты
     * @param callback
     */
    all(query,params,array,callback) {

		if(this.connected) {

			this.con.query(query,params, function (err, result, fields) {

				if (err) {
					console.log('Ошибка в запросе: ' + err.message);
					callback([]);
					return [];
				}

				// Нет результатов
				if(result.length===0) {
					callback([]);
					return [];
				}

				// Есть результаты

				// Если надо сразу отправить в массив, делаем это
				if(array!==null && array!==undefined) {

					// перебираем записи
					for (let i=0;i<result.length;i++) {

						let newItem = {};

						// перебираем поля
						for (let column in result[i]) {
							if(result[i].hasOwnProperty(column)) {
								newItem[column] = result[i][column];
							}
						}

						// Добавляем в массив
						array.push(newItem);

					}
				}

				// Вызываем коллбек с результатами, если нужно
				if(callback!==undefined && callback!==null) callback(result);

			});

		}

    }

	/**
	 * Получить одну [первую] запись
	 * @param query
	 * @param params
	 * @param callback
	 */
	one(query,params,callback) {

		if(this.connected) {

			this.con.query(query,params, function (err, result, fields) {

				if (err) {
					console.log('Ошибка в запросе: ' + err.message);
					callback(false);
					return false;
				}

				// Нет результатов
				if(result.length===0) {
					callback(null);
					return null;
				}

				// Есть результаты: возвращаем первый
				callback(result[0]);

			});

		}

	}

}

/**
 * АПИ функции сервера для быстрого доступа
 */
class Api {

	/**
	 * Получить по ссылке данные
	 * @param adress
	 * @param callback
	 * @param errback
	 */
	curl(adress,callback,errback) {

		let type = http;

		if(adress.startsWith('https')) type=https;

		type.get(adress, (resp) => {

			let data = '';

			// получаем файл кусочками
			resp.on('data', (chunk) => {
				data += chunk;
			});

			// как всё получили вызываем коллбек
			resp.on('end', () => {
				callback(data);
			});

		}).on("error", (err) => {

			// коллбек ошибки, если есть
			if(errback!==undefined) {
				console.log("CURL Error: " + err.message);
				errback(err);
			}

		});

	}

	/**
	 * Безопасное обновление массива его обновлённой версией
	 * с применением событий при создании и изменении любого элементы
	 * ВАЖНО: в обновляемых и исходном массиве элементы должны иметь ID
	 * только так можно сохранять их порядок
	 * @param basearr
	 * @param newarr
	 * @param onNew
	 * @param onChange
	 * @param onDelete
	 * @param isDelete
	 */
	safeUpdate(basearr,newarr,onNew,onChange,onDelete,isDelete=true) {

		let finded = false;
		let that = this;
		let enabledList=[];

		// Если новый массив является объектом, преобразуем его в массив
		if(typeof newarr === 'object') {

			// Перебираем свойства объекта и пушим их сюда
			let arr=[];
			for(let item in newarr) {
				arr.push(newarr[item]);
			}

			// заменяем исходный объект массивом элементов
			newarr=arr;
		}

		// Перебираем новый массив в поисках этого элемента в старых
		for(let rowI=0;rowI<newarr.length;rowI++) {

			// Сигнал про найденность элемента
			finded = false;

			// список активных элементов в новом массиве
			enabledList.push(newarr[rowI].id);

			// ищем элемент из нового массив в текущем
			for(let i=0;i<basearr.length;i++) {

				// элемент найден
				if(basearr[i].id===newarr[rowI].id) {

					// Нужно сравнивать его изменение?
					// отключено
					if(onChange!==undefined) {
					}

					// элемент найден, выходим из поиска
					finded=true;
					break;

				}

			}

			// Новый элемент - пушим его в массив
			if(!finded) {

				// Пушим
				let len = basearr.push(newarr[rowI]);

				// Если есть коллбек после создания элемента - вызываем его
				if(onNew!==undefined) onNew(basearr[len-1]);

			}

		}

		// Проверяем на удалённые позиции, если нужно
		if(isDelete===true) {

			// Ищем элементы, которых не было в новом массиве, но остались в исходном
			let DeleteList = [];
			for (let i=0;i<basearr.length;i++) {
				if ( enabledList.indexOf(basearr[i].id) === -1 ) {
					DeleteList.push(basearr[i].id);
				}
			}

			// Удаляем
			for(let i=0;i<DeleteList.length;i++) {
				for (let u=0;u<basearr.length;u++) {
					if(DeleteList[i]===basearr[u].id) {

						// фиксируем удаляемый элемент
						let item = basearr[u];

						// удаляем из массива
						basearr.splice(u,1);

						// запускаем callback после удаления с указанием этого элемента, если он есть
						if(onDelete!==undefined) {
							onDelete(item);
						}

						// выходим из поиска элемента и ищем дальше
						break;

					}
				}
			}
		}

	}

	/**
	 * Найти элемент в объекте по его параметру ID (+рекурсия)
	 * @param id
	 * @param array
	 */
	findByID(id,array) {

		let finded = false;
		let that = this;

		array.forEach(function(item,i,arr){

			// Найдено
			if(finded!=false) return false;

			// Без ID не проверяем дальше
			if(item.id==undefined) return true;

			// Ищем совпадение
			if(item.id == id) {
				finded=item;
				return false;
			}

			// Ищем совпадение в потомках
			if(item.childrens!=undefined) {
				finded=that.findByID(id,item.childrens);
			}

		});

		return finded;

	}

	/**
	 * Получить копию этого объекта, исключая набор его свойств
	 * @param basearray
	 * @param exclude Массив параметров, которые надо исключить из конечной выборки
	 */
	getCopyExclude(basearray,exclude=[]) {

		let out = {};

		// Можно передавать параметры напрямую без скобочек массива
		if(!Array.isArray(exclude)) exclude=[exclude];

		for(let item in basearray) {
			if (basearray.hasOwnProperty(item) && !exclude.includes(item))
				out[item]=basearray[item];
		}

		return out;

	}

}

// Создаём объект базы
let   mysqlObject = require('mysql');

module.exports.BaseWebSocket=BaseWebSocket;
module.exports.OneUser=OneUser;
module.exports.mysqlClass=mysqlClass;
module.exports.mysqlObject=mysqlObject;
module.exports.Api=Api;