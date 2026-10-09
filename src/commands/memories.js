import { getModel } from "../db.js";
import { registerCommand } from "../registrar.js";
import { getState, memoryCount } from "../memory/memories.js";
import { allMemoriesOf } from "../character/speaker.js";
import { formatShortDay, timeAgo } from "../character/transcript.js";

const { PREFIX } = process.env;

const shownMemories = 10;

/**
 * Show what a character remembers and how they're doing
 * @param {string} arg1: idName - The name of the model
 * @returns {string} - The response message
 * @example !memories Wren
 */
async function cmdMemories({ arg1: idName }) {
	if (!idName) return `missing name: ${PREFIX}memories <name>`;

	const modelData = await getModel(idName);
	if (!modelData) return `no character named "${idName}"`;

	const character = modelData.idname.toLowerCase();
	const state = await getState(character);
	const memories = await allMemoriesOf(character, shownMemories);
	const total = await memoryCount(character);

	const lines = [modelData.displayname];
	if (state) {
		lines.push(`mood: ${state.mood}`, `doing: ${state.doing}`, `thinking: ${state.thoughts}`, `as of ${timeAgo(state.updated)}`);
	}
	lines.push('', total === 0 ? 'no memories yet' : `${total} memories, newest first:`);
	for (const memory of memories) lines.push(`[${formatShortDay(memory.time)}] ${memory.text}`);

	return `\`\`\`\n${lines.join('\n').slice(0, 1900)}\n\`\`\``;
}

registerCommand('memories', cmdMemories, 'Interact', 'a character\'s mood, activity and newest memories', '<name>', '$!memories wren');
