import { registerCommand } from "../registrar.js";
import { talkToModel } from "../ollama/chat.js";

const { PREFIX } = process.env;

const maximumModelChain = process.env.MAXIMUM_MODEL_CHAIN || 5;

/**
 * Chain multiple models together, feeding the output of one model to the next.
 * @param {string} restOfMessage - The rest of the message after the command
 * @param {Message} message - The Discord message
 * @returns {string} - The response message
 * @example !chain [Ben, Jerry, Ben] Say hello to Jerry
 */
async function cmdChain({ restOfMessage, message }) {
	const firstBracketIndex = restOfMessage.indexOf('[');
	const lastBracketIndex = restOfMessage.indexOf(']');
	const bracketContent = restOfMessage.substring(firstBracketIndex + 1, lastBracketIndex);

	const modelNames = bracketContent.split(',').map(modelName => modelName.trim()).filter(Boolean);

	if (modelNames.length === 0) return `missing names: ${PREFIX}chain [name, name] <message>`;

	if (modelNames.length > maximumModelChain) return `a chain takes at most ${maximumModelChain} characters`;

	// First prompt is by the user
	let prompt = restOfMessage.substring(lastBracketIndex + 1).trim();

	for (const modelName of modelNames) {
		// Change prompt to the one from the previous model
		prompt = await talkToModel(prompt, message, modelName);

		if (!prompt) return;
	}
}

registerCommand('chain', cmdChain, 'Interact', 'each character answers the one before', '<[name, name]> <message>', '$!chain [wren, tomas] say hi to each other');
