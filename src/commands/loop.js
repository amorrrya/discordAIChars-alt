import { registerCommand } from "../registrar.js";
import { isAdmin } from "../permissions.js";
import { isLoopMode, setLoopMode } from "../character/talk.js";

const { PREFIX } = process.env;

/**
 * Toggle loop mode, where the characters keep talking to each other without a reply limit
 * @param {string} authorId - The Discord ID of the author
 * @returns {string} - The response message
 * @example !loop
 */
function cmdLoop({ authorId }) {
	if (isLoopMode()) {
		setLoopMode(false);
		return 'loop mode off';
	}

	// It spends API credit nonstop, so only the admin can start it
	if (!isAdmin(authorId)) return 'only the admin can start loop mode';

	setLoopMode(true);
	return `loop mode on: the characters keep talking until ${PREFIX}loop`;
}

registerCommand('loop', cmdLoop, 'Interact', 'the characters keep talking on their own until $!loop again; admin only, ends after 30 quiet minutes');
