require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { WizardScene, Stage } = Scenes;
const db = require('./db');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Создаем мастер-сцену для добавления траты
const addExpenseWizard = new WizardScene(
  'add-expense-wizard',
  (ctx) => {
    ctx.reply('Пожалуйста, введите сумму траты:');
    return ctx.wizard.next();
  },
  (ctx) => {
    const categories = ['Продукты', 'Авто', 'Кафе', 'Аренда', 'Коммуналка', 'Здоровье', 'Хобби', 'Развлечения', 'Lawson', 'Другое'];
    ctx.wizard.state.amount = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(ctx.wizard.state.amount)) {
      ctx.reply('Пожалуйста, введите корректную сумму.');
      return ctx.wizard.selectStep(ctx.wizard.cursor - 1);
    }
    ctx.reply(
      'Выберите категорию траты:',
      Markup.keyboard(categories).oneTime().resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    ctx.wizard.state.category = ctx.message.text;
    const { amount, category } = ctx.wizard.state;
    ctx.reply(`Вы хотите добавить трату: ${amount} jpy в категории "${category}". Подтвердите (да/нет).`);
    return ctx.wizard.next();
  },
  (ctx) => {
    if (ctx.message.text.toLowerCase() === 'да') {
      const { amount, category } = ctx.wizard.state;
      const userId = ctx.from.id;
      const date = new Date().toISOString();

      db.prepare(`
        INSERT INTO expenses (user_id, amount, category, date)
        VALUES (?, ?, ?, ?)
      `).run(userId, amount, category, date);

      ctx.reply('Трата успешно добавлена!');
    } else {
      ctx.reply('Добавление траты отменено.');
    }
    return ctx.scene.leave();
  }
);

// Создаем сцену и подключаем сессии
const stage = new Stage([addExpenseWizard]);
bot.use(session());
bot.use(stage.middleware());

// Команды
bot.command('add', (ctx) => ctx.scene.enter('add-expense-wizard'));

bot.command('stats', (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const period = args[1];

  let dateCondition = '';
  if (period === 'день') {
    dateCondition = "AND date >= datetime('now', '-1 day')";
  } else if (period === 'неделя') {
    dateCondition = "AND date >= datetime('now', '-7 days')";
  } else if (period === 'месяц') {
    dateCondition = "AND date >= datetime('now', '-1 month')";
  }

  const row = db.prepare(`
    SELECT SUM(amount) as total FROM expenses WHERE user_id = ? ${dateCondition}
  `).get(userId);

  const total = row.total;

  if (total) {
    ctx.reply(`Ваши траты за ${period || 'все время'}: ${total} jpy.`);
  } else {
    ctx.reply('У вас пока нет записанных трат за указанный период.');
  }
});

bot.start((ctx) => ctx.reply('Здравствуйте! Я ваш помощник для ведения дневника трат.'));
bot.help((ctx) => ctx.reply('Вы можете использовать следующие команды:\n/add - Добавить новую трату\n/stats [день|неделя|месяц] - Просмотреть статистику'));

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка при обработке апдейта ${ctx.update.update_id}:`, err);
});

// Настройка Express-сервера и вебхуков
const app = express();
const secretPath = '/tg-bot-webhook-9a8b7c6d5e4f3g2h1i0j';
app.use(bot.webhookCallback(secretPath));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);

  bot.telegram.setWebhook(`https://${process.env.HEROKU_APP_NAME}.herokuapp.com${secretPath}`)
    .then(() => {
      console.log('Вебхук успешно установлен');
    })
    .catch((err) => {
      console.error('Ошибка при установке вебхука:', err);
    });
});

// Обработка сигналов завершения процесса
process.once('SIGINT', () => {
  console.log('Получен сигнал SIGINT, бот останавливается');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('Получен сигнал SIGTERM, бот останавливается');
  bot.stop('SIGTERM');
});