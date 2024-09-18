require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { WizardScene, Stage } = Scenes;
// Подключение к базе данных
// Если используете PostgreSQL:
const { Pool } = require('pg');
// Или если используете SQLite:
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

// Создаём экземпляр бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Настройка базы данных
// Использование PostgreSQL:
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Если предпочитаете использовать SQLite:
// const db = new sqlite3.Database('expenses.db');

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
  async (ctx) => {
    if (ctx.message.text.toLowerCase() === 'да') {
      const { amount, category } = ctx.wizard.state;
      const userId = ctx.from.id;
      const date = new Date();

      // Используем PostgreSQL для сохранения данных
      try {
        await pool.query(
          `INSERT INTO expenses (user_id, amount, category, date)
           VALUES ($1, $2, $3, $4)`,
          [userId, amount, category, date]
        );
        ctx.reply('Трата успешно добавлена!');
      } catch (err) {
        console.error('Ошибка при добавлении траты:', err);
        ctx.reply('Произошла ошибка при сохранении траты.');
      }
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

bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const period = args[1];

  let dateCondition = '';
  if (period === 'день') {
    dateCondition = "AND date >= NOW() - INTERVAL '1 day'";
  } else if (period === 'неделя') {
    dateCondition = "AND date >= NOW() - INTERVAL '7 days'";
  } else if (period === 'месяц') {
    dateCondition = "AND date >= NOW() - INTERVAL '1 month'";
  }

  try {
    const res = await pool.query(
      `SELECT SUM(amount) as total FROM expenses WHERE user_id = $1 ${dateCondition}`,
      [userId]
    );
    const total = res.rows[0].total;

    if (total) {
      ctx.reply(`Ваши траты за ${period || 'все время'}: ${total} jpy.`);
    } else {
      ctx.reply('У вас пока нет записанных трат за указанный период.');
    }
  } catch (err) {
    console.error('Ошибка при получении статистики:', err);
    ctx.reply('Произошла ошибка при получении статистики.');
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

// Генерируем уникальный секретный путь для вебхука
const secretPath = `/telegraf/${bot.secretPathComponent()}`;

app.use(express.json());
app.use(bot.webhookCallback(secretPath));

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Установка вебхука
bot.telegram.setWebhook(`${process.env.PUBLIC_URL}${secretPath}`)
  .then(() => {
    console.log('Вебхук успешно установлен');
  })
  .catch((err) => {
    console.error('Ошибка при установке вебхука:', err);
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