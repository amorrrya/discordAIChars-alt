import 'dotenv/config'
import './utils/logfile.js';

import { client } from './client.js';
import { isIgnored } from './utils/ignore.js';
import { initCharacters, stopCharacters, talkToChannel } from './character/talk.js';
import { closeMemory } from './memory/db.js';
import { hasChannelCharacters } from './character/group.js';
import { isOwnWebhook } from './character/webhooks.js';
import { isCharacterAccount } from './character/accounts.js';
import { settings } from './settings.js';
import { channel } from './channel.js';
import { hasPendingMessage, processPendingMessages } from './pending.js';
import { getCallbackByCommand } from './registrar.js';
import './commands/_all.js';
import { formatMessage } from './utils/formatter.js';

// Discord bot setup
const { BOT_TOKEN, PREFIX } = process.env;

function extractMessageParts(message) {
	const { content, author, attachments } = message;
	if (!content.startsWith(PREFIX)) return { command: null, restOfMessage: null };

	const command = content.split(' ')[0].replace(PREFIX, '');
	const restOfMessage = content.replace(PREFIX + command, '').trim();
	const args = restOfMessage.split(' ');
	const [ arg1, arg2 ] = args;
	const messageAfterArg1 = args.slice(1).join(' ');
	const messageAfterArg2 = args.slice(2).join(' ');
	const authorId = author.id;
	return { command, restOfMessage, arg1, arg2, messageAfterArg1, messageAfterArg2, authorId, message, attachments };
}


async function checkForProcessableCommands(message) {
	const parts = extractMessageParts(message);
	const { command } = parts;
	if (!command) return false; // Not a command

	const callback = getCallbackByCommand(command);
	if (!callback) return false; // No matching command found

	// Callback may send a response back, which should be sent to the channel
	const response = await callback(parts);
	if (response) {
		const responseObject = typeof response === 'string' ? [ response, null ] : response;
		const messageObject = formatMessage(... responseObject);
		channel.send(messageObject);
	}

	return true;
}

async function checkForPendingMessages(message) {
	if (hasPendingMessage(message.author.id)) {
		const response = await processPendingMessages(message);
		if (response) {
			const messageObject = formatMessage(response);
			channel.send(messageObject);
		}
		return true;
	}
	return false;
}

function isInvalidCommand(message) {
	if (message.content.startsWith(PREFIX)) {
		// Default response for invalid commands
		const name = message.content.split(/\s/)[0];
		const messageObject = formatMessage(`no command named ${name}: ${PREFIX}help lists them`);
		channel.send(messageObject);
		return true;
	}
	return false;
}

// Pictures and stickers sent without text still count as messages
function hasContent(message) {
	return message.content.length > 0 || message.attachments.size > 0 || message.stickers.size > 0 || message.embeds.length > 0;
}

async function talkToDefaultModel(message) {
	if (hasChannelCharacters() && hasContent(message) && !(message.content && isIgnored(message.content))) {
		talkToChannel(message);
		return true;
	}
	return false;
}

// Other bots and webhooks only ever talk to the characters, never run commands
async function isFromOtherBot(message) {
	if (!settings.react_to_bots) return false;
	if (message.author.id === client.user.id || isCharacterAccount(message.author.id)) return false;
	if (message.webhookId && await isOwnWebhook(message.webhookId)) return false;
	return true;
}

client.on('messageCreate', async (message) => {
	// Prevent bot from responding to messages in other channels
	if (message.channel !== channel) return;

	// Prevent bot from responding to itself, and to other bots unless react_to_bots is on
	if (message.author.bot) {
		if (await isFromOtherBot(message)) await talkToDefaultModel(message);
		return;
	}

	if (await checkForProcessableCommands(message)) return;

	if (await checkForPendingMessages(message)) return;

	if (isInvalidCommand(message)) return;

	if (await talkToDefaultModel(message)) return;
});

client.once('ready', async () => {
	try {
		await initCharacters();
	} catch (err) {
		console.error(`Could not set up character memory: ${err.message}`);
	}
});

export function startBot() {
	client.login(BOT_TOKEN);
}

let stopping = false;

/**
 * Finish the reply being written, then close everything cleanly
 */
export async function stopBot() {
	if (stopping) return;
	stopping = true;
	console.log('Shutting down, letting the current reply finish');

	await stopCharacters();
	await client.destroy();
	await closeMemory();
	console.log('Stopped, everything is saved');
	process.exit(0);
}
