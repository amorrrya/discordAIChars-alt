import { all, get, run } from './db.js';
import { embedPending } from './embed.js';

export async function addMemories(character, items, time = Date.now()) {
	for (const { text, about } of items) {
		if (!text?.trim()) continue;
		await run('INSERT INTO memories (character, time, text, about) VALUES (?, ?, ?, ?)', [character, time, text.trim(), JSON.stringify(about ?? [])]);
	}
	embedPending();
}

export async function recentMemories(character, count) {
	const rows = await all('SELECT id, time, text, about FROM memories WHERE character = ? ORDER BY id DESC LIMIT ?', [character, count]);
	return rows.reverse();
}

export async function memoriesByIds(character, ids) {
	if (ids.length === 0) return [];
	return all(`SELECT id, time, text, about FROM memories WHERE character = ? AND id IN (${ids.map(() => '?').join(',')})`, [character, ...ids]);
}

export async function memoryCount(character) {
	const row = await get('SELECT COUNT(*) AS count FROM memories WHERE character = ?', [character]);
	return row.count;
}

export async function getState(character) {
	return get('SELECT mood, doing, thoughts, updated FROM states WHERE character = ?', [character]);
}

export async function setState(character, { mood, doing, thoughts }, time = Date.now()) {
	await run(
		`INSERT INTO states (character, mood, doing, thoughts, updated) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(character) DO UPDATE SET mood = excluded.mood, doing = excluded.doing, thoughts = excluded.thoughts, updated = excluded.updated`,
		[character, mood, doing, thoughts, time]
	);
}
