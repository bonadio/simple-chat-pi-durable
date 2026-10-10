/**
 * The tools Pi can call. To give Pi a new ability, define a tool here and add it to `allTools`.
 *
 * Tools that only read are marked `replay: "safe"`: if the process dies while one is
 * running, pi-durable simply runs it again. Tools with side effects keep the default,
 * so after a crash the model is told the call was interrupted instead of repeating it.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolExecutionResult } from "@earendil-works/pi-durable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A successful result: the value as JSON text for the model. */
function ok(value: object): ToolExecutionResult {
	return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** A failed result: the model sees the message and decides what to tell the user. */
function failed(message: string): ToolExecutionResult {
	return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
}

async function fetchJson(url: string): Promise<any> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${new URL(url).host} answered ${response.status}`);
	}
	return response.json();
}

// ---------------------------------------------------------------------------
// get_weather
// ---------------------------------------------------------------------------

/** WMO weather interpretation codes, as returned by Open-Meteo. */
const WEATHER_CODES: Record<number, string> = {
	0: "clear sky",
	1: "mainly clear",
	2: "partly cloudy",
	3: "overcast",
	45: "fog",
	48: "rime fog",
	51: "light drizzle",
	53: "drizzle",
	55: "heavy drizzle",
	61: "light rain",
	63: "rain",
	65: "heavy rain",
	71: "light snow",
	73: "snow",
	75: "heavy snow",
	80: "rain showers",
	81: "heavy rain showers",
	82: "violent rain showers",
	95: "thunderstorm",
};

export const getWeather = defineTool({
	name: "get_weather",
	description: "Get the current weather in a city.",
	parameters: Type.Object({
		city: Type.String({ description: "City name, for example 'Lisbon' or 'São Paulo'." }),
	}),
	replay: "safe",
	execute: async (args) => {
		const geocoding = await fetchJson(
			`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(args.city)}`,
		);
		const place = geocoding.results?.[0];
		if (place === undefined) {
			return failed(`City '${args.city}' not found.`);
		}

		const forecast = await fetchJson(
			`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
				"&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
		);
		const current = forecast.current;

		return ok({
			city: place.name,
			country: place.country,
			conditions: WEATHER_CODES[current.weather_code] ?? "unknown",
			temperatureC: current.temperature_2m,
			feelsLikeC: current.apparent_temperature,
			humidityPercent: current.relative_humidity_2m,
			windKmh: current.wind_speed_10m,
		});
	},
});

export const allTools = [getWeather];
