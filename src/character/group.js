import { getModel } from '../db.js';
import { defaultChannelModel } from '../ollama/defaultmodel.js';
import { existsJson, loadJson, saveJson } from '../utils/json.js';

const MEMBERS_FILE = 'groupMembers';

let members = existsJson(MEMBERS_FILE) ? loadJson(MEMBERS_FILE) : [];

export function getMembers() {
	return members;
}

function save() {
	saveJson(MEMBERS_FILE, members);
}

export function setMember(idName, note) {
	const existing = members.find(member => member.idname === idName);
	if (existing) {
		if (note) existing.note = note;
	} else {
		members.push({ idname: idName, note: note ?? '' });
	}
	save();
}

export function removeMember(idName) {
	const before = members.length;
	members = members.filter(member => member.idname !== idName);
	save();
	return members.length !== before;
}

export function isMember(idName) {
	return members.some(member => member.idname === idName.toLowerCase());
}

export function hasChannelCharacters() {
	return members.length > 0 || Boolean(defaultChannelModel);
}

// Older member lists had reply chances instead of notes
export function upgradeMembers() {
	let changed = false;
	for (const member of members) {
		if (member.note === undefined) {
			member.note = '';
			changed = true;
		}
		if ('chance' in member || 'loopChance' in member) {
			delete member.chance;
			delete member.loopChance;
			changed = true;
		}
	}
	if (changed) save();
}

export async function loadMembers() {
	const list = members.length > 0 ? members : [{ idname: defaultChannelModel, note: '' }];

	const loaded = [];
	for (const { idname, note } of list) {
		if (!idname) continue;
		const modelData = await getModel(idname);
		if (modelData) loaded.push({ modelData, note: note ?? '' });
	}
	return loaded;
}
