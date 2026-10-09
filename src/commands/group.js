import { getModel } from "../db.js";
import { registerCommand } from "../registrar.js";
import { getMembers, removeMember, setMember } from "../character/group.js";
import { releaseCharacterWebhook } from "../character/webhooks.js";

const { PREFIX } = process.env;

/**
 * Add a character to the channel chat, or list the characters in it
 * @param {string} arg1: idName - The name of the model
 * @param {string} messageAfterArg1: note - Optional note for the director on how talkative they are
 * @returns {string} - The response message
 * @example !join Wren
 * @example !join Tomas Quiet, answers when Wren comes up or someone asks him directly
 */
async function cmdJoin({ arg1: idName, messageAfterArg1: note }) {
	if (!idName) {
		const members = getMembers();
		if (members.length === 0) return `no characters in the chat: ${PREFIX}join <name> adds one`;

		const list = members.map(({ idname, note }) => `**${idname}**: ${note || 'no note'}`).join('\n');
		return `in the chat:\n${list}`;
	}

	const modelData = await getModel(idName);
	if (!modelData) return `no character named "${idName}"`;

	setMember(modelData.idname.toLowerCase(), note?.trim() || null);
	return `${modelData.displayname} is in the chat`;
}

/**
 * Remove a character from the channel chat
 * @param {string} arg1: idName - The name of the model
 * @returns {string} - The response message
 * @example !leave Wren
 */
async function cmdLeave({ arg1: idName }) {
	if (!idName) return `missing name: ${PREFIX}leave <name>`;

	if (!removeMember(idName.toLowerCase())) return `"${idName}" is not in the chat`;

	const modelData = await getModel(idName);
	if (!modelData) return `${idName} left the chat`;
	try {
		const freed = await releaseCharacterWebhook(modelData);
		return freed > 0 ? `${modelData.displayname} left the chat, their webhook slot is free again` : `${modelData.displayname} left the chat`;
	} catch (err) {
		return `${modelData.displayname} left the chat, but their webhook could not be removed: ${err.message}`;
	}
}

registerCommand('join', cmdJoin, 'Interact', 'adds a character, or lists who is in the chat; the note says how talkative they are', '[name] [note]', '$!join tomas quiet, answers when someone asks him directly');
registerCommand('leave', cmdLeave, 'Interact', 'removes a character from the chat and frees their webhook slot', '<name>', '$!leave wren');
