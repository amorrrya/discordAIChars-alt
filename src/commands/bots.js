import { registerCommand } from "../registrar.js";
import { settings, updateSetting } from "../settings.js";

const { PREFIX } = process.env;

/**
 * Toggle whether characters read and answer messages from other bots and webhooks
 * @param {string} arg1: state - "on" or "off"
 * @returns {string} - The response message
 * @example !bots on
 */
function cmdBots({ arg1: state }) {
	if (!state) return `other bots and webhooks: ${settings.react_to_bots ? 'answered' : 'ignored'}`;

	if (!['on', 'off'].includes(state)) return `${PREFIX}bots on or ${PREFIX}bots off`;

	updateSetting('react_to_bots', state === 'on' ? 'true' : 'false');
	return state === 'on'
		? 'the characters answer other bots and webhooks now'
		: 'the characters ignore other bots and webhooks now';
}

registerCommand('bots', cmdBots, 'Settings', 'whether the characters answer other bots and webhooks', '[on|off]', '$!bots off');
