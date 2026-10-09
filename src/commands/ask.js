import { registerCommand } from "../registrar.js";
import { talkAsCharacter } from "../character/talk.js";

const { PREFIX } = process.env;

/**
 * Ask the model a question directly.
 * @param {string} arg1: idName - The name of the model or "random"
 * @param {string} messageAfterArg1: promptString - The prompt for the model to answer
 * @param {Message} message - The Discord message
 * @returns {string} - The response to the command.
 * @example !ask Ben How are you?
 *
 */
function cmdAsk({ arg1: idName, messageAfterArg1: promptString, message }) {
	if (!idName) return `missing name: ${PREFIX}ask <name> <message>`;

	if (!promptString) return `missing message: ${PREFIX}ask <name> <message>`;

	talkAsCharacter(promptString, message, idName);
}

registerCommand('ask', cmdAsk, 'Interact', 'a character answers this message first', '<name|random> <message>', '$!ask wren are you okay');
