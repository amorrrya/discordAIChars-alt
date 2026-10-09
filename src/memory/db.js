import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('memory.db');

db.serialize(() => {
	db.run('PRAGMA journal_mode = WAL');

	db.run(`CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		discord_id TEXT,
		time INTEGER NOT NULL,
		speaker TEXT NOT NULL,
		author_id TEXT,
		character TEXT,
		is_bot INTEGER NOT NULL DEFAULT 0,
		text TEXT NOT NULL,
		reply TEXT,
		pictures TEXT,
		embedding BLOB
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS episodes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		first_id INTEGER NOT NULL,
		last_id INTEGER NOT NULL,
		start_time INTEGER NOT NULL,
		end_time INTEGER NOT NULL,
		summary TEXT NOT NULL,
		embedding BLOB
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS memories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		character TEXT NOT NULL,
		time INTEGER NOT NULL,
		text TEXT NOT NULL,
		about TEXT,
		embedding BLOB
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS states (
		character TEXT PRIMARY KEY,
		mood TEXT,
		doing TEXT,
		thoughts TEXT,
		updated INTEGER
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS lore_chunks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		heading TEXT NOT NULL,
		text TEXT NOT NULL,
		embedding BLOB
	)`);

	db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');

	db.run('CREATE TABLE IF NOT EXISTS costs (day TEXT PRIMARY KEY, dollars REAL NOT NULL, requests INTEGER NOT NULL)');
});

export function run(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.run(sql, params, function (err) {
			if (err) reject(err);
			else resolve({ lastID: this.lastID, changes: this.changes });
		});
	});
}

export function get(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
	});
}

export function all(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
	});
}

export function closeMemory() {
	return new Promise(resolve => db.close(() => resolve()));
}

export async function getMeta(key) {
	const row = await get('SELECT value FROM meta WHERE key = ?', [key]);
	return row ? row.value : null;
}

export async function setMeta(key, value) {
	await run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
}
