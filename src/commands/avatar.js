import { getModel, updateField } from "../db.js";
import { registerCommand } from "../registrar.js";
import { canModify } from "../permissions.js";
import { saveImage } from "../utils/imagesave.js";

const { PREFIX } = process.env;

/**
 * Change the avatar of a model, if the model is owned by the user
 * @param {string} arg1: idName - The name of the model
 * @param {string} authorId - The Discord ID of the author
 * @param {Object[]} attachments - The attachments of the message
 * @returns {string[]} - The response message and path to the model's profile
 * @example !avatar Ben
 */
async function cmdAvatar({ arg1: idName, authorId, attachments }) {
	if (!idName) return `missing name: ${PREFIX}avatar <name> [image]`

	const modelData = await getModel(idName);

	if (!modelData) return `no character named "${idName}"`

	const { owner, profile, displayname } = modelData;

	// New avatar not provided, return current avatar
	if (attachments.size === 0) return [`avatar of ${displayname}:`, profile];

	const lowerIdName = idName.toLowerCase();

	// Check if owner
	if (!canModify(authorId, owner)) return `${displayname} belongs to someone else`

	// Get attachment
	const attachment = attachments.first();

	// Save avatar to disk
	const avatarPath = await saveImage(attachment.url, lowerIdName, 'avatars');

	// Edit avatar
	try {
		await updateField(idName, 'profile', avatarPath);
		return `avatar of ${displayname} updated`
	} catch (error) {
		return `avatar not updated: ${error.message}`
	}
}

registerCommand('avatar', cmdAvatar, 'Manage', 'shows a character\'s avatar, or sets the attached image', '<name> [image]', '$!avatar wren with an image attached');
