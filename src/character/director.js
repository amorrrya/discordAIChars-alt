import { askClaude } from '../claude/request.js';
import { askLocal } from '../ollama/local.js';
import { latestMessage } from '../memory/messages.js';
import { color } from '../utils/consolecolors.js';
import { localPrefix, recentContent } from './context.js';
import { engine } from './engine.js';
import { directorRules, directorSchema, localDirectorSchema, loopModeNote } from './prompts.js';
import { describeStates } from './speaker.js';
import { formatClock, formatDay, partOfDay } from './transcript.js';

const cache = { type: 'ephemeral', ttl: '1h' };

function castNotes(members) {
	return members
		.map(({ modelData, note }) => `- ${modelData.displayname}: ${note || 'no note, judge from the conversation'}`)
		.join('\n');
}

async function situation(members, { loopMode, chain }) {
	const now = Date.now();
	const lines = [
		`It's ${formatDay(now)}, ${formatClock(now)} local time (${partOfDay(now)}).`,
		'',
		'The characters right now:',
		await describeStates(members),
		'',
		chain > 0
			? `The characters have sent ${chain} message${chain === 1 ? '' : 's'} in a row since a person last wrote.`
			: 'The newest messages are from people (or from another bot).',
	];
	if (loopMode) lines.push('', loopModeNote);
	return lines;
}

// Same start as the characters' requests, so the model reads the chat only once
async function decideLocally(members, lines, names, loopMode, model) {
	const { system, chat } = await localPrefix(members);
	const choices = loopMode ? names.join(', ') : `${names.join(', ')} or nobody`;
	const note = [
		'---\nPrivate note for choosing who writes next. Nobody in the chat sees this.',
		'',
		...lines,
		'',
		`Who sends the next message: ${choices}?${loopMode ? '' : ' Pick a character only when they have a real reason to write right now: they were talked to or asked something, or something just happened that they would react to. A reaction like "lol", "ok" or an emoji usually needs no answer. Otherwise nobody.'}`,
		'Answer with JSON: "reason" (a few words on who or what they would respond to, nothing about what they know), "next" (the name).',
	];
	return askLocal({ label: 'director', model, system, prompt: `${chat}\n\n${note.join('\n')}`, schema: localDirectorSchema(names, !loopMode), temperature: 0.2, think: false });
}

async function decideWithClaude(members, lines, names, loopMode, model) {
	const content = await recentContent();
	if (!content) return null;

	return askClaude({
		label: 'director',
		model,
		effort: process.env.DIRECTOR_EFFORT || 'low',
		system: [{ type: 'text', text: `${directorRules}\n\nThe characters in this chat:\n${castNotes(members)}`, cache_control: cache }],
		messages: [
			{ role: 'user', content },
			{ role: 'system', content: [...lines, '', 'Who sends the next message?'].join('\n') },
		],
		schema: directorSchema(names, !loopMode),
		maxTokens: 4000,
	});
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function named(text, modelData) {
	return [...new Set([modelData.displayname, modelData.idname])]
		.some(name => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, 'iu').test(text));
}

const questionWord = /^(who|whos|what|whats|why|how|hows|when|where|wheres|which)(?![\p{L}\p{N}])/iu;
const askingVerb = /^(do|does|did|is|are|was|were|can|could|would|will|should|have|has)\s+(you|u|ya|ur|your|we|they|he|she|it|i|anyone|someone|there|this|that)(?![\p{L}\p{N}])/iu;

// A question mark, or a question once a greeting and the character's name are taken off the front
export function asksQuestion(text, modelData) {
	if (text.includes('?')) return true;
	const names = [...new Set([modelData.displayname, modelData.idname])].map(escapeRegExp).join('|');
	const rest = text.replace(new RegExp(`^[^\\p{L}\\p{N}]*((hey|yo|hi)\\s+)?(${names})(?![\\p{L}\\p{N}])[^\\p{L}\\p{N}]*`, 'iu'), '');
	return questionWord.test(rest) || askingVerb.test(rest);
}

// A person replying to one character or naming only them is the obvious case, which smaller models still get wrong
function addressed(members, last) {
	if (last.character || last.is_bot) return null;

	const replied = members.find(({ modelData }) => last.reply?.startsWith(`${modelData.displayname}:`));
	const mentioned = members.filter(({ modelData }) => named(last.text, modelData));
	const member = replied ?? (mentioned.length === 1 ? mentioned[0] : null);
	if (!member) return null;

	const reason = replied ? `${last.speaker} replied to them` : `${last.speaker} talked to them by name`;
	return { member, reason, question: asksQuestion(last.text, member.modelData) };
}

export async function chooseSpeaker(members, { loopMode, chain }) {
	const current = engine();
	const last = await latestMessage();
	if (members.length === 0 || !current || !last) return null;

	const direct = current.local ? addressed(members, last) : null;
	if (direct) {
		console.log(`${color.Gray}Director: ${direct.member.modelData.displayname} (${direct.reason})`);
		return direct;
	}

	const lines = await situation(members, { loopMode, chain });
	const names = members.map(({ modelData }) => modelData.displayname);
	const decide = current.local ? decideLocally : decideWithClaude;
	const decision = await decide(members, lines, names, loopMode, current.model);
	if (!decision) return null;

	console.log(`${color.Gray}Director: ${decision.next} (${decision.reason})`);
	if (decision.next === 'nobody') return null;

	const member = members.find(({ modelData }) => modelData.displayname === decision.next);
	return member ? { member, reason: decision.reason } : null;
}
