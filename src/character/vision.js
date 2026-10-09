import fs from 'fs';

import { askClaude } from '../claude/request.js';
import { isClaudeModel } from '../claude/chat.js';
import { askLocal } from '../ollama/local.js';
import { color } from '../utils/consolecolors.js';
import { detectImageType } from '../utils/imagetype.js';
import { engine } from './engine.js';
import { pictureRules } from './prompts.js';

export async function describePictures(paths, context) {
	const current = engine();
	const chosen = process.env.PICTURE_MODEL;
	if (paths.length === 0 || !current || chosen === 'none') return null;

	try {
		const pictureModel = chosen || current.model;

		if (isClaudeModel(pictureModel) && process.env.ANTHROPIC_API_KEY) {
			const images = paths.map(path => {
				const data = fs.readFileSync(path);
				return { type: 'image', source: { type: 'base64', media_type: detectImageType(data), data: data.toString('base64') } };
			});
			const description = await askClaude({
				label: 'pictures',
				model: pictureModel,
				effort: 'low',
				system: [{ type: 'text', text: pictureRules }],
				messages: [{ role: 'user', content: [...images, { type: 'text', text: context }] }],
				maxTokens: 4000,
			});
			return description?.trim() || null;
		}

		const localModel = isClaudeModel(pictureModel) ? (current.local ? current.model : null) : pictureModel;
		if (!localModel) return null;
		const description = await askLocal({ label: 'pictures', model: localModel, system: pictureRules, prompt: context, images: paths });
		return description?.trim() || null;
	} catch (err) {
		console.error(`${color.Red}Could not describe a picture: ${err.message}`);
		return null;
	}
}
