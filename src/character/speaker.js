import { askClaude } from '../claude/request.js';
import { askLocal, localThinking } from '../ollama/local.js';
import { all } from '../memory/db.js';
import { embed, search } from '../memory/embed.js';
import { episodesByIds } from '../memory/episodes.js';
import { addMemories, getState, memoriesByIds, recentMemories, setState } from '../memory/memories.js';
import { addMessage, getWindowStart, lastMessageOf, messagesAfter, messagesByIds, recentMessages, recentMessagesOf } from '../memory/messages.js';
import { characterLore, relevantLore } from '../lore/chunks.js';
import { filterOutput } from '../utils/filter.js';
import { color } from '../utils/consolecolors.js';
import { localSpeakerFields, localSpeakerSchema, nextMessage, speakerSchema } from './prompts.js';
import { localPrefix, sharedSystem, sheetOf, transcriptContent, voiceSamples } from './context.js';
import { engine } from './engine.js';
import { estimateTokens, formatClock, formatDay, formatShortDay, partOfDay, renderLine, timeAgo } from './transcript.js';
import { getCharacterWebhook } from './webhooks.js';
import { ensureAccount, showActivity, startTyping } from './accounts.js';

const maxParts = 5;
const recentMemoryCount = 12;
const relevantMemoryCount = 8;
const relevantMessageCount = 8;
const relevantEpisodeCount = 3;

const loreInstruction = 'Given a moment in a group chat with characters from a story, find the parts of the story\'s lore that matter to it';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function idOf(modelData) {
	return modelData.idname.toLowerCase();
}

function aboutText(about) {
	try {
		const names = JSON.parse(about ?? '[]');
		return names.length > 0 ? ` (about ${names.join(', ')})` : '';
	} catch {
		return '';
	}
}

function sortLike(rows, hits) {
	const order = new Map(hits.map((hit, index) => [hit.id, index]));
	return rows.sort((a, b) => order.get(a.id) - order.get(b.id));
}

async function recall(character, recent, shownEpisodes) {
	const queryText = recent.slice(-6).map(renderLine).join('\n');
	const newest = (await recentMemories(character, recentMemoryCount)).reverse();
	let relevant = [];
	let oldMessages = [];
	let oldEpisodes = [];

	const [queryVector] = (queryText && (await embed([queryText], { query: true }))) || [];
	if (queryVector) {
		const memoryHits = search('memories', queryVector, { k: 60 });
		relevant = sortLike(await memoriesByIds(character, memoryHits.map(hit => hit.id)), memoryHits).slice(0, relevantMemoryCount);

		const windowStart = await getWindowStart();
		const messageHits = search('messages', queryVector, { k: relevantMessageCount, filter: id => id < windowStart }).filter(hit => hit.score > 0.4);
		oldMessages = sortLike(await messagesByIds(messageHits.map(hit => hit.id)), messageHits);

		const shownIds = new Set(shownEpisodes.map(episode => episode.id));
		const episodeHits = search('episodes', queryVector, { k: relevantEpisodeCount, filter: id => !shownIds.has(id) }).filter(hit => hit.score > 0.3);
		oldEpisodes = sortLike(await episodesByIds(episodeHits.map(hit => hit.id)), episodeHits);
	}

	const memories = new Map([...relevant, ...newest].map(memory => [memory.id, memory]));
	return { memories: [...memories.values()], oldMessages, oldEpisodes };
}

function fitList(title, items, toLine, timeOf, budget, used) {
	const kept = [];
	let size = estimateTokens(title) + 1;
	for (const item of items) {
		const lineSize = estimateTokens(toLine(item)) + 1;
		if (used.tokens + size + lineSize > budget) break;
		kept.push(item);
		size += lineSize;
	}
	if (kept.length === 0) return [];

	used.tokens += size;
	return ['', title, ...kept.sort((a, b) => timeOf(a) - timeOf(b)).map(toLine)];
}

function styleCheck(ownMessages) {
	// Parts of one reply follow each other directly and within seconds
	const replies = [];
	for (const row of ownMessages) {
		const last = replies[replies.length - 1];
		const previous = last?.[last.length - 1];
		if (previous && row.id === previous.id + 1 && row.time - previous.time < 20000) last.push(row);
		else replies.push([row]);
	}

	const recent = replies.slice(-5);
	if (recent.length < 3) return null;

	return recent
		.map(parts => {
			const words = parts.flatMap(part => part.text.split(/\s+/).filter(Boolean));
			const split = parts.length > 1 ? `${parts.length} messages` : 'one message';
			return `${split}, ${words.length} words, starting "${words.slice(0, 2).join(' ')}"`;
		})
		.join('; ');
}

async function privateNote(modelData, members, { reason, loopMode, shownEpisodes, budget = Infinity }) {
	const name = modelData.displayname;
	const character = idOf(modelData);
	const now = Date.now();

	const recent = await recentMessages(30);
	const lastInChat = recent[recent.length - 1];
	const lastOwn = await lastMessageOf(character);
	const state = await getState(character);
	const { memories, oldMessages, oldEpisodes } = await recall(character, recent, shownEpisodes);

	const twoHoursAgo = now - 2 * 60 * 60 * 1000;
	const activePeople = [...new Set(recent.filter(row => !row.character && row.time > twoHoursAgo).map(row => row.speaker))];
	const others = members.filter(member => idOf(member.modelData) !== character).map(member => member.modelData.displayname);

	const lines = [
		`It's ${formatDay(now)}, ${formatClock(now)} local time (${partOfDay(now)}).`,
		lastInChat ? `The last message in the chat was ${timeAgo(lastInChat.time, now)}.` : 'Nobody has written in the chat yet.',
		`You are ${name} now. Messages labeled "${name}" are ${name}'s own.`,
		lastOwn ? `${name} last wrote ${timeAgo(lastOwn.time, now)}.` : `${name} hasn't written in this chat yet.`,
	];

	if (state) {
		lines.push(`When ${name} last wrote (${timeAgo(state.updated, now)}): mood: ${state.mood}. Doing: ${state.doing}. Thinking: ${state.thoughts}`);
	} else {
		lines.push(`Decide ${name}'s mood and what they're doing from the time of day and where the story left them.`);
	}

	if (others.length > 0) lines.push(`Other characters in the chat: ${others.join(', ')}.`);
	if (activePeople.length > 0) lines.push(`People who wrote in the last two hours: ${activePeople.join(', ')}.`);

	const end = [];
	const style = styleCheck(await recentMessagesOf(character, 20));
	if (style) end.push('', `${name}'s last few replies were: ${style}. If they've fallen into a pattern, break it.`);

	end.push('', `Why it's ${name}'s turn: ${reason}`);
	if (loopMode) end.push('Loop mode is on: the people want the characters to keep chatting on their own, so carry the conversation forward.');
	end.push('', `Write ${name}'s next message now.`);

	const used = { tokens: estimateTokens([...lines, ...end].join('\n')) };
	const recalled = [
		...fitList(`${name}'s memories:`, memories, memory => `- [${formatShortDay(memory.time)}] ${memory.text}${aboutText(memory.about)}`, memory => memory.time, budget, used),
		...fitList('Older stretches of the chat that may be relevant:', oldEpisodes, episode => `- [${formatShortDay(episode.start_time)}] ${episode.summary}`, episode => episode.start_time, budget, used),
		...fitList('Older messages that may be relevant:', oldMessages, row => `- [${formatShortDay(row.time)}] ${renderLine(row)}`, row => row.time, budget, used),
	];

	return [...lines, ...recalled, ...end].join('\n');
}

function loreText(sections) {
	return sections.map(section => `### ${section.heading}\n${section.text}`).join('\n\n');
}

async function writeLocally(modelData, members, { reason, loopMode }, model) {
	const name = modelData.displayname;
	const { system, chat, episodes, layout, samples } = await localPrefix(members);
	const tail = [`---\nPrivate note for ${name}. Nobody in the chat sees this.`];

	const profile = await characterLore([name, modelData.idname], layout.profile);
	if (profile.length > 0) tail.push(`Everything the lore says about ${name}, their own story:\n\n${loreText(profile)}`);

	if (layout.lore > 0) {
		// The newest message on its own and the conversation around it, both searched
		const recent = await recentMessages(6);
		const queries = [recent[recent.length - 1]?.text, recent.map(renderLine).join('\n')].filter(Boolean);
		const vectors = queries.length > 0 ? (await embed(queries, { query: loreInstruction })) ?? [] : [];
		const sections = await relevantLore(vectors, layout.lore, new Set(profile.map(section => section.id)));
		if (sections.length > 0) tail.push(`Other lore that may matter right now:\n\n${loreText(sections)}`);
	}

	if (!layout.castInPrefix) tail.push(`${name}'s character sheet:\n\n${sheetOf(modelData, samples)}`);
	tail.push(await privateNote(modelData, members, { reason, loopMode, shownEpisodes: episodes, budget: layout.note }));
	tail.push(localSpeakerFields);

	const request = { label: name, model, system, prompt: `${chat}\n\n${tail.join('\n\n')}`, schema: localSpeakerSchema };
	// Thinking too long leaves no room for the answer, so it answers once more without thinking
	return (await askLocal(request)) ?? (localThinking() ? askLocal({ ...request, think: false }) : null);
}

function splitIntoMessages(text) {
	const parts = text
		.split(nextMessage)
		.map(part => part.trim().replace(/\n\s*\n+/g, '\n'))
		.filter(Boolean);
	if (parts.length <= maxParts) return parts;
	return [...parts.slice(0, maxParts - 1), parts.slice(maxParts - 1).join('\n')];
}

function words(text) {
	return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean));
}

function similar(a, b) {
	const shared = [...a].filter(word => b.has(word)).length;
	return shared / new Set([...a, ...b]).size >= 0.7;
}

function dropRepeats(message, ownRecent) {
	const earlier = ownRecent.flatMap(row => row.text.split('\n')).map(words).filter(set => set.size >= 4);
	return message
		.split('\n')
		.filter(line => {
			const current = words(line);
			return current.size < 4 || !earlier.some(set => similar(current, set));
		})
		.join('\n');
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanMessage(text, name) {
	return text
		.trim()
		.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')
		.replace(/^#\d+\s*/, '')
		.replace(new RegExp(`^${escapeRegExp(name)}:\\s*`, 'i'), '')
		.replace(/^\(replying to [^)]*\)\s*/i, '')
		.trim();
}

function jitter(ms) {
	return ms * (0.7 + Math.random() * 0.6);
}

function readingTime(text) {
	return Math.min(jitter(900 + text.length * 15), 6000);
}

function typingTime(text) {
	return Math.min(Math.max(jitter(text.length * 55), 1200), 15000);
}

function quote(row) {
	return `${row.speaker}: "${row.text.replace(/\s+/g, ' ').slice(0, 80)}"`;
}

// Replying only helps once newer messages have pushed a message up, and even then people often skip it
function shouldReply(newer) {
	const takesSpace = row => row.text.length > 80 || Boolean(row.pictures);
	if (newer.length === 0) return false;
	if (newer.length <= 2 && !newer.some(takesSpace)) return false;

	const buried = newer.length + newer.filter(takesSpace).length;
	return Math.random() < Math.min(0.85, 0.3 + buried * 0.1);
}

// Through the character's own account a reply is a real Discord reply, through a webhook it becomes a quote
async function send(modelData, text, replyTo) {
	const account = await ensureAccount(modelData);
	if (account) {
		const options = { content: text, allowedMentions: { parse: [], repliedUser: Boolean(replyTo && !replyTo.is_bot) } };
		if (replyTo?.discord_id) options.reply = { messageReference: replyTo.discord_id, failIfNotExists: false };
		try {
			return await account.channel.send(options);
		} catch (err) {
			console.log(`${color.Red}${modelData.displayname}'s account could not post, using the webhook: ${err.message}`);
		}
	}

	const webhook = await getCharacterWebhook(modelData);
	const content = replyTo ? `> ${quote(replyTo)}\n${text}` : text;
	return webhook.send({ content, allowedMentions: { parse: [] } });
}

export async function speak(member, members, { reason, loopMode }) {
	const { modelData } = member;
	const name = modelData.displayname;
	const character = idOf(modelData);
	const current = engine();
	if (!current) return false;

	const [latest] = await recentMessages(1);
	const typingFrom = Date.now() + (latest && !latest.character ? readingTime(latest.text) : jitter(1500));
	const account = await ensureAccount(modelData);
	const stopTyping = account ? startTyping(account, typingFrom) : () => {};

	try {
		let result;
		if (current.local) {
			result = await writeLocally(modelData, members, { reason, loopMode }, current.model);
		} else {
			const { content, episodes } = await transcriptContent();
			const note = await privateNote(modelData, members, { reason, loopMode, shownEpisodes: episodes });
			result = await askClaude({
				label: name,
				model: current.model,
				effort: process.env.CLAUDE_EFFORT || 'high',
				system: sharedSystem(members),
				messages: [
					{ role: 'user', content },
					{ role: 'system', content: note },
				],
				schema: speakerSchema,
			});
		}
		if (!result) return false;
		if (result.plan) console.log(`${color.Gray}${name} plans: ${result.plan}`);

		const decidedAt = Date.now();
		if (result.mood) {
			await setState(character, result, decidedAt);
			showActivity(modelData, result.doing);
		}
		const remember = result.remember?.slice(0, 3) ?? [];
		if (remember.length > 0) {
			await addMemories(character, remember, decidedAt);
			console.log(`${color.Gray}${name} remembers: ${remember.map(item => item.text).join(' | ')}`);
		}

		const written = cleanMessage(result.message ?? '', name);
		const voice = current.local ? (await voiceSamples(character)).map(text => ({ text })) : [];
		const message = dropRepeats(written, [...(await recentMessagesOf(character, 8)), ...voice]).trim();
		if (message !== written) console.log(`${color.Gray}${name} repeated an earlier message, the repeated part wasn't sent: ${written}`);
		if (!message) {
			console.log(`${color.Gray}${name} stayed quiet`);
			return false;
		}

		// Smaller models sometimes pick an unrelated message number, so locally only a person's recent message counts
		const [newest] = await recentMessages(1);
		const [replyTo] = (result.reply_to > 0 ? await messagesByIds([result.reply_to]) : [])
			.filter(row => row.character !== character)
			.filter(row => !current.local || (!row.is_bot && !row.character && row.id > newest.id - 15));

		let typedFrom = typingFrom;
		for (const [index, part] of splitIntoMessages(message).entries()) {
			if (index > 0 && account) account.channel.sendTyping().catch(() => {});
			const wait = typedFrom + typingTime(part) - Date.now();
			if (wait > 0) await sleep(wait);

			// Sending ends the typing on Discord's side, so it must not start again by itself afterwards
			if (index === 0) stopTyping();

			const text = filterOutput(part);
			// Decided at the last moment, messages that came in while typing count too
			const reply = index === 0 && replyTo && shouldReply(await messagesAfter(replyTo.id)) ? replyTo : null;
			const sent = await send(modelData, text, reply);
			await addMessage({ discordId: sent.id, time: Date.now(), speaker: name, character, text, reply: reply ? quote(reply) : null });
			console.log(`${color.Yellow}${name}: ${reply ? `(replying to ${reply.speaker}) ` : ''}${text}`);
			typedFrom = Date.now();
		}
		return true;
	} finally {
		stopTyping();
	}
}

export async function describeStates(members) {
	const now = Date.now();
	const lines = [];
	for (const { modelData } of members) {
		const character = idOf(modelData);
		const state = await getState(character);
		const last = await lastMessageOf(character);
		const spoke = last ? `last wrote ${timeAgo(last.time, now)}` : 'hasn\'t written yet';
		lines.push(state
			? `${modelData.displayname} (${spoke}): ${state.mood}; ${state.doing}`
			: `${modelData.displayname} (${spoke}): no state yet`);
	}
	return lines.join('\n');
}

export async function allMemoriesOf(character, count) {
	return all('SELECT time, text, about FROM memories WHERE character = ? ORDER BY id DESC LIMIT ?', [character, count]);
}
