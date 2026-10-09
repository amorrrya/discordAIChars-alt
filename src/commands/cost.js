import { registerCommand } from "../registrar.js";
import { recentCosts } from "../utils/cost.js";

/**
 * Show the estimated API spending of the last days
 * @returns {string} - The response message
 * @example !cost
 */
async function cmdCost() {
	const days = await recentCosts(7);
	if (days.length === 0) return 'no API requests yet';

	const lines = days.map(({ day, dollars, requests }) => `${day}: $${dollars.toFixed(2)}, ${requests} requests`);
	return `estimated API spending:\n${lines.join('\n')}`;
}

registerCommand('cost', cmdCost, 'Other', 'estimated API spending, last 7 days');
