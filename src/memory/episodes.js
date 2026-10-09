import { all, getMeta, run, setMeta } from './db.js';
import { embedPending } from './embed.js';

export async function addEpisode({ firstId, lastId, startTime, endTime, summary }) {
	await run(
		'INSERT INTO episodes (first_id, last_id, start_time, end_time, summary) VALUES (?, ?, ?, ?, ?)',
		[firstId, lastId, startTime, endTime, summary]
	);
	await setMeta('summarized_until', lastId);
	embedPending();
}

export async function recentEpisodes(count) {
	const rows = await all('SELECT id, first_id, last_id, start_time, end_time, summary FROM episodes ORDER BY id DESC LIMIT ?', [count]);
	return rows.reverse();
}

export async function episodesByIds(ids) {
	if (ids.length === 0) return [];
	return all(`SELECT id, first_id, last_id, start_time, end_time, summary FROM episodes WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
}

export async function getSummarizedUntil() {
	return Number((await getMeta('summarized_until')) ?? 0);
}
