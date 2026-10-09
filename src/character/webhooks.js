import fs from 'fs';

import { client } from '../client.js';
import { channel } from '../channel.js';
import { webhook as sharedWebhook } from '../webhook.js';
import { getAllModels } from '../db.js';
import { getMembers } from './group.js';

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

function ownWebhooks(all) {
	return [...all.values()].filter(existing => existing.owner?.id === client.user.id && existing.id !== sharedWebhook?.id);
}

// Discord allows 15 webhooks per channel. When it's full, one of this bot's webhooks that no character in the chat needs gets renamed.
async function spareWebhook(all) {
	const characters = new Map((await getAllModels()).map(model => [model.displayname, model.idname.toLowerCase()]));
	const chatting = new Set(getMembers().map(member => member.idname));
	const own = ownWebhooks(all);
	return own.find(existing => !characters.has(existing.name)) ?? own.find(existing => !chatting.has(characters.get(existing.name))) ?? null;
}

// A character leaving the chat gives their webhook slot back to the channel, it is made again if they return
export async function releaseCharacterWebhook({ idname, displayname }) {
	webhooks.delete(idname.toLowerCase());
	const own = ownWebhooks(await channel.fetchWebhooks()).filter(existing => existing.name === displayname);
	for (const webhook of own) {
		await webhook.delete();
		ownWebhookIds.delete(webhook.id);
	}
	return own.length;
}

export async function getCharacterWebhook({ idname, displayname, profile }) {
	const key = idname.toLowerCase();
	const version = avatarVersion(profile);

	const cached = webhooks.get(key);
	if (cached && cached.name === displayname && cached.version === version) return cached.webhook;

	const avatar = version ? profile : null;
	const all = cached ? null : await channel.fetchWebhooks();
	let webhook = cached?.webhook ?? ownWebhooks(all).find(existing => existing.name === displayname);

	let created = false;
	if (!webhook) {
		try {
			webhook = await channel.createWebhook({ name: displayname, avatar });
			created = true;
		} catch (err) {
			if (err.code !== 30007) throw err;
			webhook = await spareWebhook(all);
			if (!webhook) {
				throw new Error(`this channel has Discord's limit of 15 webhooks, so ${displayname} can't post: delete unused ones in the channel settings under Integrations, Webhooks`);
			}
			for (const [other, entry] of webhooks) if (entry.webhook.id === webhook.id) webhooks.delete(other);
		}
	}
	if (!created) webhook = await webhook.edit({ name: displayname, avatar });

	webhooks.set(key, { webhook, name: displayname, version });
	ownWebhookIds.add(webhook.id);
	return webhook;
}
