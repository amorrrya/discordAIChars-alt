import fs from 'fs';
import { ActivityType, Client, GatewayIntentBits } from 'discord.js';

import { getMeta, setMeta } from '../memory/db.js';
import { color } from '../utils/consolecolors.js';

// Characters with a bot account (TOKEN_<NAME> in .env) can show typing and reply, the others post through webhooks
const accounts = new Map();

function idOf(modelData) {
	return modelData.idname.toLowerCase();
}

function tokenOf(modelData) {
	return process.env[`TOKEN_${idOf(modelData).toUpperCase()}`] || null;
}

// Discord limits how often names and pictures change, so they only change when they differ
async function syncProfile(client, modelData) {
	const { displayname, profile } = modelData;
	try {
		if (client.user.username !== displayname) await client.user.setUsername(displayname);
	} catch (err) {
		console.log(`${color.Gray}Could not rename the ${displayname} account: ${err.message}`);
	}

	if (!profile || !fs.existsSync(profile)) return;
	const version = `${profile}:${fs.statSync(profile).mtimeMs}`;
	const key = `account_avatar_${idOf(modelData)}`;
	if ((await getMeta(key)) === version) return;
	try {
		await client.user.setAvatar(profile);
		await setMeta(key, version);
	} catch (err) {
		console.log(`${color.Gray}Could not change the ${displayname} account picture: ${err.message}`);
	}
}

export async function ensureAccount(modelData) {
	const key = idOf(modelData);
	if (accounts.has(key)) return accounts.get(key);

	const token = tokenOf(modelData);
	if (!token) return null;

	try {
		const client = new Client({ intents: [GatewayIntentBits.Guilds] });
		const ready = new Promise(resolve => client.once('ready', resolve));
		await client.login(token);
		await ready;
		const channel = await client.channels.fetch(process.env.CHANNEL_ID);
		const account = { client, channel };
		accounts.set(key, account);
		await syncProfile(client, modelData);
		console.log(`${color.Green}${modelData.displayname} is online with their own account`);
		return account;
	} catch (err) {
		console.log(`${color.Red}Could not log in ${modelData.displayname}'s account, using a webhook: ${err.message}`);
		return null;
	}
}

export async function loginAccounts(members) {
	for (const { modelData } of members) await ensureAccount(modelData);
}

export function accountOf(modelData) {
	return accounts.get(idOf(modelData)) ?? null;
}

export function isCharacterAccount(userId) {
	return [...accounts.values()].some(({ client }) => client.user?.id === userId);
}

export function showActivity(modelData, doing) {
	const account = accountOf(modelData);
	if (!account || !doing) return;
	account.client.user.setPresence({
		activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: doing.slice(0, 128) }],
		status: 'online',
	});
}

export function startTyping(account, from = Date.now()) {
	let stopped = false;
	let timer;
	const tick = () => {
		if (stopped) return;
		account.channel.sendTyping().catch(() => {});
		// Discord shows typing for about 10 seconds per call
		timer = setTimeout(tick, 8000);
	};
	timer = setTimeout(tick, Math.max(0, from - Date.now()));
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}

export async function logoutAccounts() {
	for (const { client } of accounts.values()) await client.destroy();
	accounts.clear();
}
