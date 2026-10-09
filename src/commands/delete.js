import { deleteModel, getModel } from "../db.js";
import { registerCommand } from "../registrar.js";
import { canModify } from "../permissions.js";

const { PREFIX } = process.env;

/**
 * Delete a model, if the model is owned by the user
 * @param {string} arg1: idName - The name of the model
 * @param {string} authorId - The Discord ID of the author
 * @returns {string} - The response message
 * @example !delete Ben
 */
async function cmdDelete({ arg1: idName, authorId }) {
	if (idName === '') return `missing name: ${PREFIX}delete <name>`

	const modelData = await getModel(idName);

	if (!modelData) return `no character named "${idName}"`

	const { owner, displayname } = modelData;

	if (!canModify(authorId, owner)) return `${displayname} belongs to someone else`

	await deleteModel(idName);

	return `${displayname} deleted`
}

registerCommand('delete', cmdDelete, 'Manage', 'deletes a character you own', '<name>', '$!delete jamal');
