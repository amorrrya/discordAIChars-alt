import { baseModel } from '../ollama/basemodel.js';
import { isClaudeModel } from '../claude/chat.js';

// RUN_LOCAL=true, set by start-local.bat, uses LOCAL_MODEL even when the API is set up
export function engine() {
	if (process.env.RUN_LOCAL === 'true' && process.env.LOCAL_MODEL) return { local: true, model: process.env.LOCAL_MODEL };
	if (!isClaudeModel(baseModel)) return { local: true, model: baseModel };
	if (process.env.ANTHROPIC_API_KEY) return { local: false, model: baseModel };
	return process.env.LOCAL_MODEL ? { local: true, model: process.env.LOCAL_MODEL } : null;
}
