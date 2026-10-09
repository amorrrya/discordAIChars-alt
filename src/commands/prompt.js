import { getModel, updateField } from "../db.js";
import { registerCommand } from "../registrar.js";
import { canModify } from "../permissions.js";

const { PREFIX } = process.env;

// Longer prompts are sent as a file, a Discord message holds 2000 characters
const inlineLimit = 1800;

async function promptFromFile(attachments) {
	const file = [...attachments.values()].find(attachment => attachment.name?.toLowerCase().endsWith('.txt'));
	if (!file) return null;
	const response = await fetch(file.url);
	return response.ok ? (await response.text()).trim() : null;
}

/**
 * Show or edit the prompt for a model
 * @param {string} arg1: idName - The name of the model
 * @param {string} messageAfterArg1: text - The new prompt, or empty to show it
 * @param {string} authorId - The Discord ID of the author
 * @param {Object[]} attachments - A .txt file can hold the new prompt
 * @returns {string|Array} - The response message, with the prompt as a file when it is long
 * @example !prompt Ben
 * @example !prompt Ben You are ben, a detective in a small town...
 */
async function cmdPrompt({ arg1: idName, messageAfterArg1: text, authorId, attachments }) {
	if (!idName) return `missing name: ${PREFIX}prompt <name> [new prompt]`

	const modelData = await getModel(idName);
	if (!modelData) return `no character named "${idName}"`

	const { owner, displayname, model } = modelData;
	const prompt = text || await promptFromFile(attachments);

	if (!prompt) {
		if (model.length <= inlineLimit) return `prompt of ${displayname}:\n\`\`\`\n${model}\n\`\`\``;
		const file = { attachment: Buffer.from(model, 'utf8'), name: `${modelData.idname.toLowerCase()}-prompt.txt` };
		return [`prompt of ${displayname}, ${model.length} characters:`, file];
	}

	if (!canModify(authorId, owner)) return `${displayname} belongs to someone else`

	try {
		await updateField(idName, 'model', prompt);
		return `prompt of ${displayname} updated`;
	} catch (error) {
		return `prompt not updated: ${error.message}`;
	}
}

registerCommand('prompt', cmdPrompt, 'Manage', 'shows a character\'s prompt, or replaces it with text or an attached .txt', '<name> [new prompt]', '$!prompt wren');
