import Anthropic from '@anthropic-ai/sdk';

import { estimateCost, recordCost } from '../utils/cost.js';
import { color } from '../utils/consolecolors.js';

export class ClaudeUnavailable extends Error {}

function logUsage(label, usage, dollars) {
	const read = usage.cache_read_input_tokens ?? 0;
	const written = usage.cache_creation_input_tokens ?? 0;
	console.log(`${color.Gray}[${label}] ${read} cached, ${written} cache write, ${usage.input_tokens} new, ${usage.output_tokens} out, $${dollars.toFixed(4)}`);
}

export async function askClaude({ label, model, effort, system, messages, schema = null, maxTokens = 16000 }) {
	if (!process.env.ANTHROPIC_API_KEY) throw new ClaudeUnavailable('ANTHROPIC_API_KEY is empty in .env');

	const outputConfig = { effort };
	if (schema) outputConfig.format = { type: 'json_schema', schema };

	// Created per request so a key changed in .env works without a restart
	const client = new Anthropic();
	const stream = client.beta.messages.stream({
		model,
		max_tokens: maxTokens,
		system,
		messages,
		output_config: outputConfig,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
	});
	const message = await stream.finalMessage();

	const dollars = estimateCost(model, message.usage);
	logUsage(label, message.usage, dollars);
	await recordCost(dollars);

	if (message.stop_reason === 'refusal') {
		console.log(`${color.Red}[${label}] Claude declined (${message.stop_details?.category ?? 'no category'})`);
		return null;
	}

	const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
	if (!schema) return text;

	try {
		return JSON.parse(text);
	} catch {
		console.log(`${color.Red}[${label}] Answer wasn't valid JSON (stop reason: ${message.stop_reason})`);
		return null;
	}
}
