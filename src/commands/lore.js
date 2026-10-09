import { registerCommand } from "../registrar.js";
import { lorebookFiles } from "../lore/lorebook.js";

/**
 * List the lorebook files the characters know
 * @returns {string} - The response message
 * @example !lore
 */
function cmdLore() {
	const files = lorebookFiles();
	if (files.length === 0) return 'the lorebook is empty: add .md files to the lore folder';

	const lines = files.map(({ file, characters }) => `${file}: about ${Math.round(characters / 3.5 / 1000)}k tokens`);
	const total = files.reduce((sum, { characters }) => sum + characters, 0);
	return `lorebook, about ${Math.round(total / 3.5 / 1000)}k tokens in the lore folder:\n${lines.join('\n')}`;
}

registerCommand('lore', cmdLore, 'Other', 'the lorebook files and their size');
