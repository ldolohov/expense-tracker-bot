const Database = require('better-sqlite3');
const db = new Database('expenses.db');

// Создаем таблицу, если она не существует
db.prepare(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL
  )
`).run();

module.exports = db;