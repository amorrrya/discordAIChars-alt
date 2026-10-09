// File extensions from links can lie, so the type comes from the first bytes
export function detectImageType(buffer) {
	if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
	if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
	if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
	if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
	return null;
}
