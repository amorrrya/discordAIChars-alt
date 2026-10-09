import { Message } from "discord.js";
import { getModel, updateField } from "../db.js";
import { registerCommand } from "../registrar.js";
import { canModify } from "../permissions.js";

const { PREFIX } = process.env;

/**
 * Transfer ownership of a model to another user.
 * @param {string} arg1: idName - The name of the model
 * @param {string} arg2: newOwner - The user to transfer ownership to
 * @param {string} authorId - The Discord ID of the author
 * @param {Message} message
 * @returns {string} - The response message
 * @example !transfer Ben <@1234567890>
 */
async function cmdTransfer({ arg1: idName, arg2: newOwner, authorId }) {
	if (!idName || !newOwner) return `missing name or user: ${PREFIX}transfer <name> <@user>`

	// Remove non-numeric characters from user
	const newOwnerId = newOwner.replace(/\D/g, '');

	// Check if owner
	const modelData = await getModel(idName);

	if (!modelData) return `no character named "${idName}"`

	const { owner, displayname } = modelData;

	if (!canModify(authorId, owner)) return `${displayname} belongs to someone else`

	// Transfer ownership
	try {
		await updateField(idName, 'owner', newOwnerId);
		return `${displayname} belongs to <@${newOwnerId}> now`
	} catch (error) {
		return `transfer failed: ${error.message}`
	}
}

registerCommand('transfer', cmdTransfer, 'Manage', 'gives a character you own to another user', '<name> <@user>', '$!transfer wren @someone')
