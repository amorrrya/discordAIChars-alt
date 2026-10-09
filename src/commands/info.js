import { registerCommand } from "../registrar.js";
import { getApplicableModel } from "../db.js";
import { client } from "../client.js";
import { isMember } from "../character/group.js";
import { memoryCount } from "../memory/memories.js";

const { PREFIX } = process.env;

async function userName(id) {
	try {
		return (await client.users.fetch(id)).username;
	} catch {
		return id;
	}
}

/**
 * Show various information about a model.
 * @param {string} arg1: idName - The name of the model or "random"
 * @returns {string[]} - The response message and path to the model's profile
 * @example !info Ben
 */
async function cmdInfo({ arg1: idName }) {
	if (!idName) return `missing name: ${PREFIX}info <name>`

	const modelData = await getApplicableModel(idName);

	if (!modelData) return `no character named "${idName}"`

	const { displayname, owner, model, profile, idname } = modelData;
	const character = idname.toLowerCase();

	const lines = [
		displayname,
		`owner: ${await userName(owner)}`,
		`in the chat: ${isMember(character) ? 'yes' : 'no'}`,
		`prompt: ${model.length} characters, ${PREFIX}prompt ${character} shows it`,
		`memories: ${await memoryCount(character)}`,
	];
	return [lines.join('\n'), profile];
}

registerCommand('info', cmdInfo, 'Browse', 'a character\'s owner, avatar, prompt size and memories', '<name|random>', '$!info wren');
