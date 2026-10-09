import { baseModel } from '../ollama/basemodel.js';
import { isClaudeModel } from '../claude/chat.js';

export function engine() {
	if (!isClaudeModel(baseModel)) return { local: true, model: baseModel };
	if (process.env.ANTHROPIC_API_KEY) return { local: false, model: baseModel };
	return process.env.LOCAL_MODEL ? { local: true, model: process.env.LOCAL_MODEL } : null;
}
