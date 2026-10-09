import { channel } from '../channel.js';
import { all, setMeta } from '../memory/db.js';
import { addEpisode, getSummarizedUntil, recentEpisodes } from '../memory/episodes.js';
import { getWindowStart, latestMessage, messageBefore, messagesBetween, setWindowStart, windowMessages } from '../memory/messages.js';
import { loadLorebook } from '../lore/lorebook.js';
import { askClaude } from '../claude/request.js';
import { askLocal, localContext, localThinking, thinkingTokens } from '../ollama/local.js';
import { color } from '../utils/consolecolors.js';
import { engine } from './engine.js';
import { coreRules, episodeRules, localRules } from './prompts.js';
import { CHUNK, chunkTranscript, estimateTokens, formatDay, renderLine, renderLines } from './transcript.js';

const cache = { type: 'ephemeral', ttl: '1h' };

const episodesInContext = 8;

const messagesPerEpisode = 300;

const directorBlocks = 5;

const voiceSampleCount = 12;

function historyBudget() {
	return Number(process.env.HISTORY_TOKENS) || 80000;
}

function castSheets(members) {
	return members
		.map(({ modelData }) => `## ${modelData.displayname}\n\n${modelData.model.trim()}`)
		.join('\n\n');
}

export function sharedSystem(members) {
	const lore = loadLorebook();
	const blocks = [];
	if (lore) blocks.push({ type: 'text', text: `# Lorebook\n\n${lore}`, cache_control: cache });
	blocks.push({ type: 'text', text: coreRules });
	blocks.push({ type: 'text', text: `# The characters in this chat\n\n${castSheets(members)}`, cache_control: cache });
	return blocks;
}

function chatInfo(episodes) {
	let text = `# The chat\n\nThis is the Discord server "${channel.guild.name}", channel #${channel.name}.`;
	if (channel.topic) text += ` The channel topic is: ${channel.topic}`;

	if (episodes.length > 0) {
		const stories = episodes.map(episode => {
			const start = formatDay(episode.start_time);
			const end = formatDay(episode.end_time);
			return `## ${start === end ? start : `${start} to ${end}`}\n\n${episode.summary}`;
		});
		text += `\n\n# Story so far\n\n${stories.join('\n\n')}`;
	}

	return `${text}\n\n# Recent messages`;
}

// The last finished block stays the same until the next one fills up, so it gets its own cache point
function markCachePoints(content) {
	const last = content.length - 1;
	content[last].cache_control = cache;
	if (last >= 2) content[last - 1].cache_control = cache;
}

export async function transcriptContent() {
	const rows = await windowMessages();
	const before = rows.length > 0 ? await messageBefore(rows[0].id) : null;
	const episodes = await recentEpisodes(episodesInContext);

	const content = [{ type: 'text', text: chatInfo(episodes) }];
	const chunks = chunkTranscript(rows, before?.time ?? null);
	if (chunks.length === 0) content[0].text += '\n\n(no messages yet)';
	for (const text of chunks) content.push({ type: 'text', text });

	markCachePoints(content);
	return { content, rows, episodes };
}

export async function recentContent() {
	const latest = await latestMessage();
	if (!latest) return null;

	const start = Math.max(await getWindowStart(), (Math.floor(latest.id / CHUNK) - (directorBlocks - 1)) * CHUNK);
	const rows = await messagesBetween(start, latest.id);
	const before = rows.length > 0 ? await messageBefore(rows[0].id) : null;

	const content = chunkTranscript(rows, before?.time ?? null).map(text => ({ type: 'text', text }));
	markCachePoints(content);
	return content;
}

function idOf(modelData) {
	return modelData.idname.toLowerCase();
}

// Real past messages of a character: a smaller model copies a voice from examples far better than from a description.
// Picked evenly from before the window, so they only change when the window moves.
export async function voiceSamples(character) {
	const rows = await all('SELECT text FROM messages WHERE character = ? AND id < ? AND length(text) <= 300 ORDER BY id', [character, await getWindowStart()]);
	const count = Math.min(voiceSampleCount, rows.length);
	return Array.from({ length: count }, (_, i) => rows[Math.floor(((i + 0.5) * rows.length) / count)].text.replace(/\s+/g, ' '));
}

async function castSamples(members) {
	return new Map(await Promise.all(members.map(async ({ modelData }) => [idOf(modelData), await voiceSamples(idOf(modelData))])));
}

export function sheetOf(modelData, samples) {
	const own = samples.get(idOf(modelData)) ?? [];
	const voice = own.length > 0
		? `\n\nHow ${modelData.displayname} writes, real messages of theirs for the voice only, never sent again:\n${own.map(text => `- ${text}`).join('\n')}`
		: '';
	return `${modelData.model.trim()}${voice}`;
}

function localCast(members, full, samples) {
	return members
		.map(({ modelData, note }) => {
			const talks = note ? `How much they talk: ${note}` : '';
			if (!full) return `- ${modelData.displayname}${note ? `. ${talks}` : ''}`;
			return [`## ${modelData.displayname}`, talks, sheetOf(modelData, samples)].filter(Boolean).join('\n\n');
		})
		.join(full ? '\n\n' : '\n');
}

// Fixed per cast and lorebook, so every request starts the same and the model can reuse what it already read
function localLayout(members, samples) {
	const usable = localContext() - (localThinking() ? thinkingTokens : 2048) - 512;
	const lore = loadLorebook();

	const rules = estimateTokens(localRules);
	const sheets = estimateTokens(localCast(members, true, samples));
	const castInPrefix = rules + sheets <= usable * 0.35;
	const cast = castInPrefix ? sheets : estimateTokens(localCast(members, false, samples));
	const loreInPrefix = Boolean(lore) && rules + cast + estimateTokens(lore) <= usable * 0.5;

	const largestSheet = Math.max(0, ...members.map(({ modelData }) => estimateTokens(sheetOf(modelData, samples))));
	const searched = lore && !loreInPrefix;
	const budgets = {
		castInPrefix,
		loreInPrefix,
		sheet: castInPrefix ? 0 : largestSheet,
		profile: searched ? Math.round(usable * 0.12) : 0,
		lore: searched ? Math.round(usable * 0.15) : 0,
		note: Math.round(usable * 0.1),
		episodes: Math.round(usable * 0.1),
	};

	const start = rules + cast + (loreInPrefix ? estimateTokens(lore) : 0) + 200;
	const tail = budgets.sheet + budgets.profile + budgets.lore + budgets.note;
	budgets.transcript = Math.max(usable - start - budgets.episodes - tail, 1000);
	return budgets;
}

function localSystem(members, layout, samples) {
	const parts = [localRules];
	if (layout.loreInPrefix) parts.push(`# Lore\n\n${loadLorebook()}`);
	parts.push(`# The characters in this chat\n\n${localCast(members, layout.castInPrefix, samples)}`);
	return parts.join('\n\n');
}

async function episodesWithin(budget) {
	const kept = [];
	let used = 0;
	for (const episode of (await recentEpisodes(episodesInContext)).reverse()) {
		used += estimateTokens(episode.summary) + 20;
		if (used > budget) break;
		kept.unshift(episode);
	}
	return kept;
}

export async function localPrefix(members) {
	const samples = await castSamples(members);
	const layout = localLayout(members, samples);
	const rows = await windowMessages();
	const before = rows.length > 0 ? await messageBefore(rows[0].id) : null;
	const episodes = await episodesWithin(layout.episodes);

	const lines = renderLines(rows, before?.time ?? null);
	const chat = `${chatInfo(episodes)}\n\n${lines.length > 0 ? lines.join('\n') : '(no messages yet)'}`;
	return { system: localSystem(members, layout, samples), chat, episodes, layout, samples };
}

export async function maintainWindow(members) {
	const current = engine();
	const budget = current?.local ? localLayout(members, await castSamples(members)).transcript : historyBudget();

	const rows = await windowMessages();
	const sizes = rows.map(row => estimateTokens(renderLine(row)));
	const total = sizes.reduce((sum, size) => sum + size, 0);

	if (total > budget && rows.length > CHUNK * 2) {
		// Cut down to about 70% so this doesn't happen again on the next message, on a block boundary
		let remaining = total;
		let cut = 0;
		while (cut < rows.length - CHUNK && remaining > budget * 0.7) {
			remaining -= sizes[cut];
			cut++;
		}
		const lastBlockStart = Math.floor(rows[rows.length - 1].id / CHUNK) * CHUNK;
		const newStart = Math.min(Math.ceil(rows[cut].id / CHUNK) * CHUNK, lastBlockStart);
		await setWindowStart(newStart);
		console.log(`${color.Gray}Moved messages before #${newStart} out of the full transcript into memory`);
	}

	summarizeArchived();
}

let summarizing = false;

async function summarize(current, rows, previous) {
	const transcript = renderLines(rows).join('\n');
	const intro = previous ? `For continuity, the summary of the stretch before this one:\n\n${previous.summary}\n\n` : '';
	const prompt = `${intro}The chat to summarize:\n\n${transcript}`;

	if (current.local) return askLocal({ label: 'memory', model: current.model, system: episodeRules, prompt, think: false });

	return askClaude({
		label: 'memory',
		model: current.model,
		effort: 'medium',
		system: [{ type: 'text', text: episodeRules }],
		messages: [{ role: 'user', content: prompt }],
		maxTokens: 8000,
	});
}

function episodeRows(rows, local) {
	const limited = rows.slice(0, messagesPerEpisode);
	if (!local) return limited;

	const budget = localContext() * 0.5;
	let used = 0;
	const kept = [];
	for (const row of limited) {
		used += estimateTokens(renderLine(row));
		if (used > budget && kept.length > 0) break;
		kept.push(row);
	}
	return kept;
}

async function summarizeArchived() {
	const current = engine();
	if (summarizing || !current) return;
	summarizing = true;

	try {
		while (true) {
			const windowStart = await getWindowStart();
			const from = (await getSummarizedUntil()) + 1;
			if (from >= windowStart) return;

			const rows = episodeRows(await messagesBetween(from, windowStart - 1), current.local);
			if (rows.length === 0) {
				await setMeta('summarized_until', windowStart - 1);
				return;
			}

			const [previous] = await recentEpisodes(1);
			const summary = (await summarize(current, rows, previous))?.trim();
			if (!summary) return;

			await addEpisode({
				firstId: rows[0].id,
				lastId: rows[rows.length - 1].id,
				startTime: rows[0].time,
				endTime: rows[rows.length - 1].time,
				summary,
			});
			console.log(`${color.Gray}Saved an episode summary for messages #${rows[0].id} to #${rows[rows.length - 1].id}`);
		}
	} catch (err) {
		console.error(`${color.Red}Could not summarize old messages: ${err.message}`);
	} finally {
		summarizing = false;
	}
}
