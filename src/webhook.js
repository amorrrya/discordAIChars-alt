import { WebhookClient } from 'discord.js';
import { channel } from './channel.js';
import { color } from './utils/consolecolors.js';
import { existsJson, loadJson, saveJson } from './utils/json.js';

export let webhook = null
export let currentWebhookModel = {
	displayName: null,
	avatar: null,
}

const webhookFileName = 'webhook';

async function createWebhook() {
	const name = Math.random().toString(36).substring(7);
	webhook = await channel.createWebhook({name});
	const { id, token } = webhook;
	
	saveJson(webhookFileName, { id, token, avatar: null, name });

	console.log(`${color.Green}Webhook created: ${webhook.id}`);
}

async function loadWebhook() {
	const webhookData = loadJson(webhookFileName);
	const { id, token, avatar, displayName } = webhookData;
	
	webhook = new WebhookClient({ id, token });
	currentWebhookModel.displayName = displayName;
	currentWebhookModel.avatar = avatar;

	console.log(`${color.Green}Webhook loaded: ${webhook.id}`);
}

export async function updateWebhookIfNecessary(avatar, displayName) {
	// The current webhook is already what we want, no need to update
	if (
		displayName === currentWebhookModel.displayName &&
		avatar === currentWebhookModel.avatar 
	) return;

	// Update webhook
	await webhook.edit({
		name: displayName,
		avatar: avatar,
	});

	currentWebhookModel.displayName = displayName;
	currentWebhookModel.avatar = avatar;

	// Save webhook info to file
	saveJson('webhook', {
		id: webhook.id,
		token: webhook.token,
		avatar: avatar,
		name: displayName,
	});
}

export async function getOrCreateWebhook() {
	try {
		if (existsJson(webhookFileName)) {
			await loadWebhook();
		} else {
			await createWebhook();
		}
	} catch (err) {
		// Only !chain uses this webhook, the characters have their own
		console.log(`${color.Red}Could not set up the shared webhook (${err.message}), !chain is off until a webhook slot in the channel is free`);
	}
}
