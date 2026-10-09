import { addModel, getModel } from "./db.js";
import { saveImage } from "./utils/imagesave.js";

const { PREFIX } = process.env;

export let pendingMessages = [];

export function addPendingMessage(message) {
	pendingMessages.push(message);
}

function clearPendingMessages(userId) {
	pendingMessages = pendingMessages.filter(m => m.user !== userId);
}

export function hasPendingMessage(userId) {
	return pendingMessages.some(m => m.user === userId);
}

async function pendingEnterName({ pendingMessage, content }) {
	if (content.length < 3 || content.length > 64) return 'the name takes 3 to 64 characters';

	if (content.toLowerCase() === 'random') return `random is taken by ${PREFIX}ask random, pick another name`;

	// Webhook names cannot contain "Discord"
	content = content.replace(/Discord/gi, 'Disc0rd');

	if (await getModel(content)) return 'that name is taken, pick another';

	pendingMessage.data.displayName = content;
	pendingMessage.data.idName = content.replace(/\s/g, '');
	let addedInfo = '';
	if (content.includes(' ')) {
		addedInfo += `\nshown as "${pendingMessage.data.displayName}", written as "${pendingMessage.data.idName}" in commands`;
	}
	pendingMessage.state = 'enter_avatar';
	return 'avatar: attach an image' + addedInfo;
}

async function pendingEnterAvatar({ pendingMessage, attachments }) {
	// Check if valid URL
	if (attachments.size === 0) return 'attach an image';

	// Check if png, jpg, jpeg or webp
	const attachment = attachments.first();
	const validExtensions = ['png', 'jpg', 'jpeg', 'webp'];
	const extension = attachment.name.split('.').pop().toLowerCase();
	if (!validExtensions.includes(extension)) return 'the avatar takes a PNG, JPG or WEBP image';

	pendingMessage.data.attachment = attachment;
	pendingMessage.state = 'enter_prompt';
	return 'prompt: who the character is and how they talk, 32 characters or more';
}

async function pendingEnterPrompt({ pendingMessage, content, authorId }) {
	if (content.length < 32) return 'the prompt takes 32 characters or more';

	pendingMessage.data.prompt = content;

	const { displayName, idName, attachment, prompt } = pendingMessage.data;

	const lowerIdName = idName.toLowerCase();

	// Save avatar to disk
	const avatarPath = await saveImage(attachment.url, lowerIdName, 'avatars');

	// Save model to database
	addModel(idName, displayName, prompt, authorId, avatarPath);
	
	clearPendingMessages(authorId);

	return `${pendingMessage.data.displayName} created, ${PREFIX}join ${lowerIdName} adds them to the chat`;
}

const stateCallbacks = {
	enter_name: pendingEnterName,
	enter_avatar: pendingEnterAvatar,
	enter_prompt: pendingEnterPrompt,
};

export async function processPendingMessages(message) {
	const { content, attachments, author } = message;
	const authorId = author.id;
	const pendingMessage = pendingMessages.find(m => m.user === authorId);

	if (content === 'cancel') {
		clearPendingMessages(authorId);
		return 'cancelled'
	}

	if (!pendingMessage) return;

	const callback = stateCallbacks[pendingMessage.state];
	if (!callback) return `creating broke, start again with ${PREFIX}create`

	const response = await callback({ pendingMessage, content, authorId, message, attachments });
	return response;
}
