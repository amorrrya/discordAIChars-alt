import fs from 'fs';
import dotenv from 'dotenv';

import { getApplicableModel } from '../db.js';
import { channel } from '../channel.js';
import { embedPending, loadIndex } from '../memory/embed.js';
import { addMessage, latestMessage, messagesAfter, recentMessages } from '../memory/messages.js';
import { saveImage } from '../utils/imagesave.js';
import { detectImageType } from '../utils/imagetype.js';
import { color } from '../utils/consolecolors.js';
import { syncLoreChunks } from '../lore/chunks.js';
import { maintainWindow } from './context.js';
import { chooseSpeaker } from './director.js';
import { engine } from './engine.js';
import { loadMembers, upgradeMembers } from './group.js';
import { speak } from './speaker.js';
import { loginAccounts, logoutAccounts } from './accounts.js';
import { renderLine } from './transcript.js';
import { describePictures } from './vision.js';

// Wait for this much silence before answering, so double texts get one reply
const quietTime = 1500;
const maxQuietWait = 6000;

// Link previews often arrive a moment after the message itself
const embedWait = 2500;

const maxPictures = 4;
const maxPictureSide = 800;
const maxPictureBytes = 5 * 1024 * 1024;

const botPictureGap = 60 * 1000;

const botDecisionGap = 30 * 1000;

const maxChain = 4;

const maxBotOnlyRounds = 3;

const loopPauseMin = 2000;
const loopPauseMax = 6000;
const loopIdleLimit = 30 * 60 * 1000;

let ingestion = Promise.resolve();
let lastArrival = 0;
let lastPersonAt = Date.now();

let running = false;
let rerun = false;
let closing = false;

let lastSeenId = 0;

const forced = [];

let botOnlyRounds = 0;
let lastBotPicture = 0;
let lastBotDecision = 0;
let botTimer = null;

let loopMode = false;
let loopKick = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function speakerName(message) {
	return message.member?.displayName ?? message.author.globalName ?? message.author.username;
}

function idOf(modelData) {
	return modelData.idname.toLowerCase();
}

async function describeReply(message) {
	if (!message.reference?.messageId) return null;
	try {
		const replied = await message.fetchReference();
		const quote = replied.cleanContent.replace(/\s+/g, ' ').slice(0, 150);
		return `${speakerName(replied)}: "${quote}"`;
	} catch {
		return null;
	}
}

async function waitForEmbeds(message) {
	if (!/https?:\/\//.test(message.content)) return;
	const start = Date.now();
	while (message.embeds.length === 0 && Date.now() - start < embedWait) await sleep(250);
}

function isPictureEmbed(embed) {
	return ['image', 'gifv'].includes(embed.data?.type) || (!embed.title && (embed.image || embed.thumbnail));
}

// Discord's resizer turns a picture into a smaller still frame, big GIFs would go over the API's size limit
function stillPicture(url, width, height) {
	try {
		const resized = new URL(url);
		resized.searchParams.set('format', 'png');
		if (width && height) {
			const scale = Math.min(1, maxPictureSide / Math.max(width, height));
			resized.searchParams.set('width', String(Math.round(width * scale)));
			resized.searchParams.set('height', String(Math.round(height * scale)));
		}
		return resized.toString();
	} catch {
		return url;
	}
}

function pictureSources(message) {
	return [
		...[...message.attachments.values()]
			.filter(attachment => attachment.contentType?.startsWith('image/'))
			.map(attachment => ({
				urls: [stillPicture(attachment.proxyURL ?? attachment.url, attachment.width, attachment.height), attachment.url],
				name: attachment.id,
			})),
		...message.embeds
			.filter(isPictureEmbed)
			.map(embed => embed.image ?? embed.thumbnail)
			.filter(image => image?.url)
			.map((image, index) => ({
				urls: [stillPicture(image.proxyURL ?? image.url, image.width, image.height), image.url],
				name: `${message.id}-embed${index}`,
			})),
	].slice(0, maxPictures);
}

async function downloadPictures(sources) {
	const paths = [];
	for (const { urls, name } of sources) {
		for (const url of urls) {
			try {
				const path = await saveImage(url, name, 'images');
				const data = fs.readFileSync(path);
				if (detectImageType(data) && data.length <= maxPictureBytes) {
					paths.push(path);
					break;
				}
				fs.unlinkSync(path);
			} catch {}
		}
	}
	return paths;
}

function linkPreviews(message) {
	return message.embeds
		.filter(embed => embed.title && !isPictureEmbed(embed))
		.map(embed => `(link: ${embed.title}${embed.provider?.name ? ` on ${embed.provider.name}` : ''})`)
		.join(' ');
}

async function ingest(message, userInput) {
	await waitForEmbeds(message);

	const name = speakerName(message);
	let text = userInput === message.content ? message.cleanContent : userInput;
	for (const sticker of message.stickers?.values() ?? []) text += ` (sticker: ${sticker.name})`;
	const previews = linkPreviews(message);
	if (previews) text += ` ${previews}`;
	text = text.trim();

	const reply = await describeReply(message);

	let pictures = null;
	const sources = pictureSources(message);
	const generic = sources.length === 1 ? 'a picture' : `${sources.length} pictures`;
	if (sources.length > 0 && message.author.bot && Date.now() - lastBotPicture < botPictureGap) {
		pictures = generic;
	} else if (sources.length > 0) {
		if (message.author.bot) lastBotPicture = Date.now();
		const paths = await downloadPictures(sources);
		const recent = (await recentMessages(8)).map(renderLine).join('\n');
		const cast = (await loadMembers()).map(({ modelData }) => modelData.displayname).join(', ');
		const context = `Posted by ${name}${text ? ` with the message: "${text}"` : ''}.\n\nCharacters in this chat: ${cast || 'none yet'}\n\nRecent chat for context:\n${recent}`;
		pictures = (paths.length > 0 && (await describePictures(paths, context))) || generic;
	}

	await addMessage({
		discordId: message.id,
		time: message.createdTimestamp,
		speaker: name,
		authorId: message.author.id,
		isBot: message.author.bot,
		text,
		reply,
		pictures,
	});
	console.log(`${color.Cyan}${name}: ${text}${pictures ? ` [picture: ${pictures}]` : ''}`);
}

async function waitForQuiet() {
	const start = Date.now();
	while (Date.now() - start < maxQuietWait) {
		const remaining = lastArrival + quietTime - Date.now();
		if (remaining <= 0) return;
		await sleep(remaining);
	}
}

async function freshMessages() {
	return (await messagesAfter(lastSeenId)).filter(row => !row.character);
}

async function markSeen() {
	lastSeenId = (await latestMessage())?.id ?? lastSeenId;
}

async function converse() {
	const kicked = loopKick;
	loopKick = false;

	// Pick up .env edits, like a new API key, without a restart
	dotenv.config({ override: true, quiet: true });

	const members = await loadMembers();
	if (members.length === 0) return;
	if (!engine()) {
		console.log(`${color.Red}No model to answer with: set ANTHROPIC_API_KEY, or a local model as BASE_MODEL or LOCAL_MODEL`);
		return;
	}
	if (engine().local) await syncLoreChunks();
	await maintainWindow(members);

	const fresh = await freshMessages();
	if (fresh.length === 0 && forced.length === 0 && !kicked && !loopMode) return;

	if (fresh.length > 0) {
		const botOnly = fresh.every(row => row.is_bot);

		// Wait and look at everything the bots said since, instead of deciding after every one of their messages
		if (botOnly && !loopMode && forced.length === 0) {
			const wait = lastBotDecision + botDecisionGap - Date.now();
			if (wait > 0) {
				botTimer ??= setTimeout(() => {
					botTimer = null;
					runChat();
				}, wait);
				return;
			}
			lastBotDecision = Date.now();
		}

		botOnlyRounds = botOnly ? botOnlyRounds + 1 : 0;
		if (botOnly && botOnlyRounds > maxBotOnlyRounds && !loopMode) {
			console.log(`${color.Gray}Only bots have been talking, waiting for a person before answering again`);
			await markSeen();
			return;
		}
	}

	let chain = 0;
	let silentInARow = 0;
	while (!closing) {
		if (loopMode && Date.now() - lastPersonAt > loopIdleLimit) {
			loopMode = false;
			console.log(`${color.Gray}Loop mode off, nobody has written for 30 minutes`);
			await channel.send('### loop mode off: nobody wrote for 30 minutes');
		}

		if ((await freshMessages()).length > 0) chain = 0;
		if (!loopMode && chain >= maxChain) break;

		await markSeen();
		let turn;
		const forcedModel = forced.shift();
		if (forcedModel) {
			const member = members.find(({ modelData }) => idOf(modelData) === idOf(forcedModel)) ?? { modelData: forcedModel, note: '' };
			turn = { member, reason: 'someone asked them directly with !ask' };
		} else {
			turn = await chooseSpeaker(members, { loopMode, chain });
		}
		if (!turn) break;

		const sent = await speak(turn.member, members, { reason: turn.reason, loopMode });
		if (sent) {
			chain++;
			silentInARow = 0;
		} else if (!loopMode || ++silentInARow >= members.length) {
			break;
		}

		if (loopMode) await sleep(loopPauseMin + Math.random() * (loopPauseMax - loopPauseMin));
	}
}

async function runChat() {
	if (running) {
		rerun = true;
		return;
	}

	running = true;
	try {
		do {
			rerun = false;
			await waitForQuiet();
			await ingestion;
			try {
				await converse();
			} catch (err) {
				console.error(`\n${color.Red}Error: ${err.message}`);
			}
		} while ((rerun || loopKick) && !closing);
	} finally {
		running = false;
	}
}

function receive(message, userInput, forcedModel = null) {
	if (closing) return;
	lastArrival = Date.now();
	if (!message.author.bot) lastPersonAt = lastArrival;

	ingestion = ingestion
		.then(() => ingest(message, userInput))
		.catch(err => console.error(`${color.Red}Could not store a message: ${err.message}`));

	if (forcedModel) forced.push(forcedModel);
	runChat();
}

export async function initCharacters() {
	upgradeMembers();
	await loadIndex();
	if (engine()?.local) await syncLoreChunks();
	embedPending();
	await markSeen();
	const members = await loadMembers();
	await maintainWindow(members);
	await loginAccounts(members);
}

export async function stopCharacters(timeout = 20000) {
	closing = true;
	const start = Date.now();
	while (running && Date.now() - start < timeout) await sleep(250);
	await logoutAccounts();
}

export function isLoopMode() {
	return loopMode;
}

export function setLoopMode(enabled) {
	loopMode = enabled;
	if (!enabled) return;

	lastPersonAt = Date.now();
	loopKick = true;
	runChat();
}

export function talkToChannel(message) {
	receive(message, message.content);
}

export async function talkAsCharacter(userInput, message, modelName) {
	const modelData = await getApplicableModel(modelName);

	if (!modelData) {
		await channel.send(`### no character named "${modelName}"`);
		return;
	}

	receive(message, userInput, modelData);
}
