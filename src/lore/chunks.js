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

// The path starts with the file's own title, or its name when it has none
function chunkFile(text, fileName) {
	const chunks = [];
	const headings = [fileName.replace(/\.md$/, '')];
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
			headings.length = Math.max(level - 1, 1);
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

	for (const { file, text } of lorebookTexts()) {
		for (const { heading, text: body } of chunkFile(text, file)) {
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

function fitBudget(rows, tokenBudget) {
	const picked = [];
	let used = 0;
	for (const row of rows) {
		const size = estimateTokens(row.text);
		if (used + size > tokenBudget) continue;
		picked.push(row);
		used += size;
	}
	return picked;
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A character's own profile: every lore section under a heading with their name, in lorebook order
export async function characterLore(names, tokenBudget) {
	if (tokenBudget <= 0) return [];

	const patterns = [...new Set(names)].map(name => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, 'iu'));
	const rows = await all('SELECT id, heading, text FROM lore_chunks ORDER BY id');
	// The first heading is the file's title, which would pull in a whole file
	const own = rows.filter(row => row.heading.split(' > ').slice(1).some(part => patterns.some(pattern => pattern.test(part))));
	return fitBudget(own, tokenBudget);
}

export async function relevantLore(queryVectors, tokenBudget, exclude = new Set()) {
	const vectors = queryVectors.filter(Boolean);
	if (vectors.length === 0 || tokenBudget <= 0) return [];

	const ids = interleave(vectors.map(vector => search('lore_chunks', vector, { k: 24, filter: id => !exclude.has(id) })));
	if (ids.length === 0) return [];

	const rows = await all(`SELECT id, heading, text FROM lore_chunks WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
	const byId = new Map(rows.map(row => [row.id, row]));
	return fitBudget(ids.map(id => byId.get(id)).filter(Boolean), tokenBudget);
}
