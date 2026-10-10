/**
 * Pi, the assistant, as one pi-durable extension: its system prompt and its tools.
 */
import { defineExtension, section } from "@earendil-works/pi-durable";
import { allTools } from "./tools.ts";

/**
 * Pi's system prompt: fixed rules, identical for every conversation.
 *
 * pi-durable only sends a part again when its text changes, so keeping this text
 * static lets the provider cache it.
 */
export const PI_INSTRUCTIONS = `You are Pi, a friendly and concise assistant.

When the user asks about the weather, call the get_weather tool with the city name and
report the result in plain language. Never invent weather data.
Answer in the language the user writes in.`;

export const Pi = defineExtension({
	name: "pi",
	tools: allTools,
	sections: [section("pi", () => PI_INSTRUCTIONS, { tag: false })],
});
