import { baseModel, getBaseModels, setBaseModel } from "../ollama/basemodel.js";
import { registerCommand } from "../registrar.js";

/**
 * Returns the base model
 * @param {string} arg1: idName - The name of the model or "list"
 * @param {string} authorId - The Discord ID of the author
 * @returns {string} - The response message containing the base model
 * @example !basemodel
 */
async function cmdBasemodel({ arg1: idName, authorId }) {
	if (!idName) {
		const { PICTURE_MODEL, EMBED_MODEL } = process.env;
		return `characters: ${baseModel}\npictures: ${PICTURE_MODEL || baseModel}\nmemory search: ${EMBED_MODEL || 'qwen3-embedding:4b'}, local`;
	}

	const baseModels = await getBaseModels();

	if (idName === 'list') return `available models:\n${baseModels.join('\n')}`

	if (!baseModels.includes(idName)) return `no model named "${idName}"`

	setBaseModel(idName);
	return `the characters run on ${baseModel} now`
}

registerCommand('basemodel', cmdBasemodel, 'Settings', 'the models in use; list shows the others, a name switches to it', '[model|list]', '$!basemodel list');
