var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Markup, Telegraf } from "telegraf";
import { message } from 'telegraf/filters';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('./config.json'); // now works
const lang = require('./ru_ru.json');

// import { createServer } from "http";
// import config from "./config.json" assert { type: "json" };

// import lang from "./ru_ru.json" assert { type: "json" };
import ydb from "ydb-sdk";
const { Driver, getSACredentialsFromJson, IamAuthService, TableDescription, Column, Types } = ydb;
const bot = new Telegraf(config.token);
const hasSex = (user) => user.sex != 0;
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
]);
const keyboardCompLiked = Markup.inlineKeyboard([
    [
        Markup.button.callback(lang['message.liked'], "message-like"),
        Markup.button.callback(lang['message.report'], "message-report")
    ]
]);
const keyboardReport = Markup.inlineKeyboard([
    [
        Markup.button.callback(lang['report.skip'], "report-skip"),
        Markup.button.callback(lang['report.ban'], "report-ban")
    ]
]);
bot.command('me', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield getOrCreateUser(session, ctx.from.id);
        if (!hasSex(user))
            return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
        ctx.reply(lang['me.info.str1'] + '\n' +
            lang['me.info.str2'] + user.scores + '\n' +
            lang['me.info.str3'] + (user.sex == 1 ? lang['me.info.sexMale'] : lang['me.info.sexFemale']));
    }));
}));
bot.command('m', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield getOrCreateUser(session, ctx.from.id);
        if (!hasSex(user))
            return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
        if (user.banned)
            return ctx.reply(lang["send.banned"]);
        const randomUser = yield YDBgetRandomUser(session, 1, ctx.from.id);
        if (randomUser === null) {
            return ctx.reply(lang['send.failed.empty']);
        }
        const text = ctx.message.text.replace('/m', '').trim();
        if (text.length == 0)
            return yield ctx.reply(lang['send.failed.empty_message']);
        ctx.reply(lang['send.ok']);
        const msg = yield ctx.telegram.sendMessage(randomUser.telegram_id, lang['send.newMessage'] + text, keyboardComp);
        console.log(msg.message_id);
        YDBaddMessage(session, msg.message_id, ctx.from.id, randomUser.telegram_id, text);
    }));
}));
bot.command('f', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield getOrCreateUser(session, ctx.from.id);
        if (!hasSex(user))
            return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
        if (user.banned)
            return ctx.reply(lang["send.banned"]);
        const randomUser = yield YDBgetRandomUser(session, 2, ctx.from.id);
        if (randomUser === null) {
            return ctx.reply(lang['send.failed.empty']);
        }
        const text = ctx.message.text.replace('/f', '').trim();
        if (text.length == 0)
            return yield ctx.reply(lang['send.failed.empty_message']);
        ctx.reply(lang['send.ok']);
        const msg = yield ctx.telegram.sendMessage(randomUser.telegram_id, lang['send.newMessage'] + text, keyboardComp);
        YDBaddMessage(session, msg.message_id, ctx.from.id, randomUser.telegram_id, text);
    }));
}));
bot.start((ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        ctx.reply(lang['start.hello']);
        const user = yield getOrCreateUser(session, ctx.from.id);
        if (user === null) {
            return ctx.reply(lang["start.selectSex"], keyboardSelectSex);
        }
    }));
}));
bot.on(message("text"), (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield YDBgetUser(session, ctx.from.id);
        if (user === null) {
            yield YDBaddUser(session, {
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
}));
bot.on('callback_query', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    return yield runYDBSession((session) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield YDBgetUser(session, ctx.from.id);
        if (user === null) {
            yield YDBaddUser(session, {
                telegram_id: ctx.from.id,
                banned: false,
                scores: 0,
                sex: 0,
                striked: false
            });
            return ctx.reply("403");
        }
        if (ctx.callbackQuery['data'] === "gender-set-male") {
            yield YDBsetUserSex(session, ctx.from.id, 1);
            ctx.reply(lang["start.selectSex.ok"]);
        }
        else if (ctx.callbackQuery['data'] === "gender-set-female") {
            yield YDBsetUserSex(session, ctx.from.id, 2);
            ctx.reply(lang["start.selectSex.ok"]);
        }
        else if (ctx.callbackQuery['data'] === "message-like") {
            const liked = yield YDBlikeMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
            if (!liked) {
                return yield ctx.answerCbQuery(lang['message.like.error']);
            }
            try {
                yield ctx.editMessageReplyMarkup(keyboardCompLiked.reply_markup);
            }
            catch (err) {
                console.error(err);
            }
        }
        else if (ctx.callbackQuery['data'] === "message-report") {
            try {
                yield ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            }
            catch (err) {
                console.error(err);
            }
            yield ctx.answerCbQuery(lang['report.sent']);
            const msg = yield YDBgetMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
            yield YDBdeleteMessage(session, ctx.callbackQuery.message.message_id, ctx.from.id);
            const adminMsg = yield ctx.telegram.sendMessage(config.report_chat, lang['report.new.str1'] + '\n' +
                lang['report.new.str2'] + `[${lang['report.user']}](tg://user?id=${msg.from})` + '\n' +
                lang['report.new.str3'] + msg.text, {
                reply_markup: keyboardReport.reply_markup,
                parse_mode: 'MarkdownV2'
            });
            yield YDBaddReport(session, adminMsg.message_id, config.report_chat, ctx.callbackQuery.message.message_id, ctx.from.id);
            return;
        }
        else if (ctx.callbackQuery['data'] === "report-skip") {
            const report = yield YDBgetReport(session, ctx.callbackQuery.message.message_id, config.report_chat);
            if (report === null)
                return yield ctx.answerCbQuery(lang['report.ban.error']);
            yield YDBsolveReport(session, report.id, report.chat_id);
            yield ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            yield ctx.answerCbQuery(lang['report.skipped']);
            return;
        }
        else if (ctx.callbackQuery['data'] === "report-ban") {
            const report = yield YDBgetReport(session, ctx.callbackQuery.message.message_id, config.report_chat);
            if (report === null)
                return yield ctx.answerCbQuery(lang['report.ban.error']);
            const msg = yield YDBgetMessage(session, report.message_id, report.message_chat_id, true);
            if (msg === null)
                return yield ctx.answerCbQuery(lang['report.ban.error']);
            yield YDBbanUser(session, msg.from);
            yield YDBsolveReport(session, report.id, report.chat_id);
            yield ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            return yield ctx.answerCbQuery(lang['report.banned']);
        }
        ctx.answerCbQuery();
    }));
}));
const auth = () => __awaiter(void 0, void 0, void 0, function* () {
    const saCredentials = getSACredentialsFromJson("key.json");
    const authService = new IamAuthService(saCredentials);
    const driver = new Driver({ authService, endpoint: config.ydb.endpoint, database: config.ydb.database });
    const timeout = 100000;
    if (!(yield driver.ready(timeout))) {
        console.error(`Driver has not become ready in ${timeout}ms!`);
        process.exit(1);
    }
    console.log("DB init");
    return driver;
});
const createTables = (session) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Creating tables...');
    yield session.createTable('users', new TableDescription()
        .withColumn(new Column('telegram_id', Types.UINT64))
        .withColumn(new Column('sex', Types.UINT8))
        .withColumn(new Column('scores', Types.optional(Types.UINT16)))
        .withColumn(new Column('striked', Types.optional(Types.BOOL)))
        .withColumn(new Column('banned', Types.optional(Types.BOOL)))
        .withPrimaryKey('telegram_id'));
});
function YDBaddUser(session, user) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
UPSERT INTO users (telegram_id, sex, scores, striked, banned) VALUES
(${user.telegram_id}, ${user.sex}, ${user.scores}, ${user.striked}, ${user.banned});`;
        console.log('Making an upsert...');
        yield session.executeQuery(query);
        console.log('Upsert completed');
    });
}
function YDBgetUser(session, telegram_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
SELECT telegram_id, sex, scores, striked, banned
FROM users
WHERE telegram_id = ${telegram_id}`;
        console.log('Making a select...');
        const { resultSets } = yield session.executeQuery(query);
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
        };
    });
}
function YDBgetRandomUser(session, gender, excludeTelegramId) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
SELECT telegram_id, sex, scores, striked, banned
FROM users
WHERE sex = ${gender} AND banned = false AND NOT (telegram_id = ${excludeTelegramId})
ORDER BY RANDOM(TableRow())
LIMIT 1
`; // AND NOT (telegram_id = ${excludeTelegramId})
        console.log('Making a select...');
        const { resultSets } = yield session.executeQuery(query);
        const result = resultSets[0];
        if (result.rows.length != 1) {
            return null;
        }
        const items = result.rows[0].items;
        console.log('Select completed');
        return {
            telegram_id: items[0].uint64Value.low,
            sex: items[1].uint32Value,
            scores: items[2].int64Value,
            striked: items[3].boolValue,
            banned: items[4].boolValue
        };
    });
}
function YDBsetUserSex(session, telegram_id, sex) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
UPDATE users
SET sex = ${sex}
WHERE telegram_id =  ${telegram_id}`;
        console.log('Making an update...');
        yield session.executeQuery(query);
        console.log('Update completed');
    });
}
function YDBgetMessage(session, messageId, chatId, deleted = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const query2 = `
SELECT id, \`from\`, to, text, liked, deleted
FROM messages
WHERE id = ${messageId} AND to = ${chatId} AND deleted = ${deleted}
LIMIT 1`;
        const { resultSets } = yield session.executeQuery(query2);
        const result = resultSets[0];
        if (result.rows.length != 1) {
            return null;
        }
        const items = result.rows[0].items;
        return {
            id: items[0].uint64Value.low,
            from: items[1].uint64Value.low,
            to: items[2].uint64Value.low,
            text: String(items[3].bytesValue),
            liked: items[4].boolValue,
            deleted: items[5].boolValue
        };
    });
}
function YDBaddMessage(session, messageId, fromId, toId, text) {
    return __awaiter(this, void 0, void 0, function* () {
        // 	const query = `
        // INSERT INTO messages (id, from, to, text, liked, reported)
        // SELECT COALESCE(MAX(id), 0) + 1, ${fromId}, ${toId}, "${text}", false, false
        // FROM messages`;
        const query = `
INSERT INTO messages (id, from, to, text, liked, deleted)
VALUES (${messageId}, ${fromId}, ${toId}, "${text}", false, false)`;
        console.log('Making an upsert...');
        yield session.executeQuery(query);
        console.log('Upsert completed');
    });
}
function YDBlikeMessage(session, messageId, chatId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const query = `
UPDATE messages
SET liked = true
WHERE id = ${messageId} AND to = ${chatId}`;
            console.log('Making an update...');
            yield session.executeQuery(query);
            console.log('Update completed');
            const query2 = `
SELECT \`from\`, deleted
FROM messages
WHERE id = ${messageId} AND to = ${chatId} AND deleted = false`;
            const { resultSets } = yield session.executeQuery(query2);
            const result = resultSets[0];
            if (result.rows.length != 1) {
                return false;
            }
            const items = result.rows[0].items;
            const fromId = items[0].uint64Value.low;
            const query3 = `
UPDATE users
SET scores = scores + 1
WHERE telegram_id = ${fromId}`;
            yield session.executeQuery(query3);
            return true;
        }
        catch (err) {
            console.error(err);
        }
    });
}
function YDBdeleteMessage(session, messageId, chatId) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
UPDATE messages
SET deleted = true
WHERE id = ${messageId} AND to = ${chatId} AND deleted = false`;
        yield session.executeQuery(query);
    });
}
function YDBbanUser(session, telegram_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
UPDATE users
SET banned = true
WHERE telegram_id = ${telegram_id}`;
        yield session.executeQuery(query);
    });
}
function YDBaddReport(session, report_id, report_chat_id, message_id, message_chat_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
INSERT INTO reports (id, chat_id, message_id, message_chat_id, solved)
VALUES (${report_id}, ${report_chat_id}, ${message_id}, ${message_chat_id}, false)`;
        yield session.executeQuery(query);
    });
}
function YDBgetReport(session, report_id, report_chat_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
SELECT id, chat_id, message_id, message_chat_id, solved
FROM reports
WHERE id = ${report_id} AND chat_id = ${report_chat_id}`;
        const { resultSets } = yield session.executeQuery(query);
        const result = resultSets[0];
        if (result.rows.length != 1) {
            return null;
        }
        const items = result.rows[0].items;
        return {
            id: items[0].uint64Value.low,
            chat_id: items[1].int64Value.low,
            message_id: items[2].uint64Value.low,
            message_chat_id: items[3].uint64Value.low,
            solved: items[4].boolValue
        };
    });
}
function YDBsolveReport(session, report_id, report_chat_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = `
UPDATE reports
SET solved = true
WHERE id = ${report_id} AND chat_id = ${report_chat_id}`;
        yield session.executeQuery(query);
    });
}
const runYDBSession = (callback) => __awaiter(void 0, void 0, void 0, function* () {
    const driver = yield auth();
    yield driver.tableClient.withSession(callback);
});
const getOrCreateUser = (session, telegram_id) => __awaiter(void 0, void 0, void 0, function* () {
    let user = yield YDBgetUser(session, telegram_id);
    if (user === null) {
        user = {
            telegram_id: telegram_id,
            banned: false,
            scores: 0,
            sex: 0,
            striked: false
        };
        yield YDBaddUser(session, user);
    }
    return user;
});

export async function _handler(event, context) {
    const message = JSON.parse(event.body);
    await bot.handleUpdate(message);
    return {
        statusCode: 200,
        body: '',
    };
};