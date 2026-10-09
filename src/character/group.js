import { getModel } from '../db.js';
import { defaultChannelModel } from '../ollama/defaultmodel.js';
import { existsJson, loadJson, saveJson } from '../utils/json.js';

const MEMBERS_FILE = 'groupMembers';
const NOTES_FILE = 'groupNotes';

let members = existsJson(MEMBERS_FILE) ? loadJson(MEMBERS_FILE) : [];

// Notes of characters who left, so a plain !join brings them back as they were
const savedNotes = existsJson(NOTES_FILE) ? loadJson(NOTES_FILE) : {};

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
		members.push({ idname: idName, note: note ?? savedNotes[idName] ?? '' });
	}
	save();
}

export function removeMember(idName) {
	const leaving = members.find(member => member.idname === idName);
	if (!leaving) return false;

	if (leaving.note) {
		savedNotes[idName] = leaving.note;
		saveJson(NOTES_FILE, savedNotes);
	}
	members = members.filter(member => member !== leaving);
	save();
	return true;
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
