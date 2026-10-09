import { all, run } from '../memory/db.js';

// Dollars per million tokens: input, output, cache read, cache write (5 minutes), cache write (1 hour)
const prices = {
	'claude-opus-5-5': [4, 20, 0.2, 5, 8],
	'claude-opus-5': [5, 25, 0.5, 6.25, 10],
	'claude-opus-4-8': [5, 25, 0.5, 6.25, 10],
	'claude-sonnet-5-5': [2, 10, 0.2, 2.5, 4],
	'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125, 0.2],
	'claude-fable-5-1': [10, 50, 0.25, 12.5, 20],
};

export function estimateCost(model, usage) {
	const [input, output, cacheRead, write5m, write1h] = prices[model] ?? prices['claude-opus-5-5'];
	const written1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
	const written5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (usage.cache_creation_input_tokens ?? 0) - written1h);

	const tokens =
		usage.input_tokens * input +
		usage.output_tokens * output +
		(usage.cache_read_input_tokens ?? 0) * cacheRead +
		written5m * write5m +
		written1h * write1h;
	return tokens / 1_000_000;
}

function today() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function recordCost(dollars) {
	await run(
		'INSERT INTO costs (day, dollars, requests) VALUES (?, ?, 1) ON CONFLICT(day) DO UPDATE SET dollars = dollars + excluded.dollars, requests = requests + 1',
		[today(), dollars]
	);
}

export async function recentCosts(days = 7) {
	return all('SELECT day, dollars, requests FROM costs ORDER BY day DESC LIMIT ?', [days]);
}
