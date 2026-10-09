import ollama from "ollama";
import { registerCommand } from "../registrar.js";

/**
 * Stop the current generation
 * @returns {string} - The response message
 * @example !stop
 */
function cmdStop() {
	ollama.abort();
	return 'local model reply stopped';
}

registerCommand('stop', cmdStop, 'Interact', 'stops a local model reply');
