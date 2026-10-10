/**
 * Every setting the backend reads from the environment, in one place.
 *
 * Values come from the process environment, or from `.env` when started with
 * `pnpm dev` / `pnpm start` (both pass `--env-file-if-exists=.env`).
 */

function optional(name: string, fallback: string): string {
	const value = process.env[name];
	return value === undefined || value === "" ? fallback : value;
}

// pi-ai's Google provider only looks for GEMINI_API_KEY. Accept GOOGLE_API_KEY too.
// It is moved rather than copied: with both set, the Google SDK prints a warning on every request.
if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_API_KEY) {
	process.env.GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
	delete process.env.GOOGLE_API_KEY;
}

export const config = {
	port: Number(optional("PORT", "8787")),

	/** The model every new conversation runs with. */
	model: { provider: "google", modelId: "gemini-3.7-flash" },

	/** SQLite file holding every conversation, entry and task (pi-durable storage). */
	databaseFile: optional("PI_DATABASE_FILE", "./data/pi.sqlite"),

	/** JSONL file listing the conversations shown in the chat sidebar. */
	conversationsFile: optional("PI_CONVERSATIONS_FILE", "./data/conversations.jsonl"),

	/** Origin of the frontend allowed to call this API from the browser. Empty: any localhost origin (development). */
	frontendOrigin: optional("FRONTEND_ORIGIN", ""),
};
