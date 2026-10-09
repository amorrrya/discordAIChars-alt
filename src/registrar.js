export const commands = [];

// Shown in this order by !help
export const categoryNames = {
	Interact: 'chat',
	Manage: 'characters',
	Browse: 'browse',
	Settings: 'settings',
	Other: 'other',
	Debug: 'debug',
}

/**
 * Register a command, used by every command on startup
 * @param {string} command
 * @param {*} callback
 * @param {string} category
 * @param {string} description
 * @param {string} parameters - <needed> and [optional], like !help shows them
 * @param {string} example - A full example, $! stands for the prefix
 */
export function registerCommand(command, callback, category, description = '', parameters = '', example = '') {
	commands.push({ command, callback, category, description, parameters, example });
}

/**
 * Get a callback by command
 * @param {string} command
 * @returns {*} - The callback function
 */
export function getCallbackByCommand(command) {
	const found = commands.find(c => c.command === command);
	if (!found) return null;
	return found.callback;
}
