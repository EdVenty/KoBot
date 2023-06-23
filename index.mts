import { Markup, Telegraf } from "telegraf";
import { message } from 'telegraf/filters';
// import { createServer } from "http";
import config from "./config.json" assert {type: "json"};
import lang from "./ru_ru.json" assert {type: "json"};
import ydb from "ydb-sdk";
const { Driver, getSACredentialsFromJson, IamAuthService, TableDescription, Column, Types } = ydb;

const bot = new Telegraf(config.token);

type User = {
	telegram_id: number;
	sex?: 0 | 1 | 2; // 0 - undefined, 1 - male, 2 - female
	scores?: number;
	striked?: boolean;
	banned?: boolean
}

type Message = {
	id: number;
	to: number;
	from?: number;
	text?: string;
	liked?: boolean;
	deleted?: boolean;
}

type Report = {
	id: number,
	chat_id: number,
	message_id?: number,
	message_chat_id?: number,
	solved?: boolean
}

const hasSex = (user: User) => user.sex != 0;

const keyboardSelectSex = Markup.inlineKeyboard([
	[
		Markup.button.callback(lang["start.selectSex.male"], "gender-set-male"),
		Markup.button.callback(lang["start.selectSex.female"], "gender-set-female")
	]
]);

const keyboardComp = Markup.inlineKeyboard([
	[
		Markup.button.callback(lang['message.like'], "message-like"),
		Markup.button.callback(lang['message.report'], "message-report")
	]
])

const keyboardCompLiked = Markup.inlineKeyboard([
	[
		Markup.button.callback(lang['message.liked'], "message-like"),
		Markup.button.callback(lang['message.report'], "message-report")
	]
])

const keyboardReport = Markup.inlineKeyboard([
	[
		Markup.button.callback(lang['report.skip'], "report-skip"),
		Markup.button.callback(lang['report.ban'], "report-ban")
	]
])

bot.command('me', async (ctx) => await runYDBSession(async (session) => {
	const user = await getOrCreateUser(session, ctx.from.id);
	if (!hasSex(user)) return ctx.reply(lang["start.selectSex"], keyboardSelectSex);

	ctx.reply(
		lang['me.info.str1'] + '\n' +
		lang['me.info.str2'] + user.scores + '\n' +
		lang['me.info.str3'] + (user.sex == 1 ? lang['me.info.sexMale'] : lang['me.info.sexFemale'])
	)
}));

bot.command('m', async (ctx) => await runYDBSession(async (session) => {
	const user = await getOrCreateUser(session, ctx.from.id);
	if (!hasSex(user)) return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
	if (user.banned) return ctx.reply(lang["send.banned"]);

	const randomUser = await YDBgetRandomUser(session, 1, ctx.from.id);
	if (randomUser === null) {
		return ctx.reply(lang['send.failed.empty']);
	}
	const text = ctx.message.text.replace('/m', '').trim();
	if (text.length == 0) return await ctx.reply(lang['send.failed.empty_message']);

	ctx.reply(lang['send.ok']);
	const msg = await ctx.telegram.sendMessage(randomUser.telegram_id, lang['send.newMessage'] + text, keyboardComp);
	console.log(msg.message_id);
	YDBaddMessage(session, msg.message_id, ctx.from.id, randomUser.telegram_id, text);
}));

bot.command('f', async (ctx) => await runYDBSession(async (session) => {
	const user = await getOrCreateUser(session, ctx.from.id);
	if (!hasSex(user)) return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
	if (user.banned) return ctx.reply(lang["send.banned"]);

	const randomUser = await YDBgetRandomUser(session, 2, ctx.from.id);
	if (randomUser === null) {
		return ctx.reply(lang['send.failed.empty']);
	}
	const text = ctx.message.text.replace('/f', '').trim();
	if (text.length == 0) return await ctx.reply(lang['send.failed.empty_message']);

	ctx.reply(lang['send.ok']);
	const msg = await ctx.telegram.sendMessage(randomUser.telegram_id, lang['send.newMessage'] + text, keyboardComp);
	YDBaddMessage(session, msg.message_id, ctx.from.id, randomUser.telegram_id, text);
}));

bot.start(async (ctx) => await runYDBSession(async (session) => {
	ctx.reply(lang['start.hello']);
	const user = await getOrCreateUser(session, ctx.from.id);
	if (user === null) {
		return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
	}
}));

bot.on(message("text"), async (ctx) => await runYDBSession(async (session) => {
	const user = await YDBgetUser(session, ctx.from.id);
	if (user === null) {
		await YDBaddUser(session, {
			telegram_id: ctx.from.id,
			banned: false,
			scores: 0,
			sex: 0,
			striked: false
		});
		return ctx.reply(lang["start.hello"], keyboardSelectSex);
	}
	if (user.sex === 0) {
		return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
	}
	return ctx.reply(lang['start.hello']);
}));

bot.on('callback_query', async (ctx) => await runYDBSession(async (session) => {
	const user = await YDBgetUser(session, ctx.from.id);
	if (user === null) {
		await YDBaddUser(session, {
			telegram_id: ctx.from.id,
			banned: false,
			scores: 0,
			sex: 0,
			striked: false
		});
		return ctx.reply("403");
	}
	if (ctx.callbackQuery['data'] === "gender-set-male") {
		await YDBsetUserSex(session, ctx.from.id, 1);
		ctx.reply(lang["start.selectSex.ok"]);
	}
	else if (ctx.callbackQuery['data'] === "gender-set-female") {
		await YDBsetUserSex(session, ctx.from.id, 2);
		ctx.reply(lang["start.selectSex.ok"]);
	}
	else if (ctx.callbackQuery['data'] === "message-like") {
		const liked = await YDBlikeMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
		if (!liked) {
			return await ctx.answerCbQuery(lang['message.like.error']);
		}
		try {
			await ctx.editMessageReplyMarkup(keyboardCompLiked.reply_markup);
		}
		catch (err) {
			console.error(err);
		}
	}
	else if (ctx.callbackQuery['data'] === "message-report") {
		try {
			await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
		}
		catch (err) {
			console.error(err);
		}
		await ctx.answerCbQuery(lang['report.sent']);
		const msg = await YDBgetMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
		await YDBdeleteMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
		const adminMsg = await ctx.telegram.sendMessage(
			config.report_chat,
			lang['report.new.str1'] + '\n' +
			lang['report.new.str2'] + `[${lang['report.user']}](tg://user?id=${msg.from})` + '\n' +
			lang['report.new.str3'] + msg.text,
			{
				reply_markup: keyboardReport.reply_markup,
				parse_mode: 'MarkdownV2'
			}
		)
		await YDBaddReport(session, adminMsg.message_id, config.report_chat, ctx.callbackQuery.message.message_id, ctx.from.id);
		return;
	}
	else if (ctx.callbackQuery['data'] === "report-skip") {
		const report = await YDBgetReport(session, ctx.callbackQuery.message.message_id, config.report_chat);
		if (report === null) return await ctx.answerCbQuery(lang['report.ban.error']);

		await YDBsolveReport(session, report.id, report.chat_id);

		await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
		await ctx.answerCbQuery(lang['report.skipped']);
		return;
	}
	else if (ctx.callbackQuery['data'] === "report-ban") {
		const report = await YDBgetReport(session, ctx.callbackQuery.message.message_id, config.report_chat);
		if (report === null) return await ctx.answerCbQuery(lang['report.ban.error']);

		const msg = await YDBgetMessage(session, report.message_id, report.message_chat_id, true);
		if (msg === null) return await ctx.answerCbQuery(lang['report.ban.error']);

		await YDBbanUser(session, msg.from);
		await YDBsolveReport(session, report.id, report.chat_id);

		await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
		return await ctx.answerCbQuery(lang['report.banned']);
	}
	ctx.answerCbQuery();
}));

const auth = async () => {
	const saCredentials = getSACredentialsFromJson("key.json");
	const authService = new IamAuthService(saCredentials);
	const driver = new Driver({ authService, endpoint: config.ydb.endpoint, database: config.ydb.database });
	const timeout = 100000;
	if (!await driver.ready(timeout)) {
		console.error(`Driver has not become ready in ${timeout}ms!`);
		process.exit(1);
	}
	console.log("DB init");
	return driver;
}

const createTables = async (session: ydb.Session) => {
	console.log('Creating tables...');
	await session.createTable(
		'users',
		new TableDescription()
			.withColumn(new Column(
				'telegram_id',
				Types.UINT64,  // not null column
			))
			.withColumn(new Column(
				'sex',
				Types.UINT8,
			))
			.withColumn(new Column(
				'scores',
				Types.optional(Types.UINT16)
			))
			.withColumn(new Column(
				'striked',
				Types.optional(Types.BOOL)
			))
			.withColumn(new Column(
				'banned',
				Types.optional(Types.BOOL)
			))
			.withPrimaryKey('telegram_id')
	);
}

async function YDBaddUser(session: ydb.Session, user: User): Promise<void> {
	const query = `
UPSERT INTO users (telegram_id, sex, scores, striked, banned) VALUES
(${user.telegram_id}, ${user.sex}, ${user.scores}, ${user.striked}, ${user.banned});`;
	console.log('Making an upsert...');
	await session.executeQuery(query);
	console.log('Upsert completed');
}

async function YDBgetUser(session: ydb.Session, telegram_id: number) {
	const query = `
SELECT telegram_id, sex, scores, striked, banned
FROM users
WHERE telegram_id = ${telegram_id}`;
	console.log('Making a select...');
	const { resultSets } = await session.executeQuery(query);
	const result = resultSets[0];
	if (result.rows.length != 1) {
		return null;
	}
	const items = result.rows[0].items;
	console.log('Select completed');

	return {
		telegram_id: telegram_id,
		sex: items[1].uint32Value,
		scores: items[2].int64Value,
		striked: items[3].boolValue,
		banned: items[4].boolValue
	} as User;
}

async function YDBgetRandomUser(session: ydb.Session, gender: number, excludeTelegramId: number) {
	const query = `
SELECT telegram_id, sex, scores, striked, banned
FROM users
WHERE sex = ${gender} AND banned = false 
ORDER BY RANDOM(TableRow())
LIMIT 1
`; // AND NOT (telegram_id = ${excludeTelegramId})
	console.log('Making a select...');
	const { resultSets } = await session.executeQuery(query);
	const result = resultSets[0];
	if (result.rows.length != 1) {
		return null;
	}
	const items = result.rows[0].items;
	console.log('Select completed');

	return {
		telegram_id: (items[0].uint64Value as Long.Long).low,
		sex: items[1].uint32Value,
		scores: items[2].int64Value,
		striked: items[3].boolValue,
		banned: items[4].boolValue
	} as User;
}

async function YDBsetUserSex(session: ydb.Session, telegram_id: number, sex: 1 | 2) {
	const query = `
UPDATE users
SET sex = ${sex}
WHERE telegram_id =  ${telegram_id}`;
	console.log('Making an update...');
	await session.executeQuery(query);
	console.log('Update completed');
}

async function YDBgetMessage(session: ydb.Session, messageId: number, chatId: number, deleted: boolean = false) {
	const query2 = `
SELECT id, \`from\`, to, text, liked, deleted
FROM messages
WHERE id = ${messageId} AND to = ${chatId} AND deleted = ${deleted}
LIMIT 1`;
	const { resultSets } = await session.executeQuery(query2);

	const result = resultSets[0];
	if (result.rows.length != 1) {
		return null;
	}
	const items = result.rows[0].items;

	return {
		id: (items[0].uint64Value as Long.Long).low,
		from: (items[1].uint64Value as Long.Long).low,
		to: (items[2].uint64Value as Long.Long).low,
		text: String(items[3].bytesValue),
		liked: items[4].boolValue,
		deleted: items[5].boolValue
	} as Message
}

async function YDBaddMessage(session: ydb.Session, messageId: number, fromId: number, toId: number, text: string) {
	// 	const query = `
	// INSERT INTO messages (id, from, to, text, liked, reported)
	// SELECT COALESCE(MAX(id), 0) + 1, ${fromId}, ${toId}, "${text}", false, false
	// FROM messages`;
	const query = `
INSERT INTO messages (id, from, to, text, liked, deleted)
VALUES (${messageId}, ${fromId}, ${toId}, "${text}", false, false)`;
	console.log('Making an upsert...');
	await session.executeQuery(query);
	console.log('Upsert completed');
}

async function YDBlikeMessage(session: ydb.Session, messageId: number, chatId: number) {
	try {
		const query = `
UPDATE messages
SET liked = true
WHERE id = ${messageId} AND to = ${chatId}`;
		console.log('Making an update...');
		await session.executeQuery(query);
		console.log('Update completed');

		const query2 = `
SELECT \`from\`, deleted
FROM messages
WHERE id = ${messageId} AND to = ${chatId} AND deleted = false`;
		const { resultSets } = await session.executeQuery(query2);

		const result = resultSets[0];
		if (result.rows.length != 1) {
			return false;
		}
		const items = result.rows[0].items;
		const fromId = (items[0].uint64Value as Long.Long).low;

		const query3 = `
UPDATE users
SET scores = scores + 1
WHERE telegram_id = ${fromId}`;
		await session.executeQuery(query3);
		return true;
	}
	catch (err) {
		console.error(err);
	}
}

async function YDBdeleteMessage(session: ydb.Session, messageId: number, chatId: number) {
	const query = `
UPDATE messages
SET deleted = true
WHERE id = ${messageId} AND to = ${chatId} AND deleted = false`;
	await session.executeQuery(query);
}

async function YDBbanUser(session: ydb.Session, telegram_id: number) {
	const query = `
UPDATE users
SET banned = true
WHERE telegram_id = ${telegram_id}`;
	await session.executeQuery(query);
}

async function YDBaddReport(session: ydb.Session, report_id: number, report_chat_id: number, message_id: number, message_chat_id: number) {
	const query = `
INSERT INTO reports (id, chat_id, message_id, message_chat_id, solved)
VALUES (${report_id}, ${report_chat_id}, ${message_id}, ${message_chat_id}, false)`;
	await session.executeQuery(query);
}

async function YDBgetReport(session: ydb.Session, report_id: number, report_chat_id: number) {
	const query = `
SELECT id, chat_id, message_id, message_chat_id, solved
FROM reports
WHERE id = ${report_id} AND chat_id = ${report_chat_id}`;
	const { resultSets } = await session.executeQuery(query);

	const result = resultSets[0];
	if (result.rows.length != 1) {
		return null;
	}
	const items = result.rows[0].items;

	return {
		id: (items[0].uint64Value as Long.Long).low,
		chat_id: (items[1].int64Value as Long.Long).low,
		message_id: (items[2].uint64Value as Long.Long).low,
		message_chat_id: (items[3].uint64Value as Long.Long).low,
		solved: items[4].boolValue
	} as Report;
}

async function YDBsolveReport(session: ydb.Session, report_id: number, report_chat_id: number) {
	const query = `
UPDATE reports
SET solved = true
WHERE id = ${report_id} AND chat_id = ${report_chat_id}`;
	await session.executeQuery(query);
}

const runYDBSession = async (callback: (session: ydb.Session) => Promise<unknown>) => {
	const driver = await auth();
	await driver.tableClient.withSession(callback);
}

const getOrCreateUser = async (session: ydb.Session, telegram_id: number) => {
	let user = await YDBgetUser(session, telegram_id);
	if (user === null) {
		user = {
			telegram_id: telegram_id,
			banned: false,
			scores: 0,
			sex: 0,
			striked: false
		};
		await YDBaddUser(session, user);
	}
	return user;
}


// ============= Local development =================
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
// =================================================


// ================== Deployment ===================
// export async function _handler(event, context) {
//     const message = JSON.parse(event.body);
//     await bot.handleUpdate(message);
//     return {
//         statusCode: 200,
//         body: '',
//     };
// };
// ==================================================