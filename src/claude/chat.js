import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { color } from '../utils/consolecolors.js';
import { detectImageType } from '../utils/imagetype.js';

// Claude's thinking counts toward this limit, so it is set well above the reply length
const maxTokens = 16000;

// Keep at most this many history messages, trimmed in steps so the prompt cache stays valid between trims
const maxHistoryMessages = 80;
const historyTrimStep = 20;

export function isClaudeModel(model) {
	return model.startsWith('claude-');
}

export function trimHistory(history) {
	if (history.length <= maxHistoryMessages) return history;

	const start = Math.ceil((history.length - maxHistoryMessages) / historyTrimStep) * historyTrimStep;
	return history.slice(start);
}

function toContent({ content, images }) {
	if (!images?.length) return content;

	const imageBlocks = images.map(imagePath => {
		const data = fs.readFileSync(imagePath);
		return {
			type: 'image',
			source: { type: 'base64', media_type: detectImageType(data), data: data.toString('base64') },
		};
	});
	return [...imageBlocks, { type: 'text', text: content || 'Look at this picture.' }];
}

function toClaudeRequest(messages) {
	const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
	const conversation = messages
		.filter(m => m.role !== 'system')
		.map(m => ({ role: m.role, content: toContent(m) }));

	// The first message has to come from the user
	if (conversation[0]?.role !== 'user') {
		conversation.unshift({ role: 'user', content: '(The conversation begins.)' });
	}

	return { system, messages: conversation };
}

export async function streamClaude(model, messages, onText) {
	// Created per request so a key added to .env works without a restart
	const client = new Anthropic();
	const stream = client.beta.messages.stream({
		model,
		max_tokens: maxTokens,
		output_config: { effort: process.env.CLAUDE_EFFORT || 'low' },
		cache_control: { type: 'ephemeral' },
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		...toClaudeRequest(messages),
	});

	let text = '';
	stream.on('text', delta => {
		text += delta;
		onText(text, delta);
	});

	const message = await stream.finalMessage();

	if (message.stop_reason === 'refusal') {
		console.log(`\n${color.Red}Claude declined (${message.stop_details?.category ?? 'no category'})`);
		return null;
	}

	const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens } = message.usage;
	console.log(`\n${color.Gray}Tokens: ${input_tokens} in, ${cache_read_input_tokens ?? 0} cached, ${cache_creation_input_tokens ?? 0} cache write, ${output_tokens} out`);

	return text;
}
