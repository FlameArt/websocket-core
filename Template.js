/**
 * Пример реализации АПИ и вебсокетов
 */

/**********************************************************************************
 *
 * Расширяемый класс от произвольного WS сервера
 *
 */

// Исходные классы
let bs = require ("./BaseWebSocket.js");
let bcrypt = require('bcrypt');







class WSUser extends bs.BaseWebSocket {

	constructor() {

		// вызываем базовый конструктор
		super();

		// Yii2 сервер
		this.yiiServer = '';

		// Апишка
		this.api = new bs.Api;

		// Инициализация сервера
		this.init = false;

		/**
		 * Активные пользователи
		 * Формат:
		 * Массив объектов [bs.User]
		 * Доступ по шифрованному ключу (случайный набор символов), который он присылает для своей авторизации при загруке
		 * и затем хранит всю сессию
		 */
		this.USERS = [];

	}

	/**
	 * Авторизация нового пользователя через БД Yii2
	 * @param json
	 * @param ws
	 * @param callback
	 * @returns {boolean}
	 */
	auth(json,ws,callback) {

		// Базовый класс для доступа извне
		let me = this;

		// Если сервер ещё не инициализирован, выходим
		if(me.init===false) {
			console.log('Сервер ещё не инициализирован. Отклонить авторизацию.')
			me.closeConnect(ws);
			return false;
		}

		// Проверяем наличие всех параметров
		if(json.data.passw===undefined || json.data.login===undefined) {
			console.log('Не все параметры в логине. Подозрение на хак');
			me.closeConnect(ws);
			return false;
		}

		// Исходные данные для авторизации
		let login = json.data.login,
			passw = json.data.passw;

		// Ищем пользователя по логину
		me.sql.one("SELECT * FROM users_frontend WHERE username=?",[login],(row)=>{

			// Ошибка в запросе: возвращаем ошибку авторизации. Подозрение на хак
			if(row===false) {
				callback(false,"Общая ошибка");
				console.log("Проблемный логин: " + login);
				return true;
			}

			// Если пользователь не найден
			if(row===null) {
				console.log("Неправильное имя пользователя" + login);
				callback(false,"Неправильное имя пользователя");
				return true;
			}

			// Делаем сравнение хеша пароля с введённым
			let hashVerify = bcrypt.compareSync(passw,row.password_hash.replace("\$2y\$","\$2a\$"));

			// Проверка пароля не пройдена
			if(!hashVerify) {
				console.log("Неверный пароль" + login);
				callback(false,"Неверный пароль");
				return false;
			}

			// Авторизация пройдена

			// Присваиваем ID из базы пользователю
			let userid = row.id;

			// Стандартный новый юзер без авторизаций
			let user = this.userConnect(ws,userid);

			// Авторизация пройдена
			user.isAuthorized = true;

			// добавляем нужные параметры пользователю в объект
			user.login = row.login;
			user.paidto = row.paidto;

			// Фильтруем буки, которые ему стоит отправлять

			// Запускаем коллбек с готовым результатом
			callback(user);
			return true;

		});


		// Возвращаем его для генерации ключей сессии
		return true;

	}

	/**
	 * Первичная прогрузка данных пользователю после успешной авторизации
	 */
	loadUser(user){

		// Первая загрузка всех данных
		let out = {

			// Базовые параметры: настраиваем сессию
			type: 'load',
			session: user.session,

			// Данные
			data: {
			}

		};

		// Отправляем ответ с успешным логином
		user.WebSocket.send (JSON.stringify(out));

	}

	/**
	 * Получено нестандартное сообщение: обработать его
	 */
	getMessage(json,user) {

		// По умолчанию возвращаем успешный распарс
		console.log("Detected message");
		return true;

	}

}




module.exports.BetterUser=BetterUser;
module.exports.bs = bs;

