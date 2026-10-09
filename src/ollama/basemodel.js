import ollama from 'ollama';

const { BASE_MODEL, IMAGE_RECOGNITION_MODEL } = process.env;

export let baseModel = BASE_MODEL || 'gemma4:e4b';

export function setBaseModel(newModel) {
	baseModel = newModel;
}

export let imageRecognitionModel = IMAGE_RECOGNITION_MODEL || baseModel;

export function setImageRecognitionModel(newModel) {
	imageRecognitionModel = newModel;
}

export async function getBaseModels() {
	const modelObjects = await ollama.list();
	const ollamaModels = modelObjects.models.map(({ name }) => name.replace(':latest', ''));
	return process.env.ANTHROPIC_API_KEY ? [ 'claude-opus-5-5', ...ollamaModels ] : ollamaModels;
}
