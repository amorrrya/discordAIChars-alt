import fs from 'fs';

import { client } from '../client.js';
import { channel } from '../channel.js';
import { webhook as sharedWebhook } from '../webhook.js';

// One webhook per character, so names and avatars never have to be swapped back and forth
const webhooks = new Map();

const ownWebhookIds = new Set();
const otherWebhookIds = new Set();

export async function isOwnWebhook(webhookId) {
	if (webhookId === sharedWebhook?.id || ownWebhookIds.has(webhookId)) return true;
	if (otherWebhookIds.has(webhookId)) return false;

	for (const existing of (await channel.fetchWebhooks()).values()) {
		if (existing.owner?.id === client.user.id) ownWebhookIds.add(existing.id);
	}

	if (ownWebhookIds.has(webhookId)) return true;
	otherWebhookIds.add(webhookId);
	return false;
}

function avatarVersion(profile) {
	if (!profile || !fs.existsSync(profile)) return null;
	return `${profile}:${fs.statSync(profile).mtimeMs}`;
}

export async function getCharacterWebhook({ idname, displayname, profile }) {
	const key = idname.toLowerCase();
	const version = avatarVersion(profile);

	const cached = webhooks.get(key);
	if (cached && cached.name === displayname && cached.version === version) return cached.webhook;

	const avatar = version ? profile : null;
	let webhook = cached?.webhook ?? (await channel.fetchWebhooks()).find(existing =>
		existing.owner?.id === client.user.id &&
		existing.name === displayname &&
		existing.id !== sharedWebhook?.id
	);

	if (webhook) {
		webhook = await webhook.edit({ name: displayname, avatar });
	} else {
		webhook = await channel.createWebhook({ name: displayname, avatar });
	}

	webhooks.set(key, { webhook, name: displayname, version });
	ownWebhookIds.add(webhook.id);
	return webhook;
}
