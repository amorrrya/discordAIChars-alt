import fs from 'fs';
import path from 'path';

const loreDirectory = 'lore';

let cached = { key: null, text: '' };

function loreFiles() {
	if (!fs.existsSync(loreDirectory)) return [];
	// Files starting with _ are kept out, for notes and drafts
	return fs.readdirSync(loreDirectory).filter(file => file.endsWith('.md') && !file.startsWith('_')).sort();
}

export function lorebookKey() {
	return loreFiles().map(file => `${file}:${fs.statSync(path.join(loreDirectory, file)).mtimeMs}`).join('|');
}

export function lorebookTexts() {
	return loreFiles().map(file => fs.readFileSync(path.join(loreDirectory, file), 'utf8'));
}

export function loadLorebook() {
	const files = loreFiles();
	const key = lorebookKey();

	if (key !== cached.key) {
		const text = files.map(file => fs.readFileSync(path.join(loreDirectory, file), 'utf8').trim()).join('\n\n---\n\n');
		cached = { key, text };
	}
	return cached.text;
}

export function lorebookFiles() {
	return loreFiles().map(file => ({ file, characters: fs.statSync(path.join(loreDirectory, file)).size }));
}
