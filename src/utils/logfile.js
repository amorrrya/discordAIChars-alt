import fs from 'fs';
import { format } from 'util';

const logFile = 'bot.log';
const maxSize = 5 * 1024 * 1024;

function append(level, args) {
	try {
		if (fs.existsSync(logFile) && fs.statSync(logFile).size > maxSize) {
			fs.renameSync(logFile, `${logFile}.old`);
		}
		const text = format(...args).replace(/\u001b\[[0-9;]*m/g, '');
		fs.appendFileSync(logFile, `${new Date().toISOString()} ${level} ${text}\n`);
	} catch {}
}

for (const level of ['log', 'error']) {
	const original = console[level].bind(console);
	console[level] = (...args) => {
		original(...args);
		append(level, args);
	};
}
