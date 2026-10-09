import fs from 'fs';
import os from 'os';
import readline from 'readline/promises';
import { execFileSync, spawnSync } from 'child_process';

// The best model that fits, checked from the top. Sizes are downloads in GB.
const gpuTiers = [
	{ vram: 24, ram: 16, model: 'gemma4:31b', size: 20.4, context: 32768 },
	{ vram: 16, ram: 32, model: 'gemma4:26b', size: 18.7, context: 32768 },
	{ vram: 12, ram: 16, model: 'gemma4:12b-it-qat', size: 7.2, context: 32768 },
	{ vram: 8, ram: 16, model: 'gemma4:e4b', size: 6.6, context: 16384 },
	{ vram: 6, ram: 8, model: 'gemma4:e2b', size: 4.6, context: 8192 },
];

const cpuTiers = [
	{ ram: 16, model: 'gemma4:e4b', size: 6.6, context: 8192 },
	{ ram: 8, model: 'gemma4:e2b', size: 4.6, context: 8192 },
];

const embedModel = { model: 'qwen3-embedding:0.6b', size: 0.6 };

function option(name) {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? null : process.argv[index + 1];
}

// A 32 GB PC reports a little less than 32
function fits(have, need) {
	return have >= need * 0.9;
}

function detectGpu() {
	const vram = option('vram');
	if (vram !== null) return Number(vram) > 0 ? { name: 'graphics card', vram: Number(vram) } : null;

	try {
		const output = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
		const gpus = output.trim().split('\n').map(line => {
			const [name, mib] = line.split(',');
			return { name: name.trim(), vram: Number(mib) / 1024 };
		});
		return gpus.sort((a, b) => b.vram - a.vram)[0];
	} catch {}

	// Apple Silicon shares its memory between the processor and the graphics
	if (process.platform === 'darwin' && os.arch() === 'arm64') return { name: 'Apple Silicon', vram: (os.totalmem() / 1024 ** 3) * 0.7 };
	return null;
}

function recommend(gpu, ram) {
	if (gpu) {
		const tier = gpuTiers.find(tier => fits(gpu.vram, tier.vram) && fits(ram, tier.ram));
		if (tier) return tier;
	}
	return cpuTiers.find(tier => fits(ram, tier.ram)) ?? null;
}

function readEnv() {
	if (!fs.existsSync('.env')) fs.copyFileSync('example.env', '.env');
	return fs.readFileSync('.env', 'utf8');
}

function envValue(text, key) {
	return text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim() ?? '';
}

function writeEnv(text, values) {
	for (const [key, value] of Object.entries(values)) {
		const line = `${key}=${value}`;
		const pattern = new RegExp(`^${key}=.*$`, 'm');
		text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
	}
	fs.writeFileSync('.env', text);
}

const ram = Number(option('ram')) || os.totalmem() / 1024 ** 3;
const gpu = detectGpu();
const tier = recommend(gpu, ram);

console.log(`your pc: ${gpu ? `${gpu.name} with ${Math.round(gpu.vram)} GB video memory` : 'no graphics card found'}, ${Math.round(ram)} GB RAM`);
if (!gpu) console.log('a graphics card that isn\'t NVIDIA can be set by hand, e.g. node setup --vram 16');

if (!tier) {
	console.log('not enough memory for a local model: use the Claude API instead, see the README');
	process.exit(0);
}

const runsOn = gpu && gpuTiers.includes(tier) ? (gpu.vram >= tier.size + 2 ? 'graphics card' : 'graphics card and RAM') : 'processor, slower';
console.log(`\nrecommended:
chat model: ${tier.model}, ${tier.size} GB download, runs on the ${runsOn}
reads: ${tier.context / 1024}k tokens at once
memory search: ${embedModel.model}, ${embedModel.size} GB download`);

if (spawnSync('ollama', ['--version']).status !== 0) {
	console.log('\nollama is missing: install it from https://ollama.com/download and run this again');
	process.exit(1);
}

let answer = 'y';
if (!process.argv.includes('--yes')) {
	const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
	answer = (await prompt.question('\ndownload them and save them in .env? (y/n) ')).trim().toLowerCase();
	prompt.close();
}
if (answer !== 'y' && answer !== 'yes') process.exit(0);

const env = readEnv();
const hasKey = /^sk-ant-/.test(envValue(env, 'ANTHROPIC_API_KEY'));
const fallback = hasKey && envValue(env, 'BASE_MODEL').startsWith('claude-');

// With the API as the main model the memory search model stays, a new one would have to index everything again
const values = { [fallback ? 'LOCAL_MODEL' : 'BASE_MODEL']: tier.model, LOCAL_CONTEXT: tier.context };
if (!fallback) values.EMBED_MODEL = embedModel.model;

for (const model of [tier.model, values.EMBED_MODEL].filter(Boolean)) {
	if (spawnSync('ollama', ['pull', model], { stdio: 'inherit' }).status !== 0) {
		console.log(`could not download ${model}: check that ollama is running`);
		process.exit(1);
	}
}

writeEnv(env, values);
console.log(`\nsaved in .env: ${Object.entries(values).map(([key, value]) => `${key}=${value}`).join(', ')}`);
if (fallback) console.log('the Claude API stays the main model, the local one answers when ANTHROPIC_API_KEY is empty');
