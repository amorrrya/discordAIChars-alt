import ollama from 'ollama';

import { all, getMeta, run, setMeta } from './db.js';
import { engine } from '../character/engine.js';
import { color } from '../utils/consolecolors.js';

const dimensions = 512;
const batchSize = 32;

const queryInstruction = 'Given a moment in a Discord group chat, find past messages, memories and events that are relevant to it';

const textColumns = {
	messages: "speaker || ': ' || text || COALESCE(' [picture: ' || pictures || ']', '')",
	memories: 'text',
	episodes: 'summary',
	lore_chunks: "heading || '\n' || text",
};

const index = { messages: new Map(), memories: new Map(), episodes: new Map(), lore_chunks: new Map() };

let unavailableUntil = 0;
let workerRunning = false;
let workerQueued = false;

function embedModel() {
	return process.env.EMBED_MODEL || 'qwen3-embedding:4b';
}

function normalize(values) {
	const vector = Float32Array.from(values);
	let length = 0;
	for (const value of vector) length += value * value;
	length = Math.sqrt(length) || 1;
	for (let i = 0; i < vector.length; i++) vector[i] /= length;
	return vector;
}

function toBlob(vector) {
	return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function fromBlob(blob) {
	return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));
}

export async function embed(texts, { query = false } = {}) {
	if (Date.now() < unavailableUntil) return null;

	try {
		const instruction = typeof query === 'string' ? query : queryInstruction;
		const input = query ? texts.map(text => `Instruct: ${instruction}\nQuery: ${text}`) : texts;
		// Next to a local chat model it runs on the CPU, so loading it never pushes the chat model out of video memory
		const options = engine()?.local ? { num_gpu: 0 } : undefined;
		const { embeddings } = await ollama.embed({ model: embedModel(), input, dimensions, truncate: true, keep_alive: '1h', options });
		return embeddings.map(normalize);
	} catch (err) {
		unavailableUntil = Date.now() + 60_000;
		// Ollama says this when the model runs as a chat model, from a wrong EMBED_MODEL or an earlier ollama run
		const fix = /does not support embeddings/i.test(err.message)
			? `. EMBED_MODEL has to be an embedding model like qwen3-embedding:0.6b, then restart Ollama`
			: '';
		console.log(`${color.Red}Embedding model unavailable (${err.message})${fix}, memory search uses recent memories only`);
		return null;
	}
}

async function checkEmbedModel() {
	const model = embedModel();
	try {
		const { capabilities } = await ollama.show({ model });
		if (capabilities && !capabilities.includes('embedding')) {
			console.log(`${color.Red}EMBED_MODEL ${model} is not an embedding model: set it to one like qwen3-embedding:0.6b, memory search stays off until then`);
		}
	} catch (err) {
		console.log(`${color.Red}Embedding model ${model} is missing (${err.message}): ollama pull ${model}`);
	}
}

export async function loadIndex() {
	await checkEmbedModel();

	// Vectors from different models can't be compared, so a new model means embedding everything again
	if ((await getMeta('embed_model')) !== embedModel()) {
		for (const table of Object.keys(index)) await run(`UPDATE ${table} SET embedding = NULL`);
		await setMeta('embed_model', embedModel());
	}

	for (const table of Object.keys(index)) {
		const rows = await all(`SELECT id, embedding FROM ${table} WHERE embedding IS NOT NULL`);
		for (const row of rows) index[table].set(row.id, fromBlob(row.embedding));
	}
}

async function embedMissing(table) {
	while (true) {
		const rows = await all(`SELECT id, ${textColumns[table]} AS text FROM ${table} WHERE embedding IS NULL ORDER BY id LIMIT ${batchSize}`);
		if (rows.length === 0) return true;

		const vectors = await embed(rows.map(row => row.text));
		if (!vectors) return false;

		for (const [i, row] of rows.entries()) {
			await run(`UPDATE ${table} SET embedding = ? WHERE id = ?`, [toBlob(vectors[i]), row.id]);
			index[table].set(row.id, vectors[i]);
		}
	}
}

export function embedPending() {
	if (workerRunning) {
		workerQueued = true;
		return;
	}

	workerRunning = true;
	(async () => {
		try {
			do {
				workerQueued = false;
				for (const table of Object.keys(index)) {
					if (!(await embedMissing(table))) return;
				}
			} while (workerQueued);
		} catch (err) {
			console.error(`${color.Red}Embedding error: ${err.message}`);
		} finally {
			workerRunning = false;
		}
	})();
}

export function search(table, queryVector, { k, filter = () => true }) {
	const scored = [];
	for (const [id, vector] of index[table]) {
		if (!filter(id)) continue;
		let score = 0;
		for (let i = 0; i < vector.length; i++) score += vector[i] * queryVector[i];
		scored.push({ id, score });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, k);
}

export function forget(table, ids) {
	for (const id of ids) index[table].delete(id);
}

export function forgetAll() {
	for (const vectors of Object.values(index)) vectors.clear();
}
