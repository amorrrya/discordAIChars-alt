import { registerCommand } from "../registrar.js";
import { getApplicableModel } from "../db.js";
import { resetDefaultChannelModel, setDefaultChannelModel } from "../ollama/defaultmodel.js";

const { PREFIX } = process.env;

/**
 * Set a model as the default model for the channel, or clear the default model.
 * @param {string} arg1: idName - The name of the model or "random"
 * @returns {string} - The response message
 * @example !default
 * @example !default Ben
 */
async function cmdDefault({ arg1: idName }) {
	if (idName === '') {
		resetDefaultChannelModel();
		return 'default character cleared'
	}

	const modelData = await getApplicableModel(idName)

	if (!modelData) return `no character named "${idName}"`

	const { displayname } = modelData;

	setDefaultChannelModel(idName);
	return `default character: ${displayname}, used while nobody joined with ${PREFIX}join`
}

registerCommand('default', cmdDefault, 'Interact', 'the character that answers while nobody joined; empty clears it', '[name]', '$!default wren');
