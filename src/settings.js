import { format } from "./utils/formatter.js";
import fs from 'fs';

const defaultSettings = {
	temperature: 0.8,
	num_predict: 512,
	num_ctx: 2048,
	// microstat: 1,
	// microstat_eta: 0.1,
	// microstat_tau: 5,
	top_p: 0.9,
	top_k: 40,
	repeat_penalty: 1.1,
	simultaneous_messages: false,
	react_to_bots: false,
}

const settingDataTypes = {
	temperature: 'float',
	num_predict: 'int',
	num_ctx: 'int',
	// microstat: 'int',
	// microstat_eta: 'float',
	// microstat_tau: 'float',
	top_p: 'float',
	top_k: 'int',
	repeat_penalty: 'float',
	simultaneous_messages: 'bool',
	react_to_bots: 'bool',
}

const settingBounds = {
	temperature: [0, 1],
	num_predict: [1, 2000],
	num_ctx: [1, 50000],
	// microstat: [0, 2],
	// microstat_eta: [0, 5],
	// microstat_tau: [0, 10],
	top_p: [0, 1],
	top_k: [1, 500],
	repeat_penalty: [0, 50],
}

const settingDescriptions = {
	temperature: 'local model: randomness, higher is more creative',
	num_predict: '!chain only: longest reply, in tokens',
	num_ctx: '!chain only: how much it reads, the group chat uses LOCAL_CONTEXT in .env',
	// microstat: 'Enable Mirostat sampling for controlling perplexity',
	// microstat_eta: 'Influences how quickly the algorithm responds to feedback from the generated text. Higher = More responsive to change',
	// microstat_tau: 'Controls the balance between coherence and diversity of the output. Lower = Focused',
	top_k: 'local model: how many word choices it weighs, higher is more varied',
	top_p: 'local model: works with top_k, higher is more varied',
	repeat_penalty: 'local model: how hard it avoids repeating itself',
	simultaneous_messages: '!chain: allow several replies at once',
	react_to_bots: 'the characters answer other bots and webhooks',
}

function copyDefaultSettings() {
	return JSON.parse(JSON.stringify(defaultSettings));
}

const settingsFilePath = 'settings.json';

// Load settings from settings.json if it exists
export let settings = copyDefaultSettings();
if (fs.existsSync(settingsFilePath)) {
	const loadedSettings = JSON.parse(fs.readFileSync(settingsFilePath));
	settings = { ...defaultSettings, ...loadedSettings };
}

export function updateSetting(key, inputString) {
	const errorMessage = validateInput(key, inputString);
	if (errorMessage) return errorMessage;

	const dataType = settingDataTypes[key];
	const value = convertValue(inputString, dataType);
	settings[key] = value;
	fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
	return `${key} set to ${value}`;
}

function validateInput(key, inputString) {
	const bounds = settingBounds[key];
	const dataType = settingDataTypes[key];

	if (!dataType) return `no setting named "${key}"`;

	if (inputString === undefined || inputString === '') return `missing value: ${key} <value>`;

	if (dataType === 'float' && isNaN(parseFloat(inputString))) {
		return `${key} takes a number`;
	}

	if (dataType === 'int' && isNaN(parseInt(inputString))) {
		return `${key} takes a whole number`;
	}

	if (dataType === 'bool' && !['true', 'false'].includes(inputString.toLowerCase())) {
		return `${key} takes true or false`;
	}

	if (bounds) {
		const [min, max] = bounds;
		const value = parseFloat(inputString);
		if (value < min || value > max) {
			return `${key} goes from ${min} to ${max}`;
		}
	}

	return null; // No error
}

function convertValue(inputString, dataType) {
	if (dataType === 'float') {
		return parseFloat(inputString);
	} 
	if (dataType === 'int') {
		return parseInt(inputString);
	} 
	if (dataType === 'bool') {
		return inputString.toLowerCase() === 'true';
	}
}

export function resetSettings() {
	settings = copyDefaultSettings();
	fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
}

export function displaySettings() {
	let displayString = '$tsettings\n\n';
	for (const key in settings) {
		const range = settingBounds[key] ? `, ${settingBounds[key][0]} to ${settingBounds[key][1]}` : '';
		displayString += `$p${settingDescriptions[key]}\n$y${key}$x: $w${settings[key]} $x(default ${defaultSettings[key]}${range})\n\n`;
	}
	return format(displayString.trimEnd());
}

export function getParameters() {
	return {
		temperature: settings.temperature,
		num_predict: settings.num_predict,
		num_ctx: settings.num_ctx,
		top_p: settings.top_p,
		top_k: settings.top_k,
		repeat_penalty: settings.repeat_penalty,
	}
}
