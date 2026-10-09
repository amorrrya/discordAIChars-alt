// Messages are grouped into blocks by id, so finished blocks never change and stay cached
export const CHUNK = 10;

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const clockFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatDay(time) {
	return dayFormat.format(new Date(time));
}

export function formatShortDay(time) {
	return shortDayFormat.format(new Date(time));
}

export function formatClock(time) {
	return clockFormat.format(new Date(time));
}

export function partOfDay(time) {
	const hour = new Date(time).getHours();
	if (hour < 5) return 'middle of the night';
	if (hour < 12) return 'morning';
	if (hour < 17) return 'afternoon';
	if (hour < 22) return 'evening';
	return 'night';
}

export function timeAgo(time, now = Date.now()) {
	const minutes = Math.round((now - time) / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.round(hours / 24);
	return `${days} days ago`;
}

export function estimateTokens(text) {
	return Math.ceil(text.length / 3.5);
}

export function renderLine(row) {
	let line = `[${formatClock(row.time)}] #${row.id} ${row.speaker}`;
	if (row.reply) line += ` (replying to ${row.reply})`;
	line += ':';
	if (row.text) line += ` ${row.text}`;
	if (row.pictures) line += ` [picture: ${row.pictures}]`;
	return line;
}

export function renderLines(rows, previousTime = null) {
	const lines = [];
	let lastDay = previousTime === null ? null : formatDay(previousTime);
	for (const row of rows) {
		const day = formatDay(row.time);
		if (day !== lastDay) {
			lines.push(`--- ${day} ---`);
			lastDay = day;
		}
		lines.push(renderLine(row));
	}
	return lines;
}

export function chunkTranscript(rows, previousTime = null) {
	const chunks = [];
	let current = null;
	let lastTime = previousTime;

	for (const row of rows) {
		const key = Math.floor(row.id / CHUNK);
		if (!current || current.key !== key) {
			current = { key, rows: [], previousTime: lastTime };
			chunks.push(current);
		}
		current.rows.push(row);
		lastTime = row.time;
	}

	return chunks.map(chunk => renderLines(chunk.rows, chunk.previousTime).join('\n'));
}
