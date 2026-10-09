import { channel } from "../channel.js";
import { format } from "../utils/formatter.js";
import { registerCommand, commands, categoryNames } from "../registrar.js";

const { PREFIX } = process.env;

// Discord takes 2000 characters per message
const messageLimit = 1900;

function usage({ command, parameters }) {
	return `$y$!${command}${parameters ? ` $g${parameters}` : ''}`;
}

function line(entry) {
	return `${usage(entry)}${entry.description ? `$x: $w${entry.description}` : ''}`;
}

function details(entry) {
	const lines = [usage(entry), `$w${entry.description}`];
	if (entry.example) lines.push(`$xe.g. $w${entry.example}`);
	return format(lines.join('\n'));
}

// Categories are packed into as few messages as fit
function pack(blocks) {
	const messages = [];
	let current = '';
	for (const block of blocks) {
		const joined = current ? `${current}\n\n${block}` : block;
		if (current && format(joined).length > messageLimit) {
			messages.push(current);
			current = block;
		} else {
			current = joined;
		}
	}
	if (current) messages.push(current);
	return messages.map(format);
}

/**
 * List all commands, or show one command's usage
 * @param {string} arg1: term - A command name or part of one
 * @returns {string} - The last help message, the ones before it are sent directly
 * @example !help
 * @example !help join
 */
async function cmdHelp({ arg1: term }) {
	const visible = commands.filter(({ category }) => category !== 'Debug');

	if (term) {
		const name = term.toLowerCase().replace(PREFIX, '');
		const exact = visible.find(entry => entry.command === name);
		if (exact) return details(exact);

		const matches = visible.filter(entry => entry.command.includes(name));
		if (matches.length === 0) return `no command matches "${term}"`;
		return format(matches.map(line).join('\n'));
	}

	const blocks = Object.keys(categoryNames)
		.map(category => {
			const entries = visible.filter(entry => entry.category === category);
			return entries.length > 0 ? `$t${categoryNames[category]}\n${entries.map(line).join('\n')}` : null;
		})
		.filter(Boolean);
	blocks.push('$pthe characters skip messages that start with # or _\n$x$!help <command> shows its usage and an example');

	const messages = pack(blocks);
	for (const message of messages.slice(0, -1)) await channel.send(message);
	return messages[messages.length - 1];
}

registerCommand('help', cmdHelp, 'Other', 'all commands, or the usage of one', '[command]', '$!help join');
