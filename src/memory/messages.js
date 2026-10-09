import { all, get, getMeta, run, setMeta } from './db.js';
import { embedPending, forget, forgetAll } from './embed.js';

const columns = 'id, discord_id, time, speaker, author_id, character, is_bot, text, reply, pictures';

export async function addMessage({ discordId = null, time = Date.now(), speaker, authorId = null, character = null, isBot = false, text, reply = null, pictures = null }) {
	const { lastID } = await run(
		'INSERT INTO messages (discord_id, time, speaker, author_id, character, is_bot, text, reply, pictures) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[discordId, time, speaker, authorId, character, isBot ? 1 : 0, text, reply, pictures]
	);
	embedPending();
	return lastID;
}

// Messages from this id on are sent in full every time, older ones live on as episodes and search results
export async function getWindowStart() {
	return Number((await getMeta('window_start')) ?? 0);
}

export async function setWindowStart(id) {
	await setMeta('window_start', id);
}

export async function windowMessages() {
	return all(`SELECT ${columns} FROM messages WHERE id >= ? ORDER BY id`, [await getWindowStart()]);
}

export async function messagesBetween(firstId, lastId) {
	return all(`SELECT ${columns} FROM messages WHERE id BETWEEN ? AND ? ORDER BY id`, [firstId, lastId]);
}

export async function recentMessages(count) {
	const rows = await all(`SELECT ${columns} FROM messages ORDER BY id DESC LIMIT ?`, [count]);
	return rows.reverse();
}

export async function messagesByIds(ids) {
	if (ids.length === 0) return [];
	return all(`SELECT ${columns} FROM messages WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
}

export async function messageBefore(id) {
	return get(`SELECT ${columns} FROM messages WHERE id < ? ORDER BY id DESC LIMIT 1`, [id]);
}

export async function latestMessage() {
	return get(`SELECT ${columns} FROM messages ORDER BY id DESC LIMIT 1`);
}

export async function messagesAfter(id) {
	return all(`SELECT ${columns} FROM messages WHERE id > ? ORDER BY id`, [id]);
}

export async function lastMessageOf(character) {
	return get(`SELECT ${columns} FROM messages WHERE character = ? ORDER BY id DESC LIMIT 1`, [character]);
}

export async function recentMessagesOf(character, count) {
	const rows = await all(`SELECT ${columns} FROM messages WHERE character = ? ORDER BY id DESC LIMIT ?`, [character, count]);
	return rows.reverse();
}

export async function deleteLastMessages(count) {
	const rows = await all('SELECT id FROM messages ORDER BY id DESC LIMIT ?', [count]);
	const ids = rows.map(row => row.id);
	if (ids.length === 0) return 0;

	await run(`DELETE FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
	forget('messages', ids);
	return ids.length;
}

export async function clearChatMemory() {
	for (const table of ['messages', 'episodes', 'memories', 'states']) {
		await run(`DELETE FROM ${table}`);
	}
	await run("DELETE FROM meta WHERE key IN ('window_start', 'summarized_until')");
	forgetAll();
}
