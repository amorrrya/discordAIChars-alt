import { all, getMeta, run, setMeta } from '../memory/db.js';
import { embedPending, forget, search } from '../memory/embed.js';
import { estimateTokens } from '../character/transcript.js';
import { lorebookKey, lorebookTexts } from './lorebook.js';

const maxChunk = 2400;

function splitLong(body) {
	if (body.length <= maxChunk) return [body];

	const pieces = [];
	let current = '';
	for (const line of body.split('\n')) {
		if (current && current.length + line.length > maxChunk) {
			pieces.push(current.trim());
			current = '';
		}
		current += `${line}\n`;
	}
	if (current.trim()) pieces.push(current.trim());
	return pieces;
}

function chunkFile(text) {
	const chunks = [];
	const headings = [];
	let lines = [];

	const flush = () => {
		const body = lines.join('\n').trim();
		lines = [];
		if (!body) return;
		const heading = headings.filter(Boolean).join(' > ');
		for (const piece of splitLong(body)) chunks.push({ heading, text: piece });
	};

	for (const line of text.split('\n')) {
		const match = line.match(/^(#{1,4})\s+(.*)/);
		if (match) {
			flush();
			const level = match[1].length;
			headings.length = level - 1;
			headings[level - 1] = match[2].trim();
		} else {
			lines.push(line);
		}
	}
	flush();
	return chunks;
}

export async function syncLoreChunks() {
	const key = lorebookKey();
	if ((await getMeta('lore_chunks_key')) === key) return;

	const old = await all('SELECT id FROM lore_chunks');
	forget('lore_chunks', old.map(row => row.id));
	await run('DELETE FROM lore_chunks');

	for (const text of lorebookTexts()) {
		for (const { heading, text: body } of chunkFile(text)) {
			await run('INSERT INTO lore_chunks (heading, text) VALUES (?, ?)', [heading, body]);
		}
	}
	await setMeta('lore_chunks_key', key);
	embedPending();
}

// Takes the best hit of each search in turn, so a short question isn't drowned out by the longer conversation
function interleave(hitLists) {
	const ids = [];
	for (let rank = 0; rank < Math.max(...hitLists.map(hits => hits.length)); rank++) {
		for (const hits of hitLists) {
			const id = hits[rank]?.id;
			if (id !== undefined && !ids.includes(id)) ids.push(id);
		}
	}
	return ids;
}

export async function relevantLore(queryVectors, tokenBudget) {
	const vectors = queryVectors.filter(Boolean);
	if (vectors.length === 0 || tokenBudget <= 0) return [];

	const ids = interleave(vectors.map(vector => search('lore_chunks', vector, { k: 24 })));
	if (ids.length === 0) return [];

	const rows = await all(`SELECT id, heading, text FROM lore_chunks WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
	const byId = new Map(rows.map(row => [row.id, row]));

	const picked = [];
	let used = 0;
	for (const id of ids) {
		const row = byId.get(id);
		if (!row) continue;
		const size = estimateTokens(row.text);
		if (used + size > tokenBudget) continue;
		picked.push(row);
		used += size;
	}
	return picked;
}
