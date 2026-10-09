import { getAllModels } from "../db.js";
import { registerCommand } from "../registrar.js";

const { PREFIX } = process.env;

/**
 * Show a list of all available models, separated by whether the user owns them or not.
 * @param {String} authorId - The Discord user ID
 * @returns {string} - The response message
 * @example !list
 */
async function cmdList({ authorId }) {
	const modelDataArr = await getAllModels();

	if (!modelDataArr.length) return `no characters yet: ${PREFIX}create makes one`;

	const yourModels = [];
	const otherModels = [];

	for (const { idname, owner } of modelDataArr) {
		if (owner === authorId) {
			yourModels.push(idname);
		} else {
			otherModels.push(idname);
		}
	}

	return `yours: ${yourModels.join(', ') || 'none'}\nothers: ${otherModels.join(', ') || 'none'}`;
}

registerCommand('list', cmdList, 'Browse', 'all characters, yours first');
