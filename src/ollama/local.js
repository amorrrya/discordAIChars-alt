import ollama from 'ollama';

import { settings } from '../settings.js';
import { color } from '../utils/consolecolors.js';

export function localContext() {
	return Number(process.env.LOCAL_CONTEXT) || 32768;
}

export function localThinking() {
	return process.env.LOCAL_THINK === 'true';
}

function parseJson(text) {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

export const thinkingTokens = 8192;

export async function askLocal({ label, model, system, prompt, schema = null, images = undefined, temperature = settings.temperature, think = localThinking() }) {
	const response = await ollama.chat({
		model,
		stream: false,
		keep_alive: '30m',
		think,
		format: schema ?? undefined,
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: prompt, images },
		],
		options: {
			num_ctx: localContext(),
			num_predict: think ? thinkingTokens : 2048,
			temperature,
			top_p: settings.top_p,
			top_k: settings.top_k,
			repeat_penalty: settings.repeat_penalty,
		},
	});

	const reading = (response.prompt_eval_duration ?? 0) / 1e9;
	const writing = (response.eval_duration ?? 0) / 1e9;
	const speed = writing > 0 ? ` at ${Math.round(response.eval_count / writing)} per second` : '';
	console.log(`${color.Gray}[${label}] ${response.prompt_eval_count ?? 0} tokens read in ${reading.toFixed(1)}s, ${response.eval_count ?? 0} written${speed}`);

	const text = response.message.content ?? '';
	return schema ? parseJson(text) : text;
}
