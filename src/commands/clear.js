import { registerCommand } from "../registrar.js";
import { getModel } from "../db.js";
import { isAdmin } from "../permissions.js";
import { clearAllMessages, clearLastMessagesFrom, clearMessagesFrom } from "../ollama/previousmessages.js";
import { clearChatMemory, deleteLastMessages } from "../memory/messages.js";
import { isMember } from "../character/group.js";

const { PREFIX } = process.env;

/**
 * Remove recent messages from the characters' memory, or wipe it
 * @param {string} arg1: amount, "all", or the name of a model outside the channel chat
 * @param {string} arg2: amount - For models outside the channel chat
 * @param {string} authorId - The Discord ID of the author
 * @returns {string} - The response message
 * @example !clear 3
 * @example !clear all
 */
async function cmdClear({ arg1, arg2: amount, authorId }) {
	if (!arg1) return `missing number: ${PREFIX}clear <number> forgets the last messages, ${PREFIX}clear all forgets everything`;

	if (arg1 === 'all') {
		if (!isAdmin(authorId)) return 'only the admin can wipe the memory';
		await clearChatMemory();
		clearAllMessages();
		return 'the characters forgot everything';
	}

	const count = parseInt(arg1);
	if (!isNaN(count)) {
		const removed = await deleteLastMessages(count);
		return `the characters forgot the last ${removed} message${removed === 1 ? '' : 's'}`;
	}

	if (isMember(arg1)) return `the characters share one memory: ${PREFIX}clear <number|all>`;

	// Models outside the channel chat still keep their own history
	const modelData = await getModel(arg1);
	if (!modelData) return `no character named "${arg1}"`;

	const lowerIdName = arg1.toLowerCase();
	if (!amount) {
		clearMessagesFrom(lowerIdName);
		return `history of ${modelData.displayname} cleared`;
	}

	const num = parseInt(amount);
	if (isNaN(num)) return `not a number: ${amount}`;
	clearLastMessagesFrom(lowerIdName, num);
	return `last ${num} messages of ${modelData.displayname} cleared`;
}

registerCommand('clear', cmdClear, 'Interact', 'the characters forget the last messages; all wipes everything, admin only', '<number|all>', '$!clear 3');
