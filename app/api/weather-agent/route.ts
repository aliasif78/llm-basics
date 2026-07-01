// app/api/weather-agent/route.ts
import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, APICallError, toUIMessageStream, tool, type UIMessage, type UIMessageChunk, isStepCount } from 'ai';
import { z } from 'zod';

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// WMO weather code → human description
// Open-Meteo uses the WMO weather interpretation codes standard.
// We decode these server-side so the model gets plain English, not a number.
// ---------------------------------------------------------------------------
const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Moderate showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

function wmoDescription(code: number): string {
  return WMO[code] ?? 'Unknown conditions';
}

// ---------------------------------------------------------------------------
// European AQI category labels
// Scale: 0–20 Good, 20–40 Fair, 40–60 Moderate, 60–80 Poor,
//        80–100 Very Poor, >100 Extremely Poor
// ---------------------------------------------------------------------------
function aqiCategory(aqi: number): string {
  if (aqi <= 20) return 'Good';
  if (aqi <= 40) return 'Fair';
  if (aqi <= 60) return 'Moderate';
  if (aqi <= 80) return 'Poor';
  if (aqi <= 100) return 'Very Poor';
  return 'Extremely Poor';
}

// ---------------------------------------------------------------------------
// Error description
// ---------------------------------------------------------------------------
function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return 'Rate limit hit — wait a moment and try again.';
    if (error.statusCode !== undefined && error.statusCode >= 500) return 'The model provider is temporarily unavailable. Try again shortly.';
    if (error.statusCode === 400) return 'The request was rejected by the model provider.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong generating a response. Please try again.';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  // Capture the client IP here so the get_user_location tool can close over it.
  //
  // In local dev: x-forwarded-for is absent or 127.0.0.1, so ipapi.co will
  // return the server machine's location, not the actual user's. This is
  // expected behaviour — server-side IP resolution only works correctly with
  // the real forwarded IP, which Vercel populates in production.
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? '';

  console.log('[weather-agent] POST received', {
    messageCount: messages.length,
    lastUserMessage: messages.filter((m) => m.role === 'user').at(-1)?.parts,
    clientIp: clientIp || '(unknown — local dev)',
  });

  // ---------------------------------------------------------------------------
  // Tool definitions
  // All five are defined inside the handler so the location tool can
  // close over `clientIp` without adding it to every tool's parameters
  // (which would be wrong — it's a server-side concern, not a model concern).
  // ---------------------------------------------------------------------------
  const tools = {
    // ── 1. Detect user location from IP ──────────────────────────────────────
    // No parameters. The model calls this when the user says "here", "near me",
    // "my location", or anything that implies current position without naming a city.
    get_user_location: tool({
      description: "Detect the user's approximate location from their IP address. " + "Use when the user refers to 'here', 'my location', 'where I am', " + 'or any implicit current location without naming a specific city.',
      inputSchema: z.object({}),
      execute: async () => {
        console.log('[weather-agent] tool:get_user_location → calling ipapi.co', { clientIp: clientIp || '(self-lookup)' });

        const url = clientIp ? `https://ipapi.co/${clientIp}/json/` : 'https://ipapi.co/json/';
        const res = await fetch(url, { headers: { 'User-Agent': 'WeatherAgent/1.0' } });

        if (!res.ok) {
          console.error('[weather-agent] tool:get_user_location → ipapi.co error', { status: res.status });
          throw new Error(`Location lookup failed with status ${res.status}`);
        }

        const data = (await res.json()) as {
          error?: boolean;
          reason?: string;
          city: string;
          region: string;
          country_name: string;
          latitude: number;
          longitude: number;
          timezone: string;
        };

        if (data.error) {
          console.error('[weather-agent] tool:get_user_location → ipapi.co returned error', { reason: data.reason });
          throw new Error(data.reason ?? 'Location lookup returned an error');
        }

        const result = {
          city: data.city,
          region: data.region,
          country: data.country_name,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone,
        };

        console.log('[weather-agent] tool:get_user_location ✓', result);
        return result;
      },
    }),

    // ── 2. Geocode a city name → coordinates ─────────────────────────────────
    // Required before any weather/air-quality tool when the user names a city.
    // The model must call this first, then pass the returned lat/lng to other tools.
    geocode_city: tool({
      description: 'Convert a city name to geographic coordinates (latitude and longitude). ' + 'Call this before get_current_weather, get_forecast, or get_air_quality ' + 'whenever the user provides a city name rather than coordinates.',
      inputSchema: z.object({
        city: z.string().describe("The city name to look up, e.g. 'Tokyo' or 'London, UK' or 'São Paulo'"),
      }),
      execute: async ({ city }) => {
        console.log('[weather-agent] tool:geocode_city → calling open-meteo geocoding', { city });

        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const res = await fetch(url);

        if (!res.ok) {
          console.error('[weather-agent] tool:geocode_city → geocoding error', { city, status: res.status });
          throw new Error(`Geocoding failed with status ${res.status}`);
        }

        const data = (await res.json()) as {
          results?: Array<{
            name: string;
            country: string;
            latitude: number;
            longitude: number;
            timezone: string;
          }>;
        };

        if (!data.results?.length) {
          console.warn('[weather-agent] tool:geocode_city → no results', { city });
          throw new Error(`Could not find geographic coordinates for "${city}". Try a more specific name.`);
        }

        const r = data.results[0];
        const result = {
          city: r.name,
          country: r.country,
          latitude: r.latitude,
          longitude: r.longitude,
          timezone: r.timezone,
        };

        console.log('[weather-agent] tool:geocode_city ✓', result);
        return result;
      },
    }),

    // ── 3. Current weather conditions ─────────────────────────────────────────
    // Requires lat/lng — the model must have obtained these from get_user_location
    // or geocode_city first. Demonstrates sequential dependency.
    get_current_weather: tool({
      description: 'Get current weather conditions for a location. ' + 'Requires latitude and longitude — call geocode_city or get_user_location first ' + "if you don't already have coordinates.",
      inputSchema: z.object({
        latitude: z.number().describe('Latitude of the location'),
        longitude: z.number().describe('Longitude of the location'),
        units: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit to use in the response'),
      }),
      execute: async ({ latitude, longitude, units }) => {
        console.log('[weather-agent] tool:get_current_weather → calling open-meteo', { latitude, longitude, units });

        const tempUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const url = [`https://api.open-meteo.com/v1/forecast`, `?latitude=${latitude}&longitude=${longitude}`, `&current=temperature_2m,apparent_temperature,relative_humidity_2m,`, `weather_code,wind_speed_10m,precipitation`, `&temperature_unit=${tempUnit}`, `&wind_speed_unit=kmh`, `&timezone=auto`].join('');

        const res = await fetch(url);

        if (!res.ok) {
          console.error('[weather-agent] tool:get_current_weather → open-meteo error', { status: res.status });
          throw new Error(`Weather fetch failed with status ${res.status}`);
        }

        const data = (await res.json()) as {
          current: {
            temperature_2m: number;
            apparent_temperature: number;
            relative_humidity_2m: number;
            weather_code: number;
            wind_speed_10m: number;
            precipitation: number;
          };
        };

        const c = data.current;
        const result = {
          temperature: c.temperature_2m,
          feels_like: c.apparent_temperature,
          humidity: c.relative_humidity_2m,
          wind_speed_kmh: c.wind_speed_10m,
          precipitation_mm: c.precipitation,
          description: wmoDescription(c.weather_code),
          unit: tempUnit === 'celsius' ? '°C' : '°F',
        };

        console.log('[weather-agent] tool:get_current_weather ✓', result);
        return result;
      },
    }),

    // ── 4. Multi-day forecast ─────────────────────────────────────────────────
    // Fetches 1–7 days of daily high/low, conditions, and precipitation.
    // Can be called in parallel with get_air_quality once coordinates are known.
    get_forecast: tool({
      description: 'Get a multi-day weather forecast for a location. ' + 'Returns daily high/low temperatures, conditions, and precipitation. ' + 'Requires latitude and longitude.',
      inputSchema: z.object({
        latitude: z.number().describe('Latitude of the location'),
        longitude: z.number().describe('Longitude of the location'),
        days: z.number().int().min(1).max(7).default(5).describe('Number of forecast days to return (1–7)'),
        units: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit'),
      }),
      execute: async ({ latitude, longitude, days, units }) => {
        console.log('[weather-agent] tool:get_forecast → calling open-meteo', { latitude, longitude, days, units });

        const tempUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const url = [`https://api.open-meteo.com/v1/forecast`, `?latitude=${latitude}&longitude=${longitude}`, `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum`, `&temperature_unit=${tempUnit}`, `&timezone=auto`, `&forecast_days=${days}`].join('');

        const res = await fetch(url);

        if (!res.ok) {
          console.error('[weather-agent] tool:get_forecast → open-meteo error', { status: res.status });
          throw new Error(`Forecast fetch failed with status ${res.status}`);
        }

        const data = (await res.json()) as {
          daily: {
            time: string[];
            temperature_2m_max: number[];
            temperature_2m_min: number[];
            weather_code: number[];
            precipitation_sum: number[];
          };
        };

        const d = data.daily;
        const unit = tempUnit === 'celsius' ? '°C' : '°F';
        const result = {
          unit,
          days: d.time.map((date, i) => ({
            date,
            max: d.temperature_2m_max[i],
            min: d.temperature_2m_min[i],
            description: wmoDescription(d.weather_code[i]),
            precipitation_mm: d.precipitation_sum[i],
          })),
        };

        console.log('[weather-agent] tool:get_forecast ✓', {
          unit,
          dayCount: result.days.length,
          firstDay: result.days[0],
        });
        return result;
      },
    }),

    // ── 5. Air quality ────────────────────────────────────────────────────────
    // PM2.5, PM10, European AQI. Designed to be called in parallel with
    // get_current_weather or get_forecast once coordinates are resolved.
    get_air_quality: tool({
      description: 'Get current air quality data for a location: PM2.5, PM10, and the ' + 'European Air Quality Index (AQI) with a category label. ' + 'Requires latitude and longitude.',
      inputSchema: z.object({
        latitude: z.number().describe('Latitude of the location'),
        longitude: z.number().describe('Longitude of the location'),
      }),
      execute: async ({ latitude, longitude }) => {
        console.log('[weather-agent] tool:get_air_quality → calling open-meteo air quality', { latitude, longitude });

        const url = [`https://air-quality-api.open-meteo.com/v1/air-quality`, `?latitude=${latitude}&longitude=${longitude}`, `&current=pm10,pm2_5,european_aqi`, `&timezone=auto`].join('');

        const res = await fetch(url);

        if (!res.ok) {
          console.error('[weather-agent] tool:get_air_quality → open-meteo error', { status: res.status });
          throw new Error(`Air quality fetch failed with status ${res.status}`);
        }

        const data = (await res.json()) as {
          current: {
            pm2_5: number;
            pm10: number;
            european_aqi: number;
          };
        };

        const c = data.current;
        const result = {
          pm2_5: c.pm2_5,
          pm10: c.pm10,
          european_aqi: c.european_aqi,
          category: aqiCategory(c.european_aqi),
        };

        console.log('[weather-agent] tool:get_air_quality ✓', result);
        return result;
      },
    }),
  };

  // ---------------------------------------------------------------------------
  // System prompt
  // The coordination rules for parallel calling are explicit because the model
  // will not spontaneously call tools in parallel unless instructed to.
  // ---------------------------------------------------------------------------
  const systemPrompt = `You are a weather assistant with access to 5 tools.

Tool usage rules:
1. If the user asks about "here", "my location", or anything implying their current position: call get_user_location first, then the relevant weather tools.
2. If the user names a city: call geocode_city first to get coordinates, then the relevant weather tools.
3. If the user provides explicit coordinates: skip location resolution and call weather tools directly.
4. After obtaining coordinates, if the user asks for multiple data types (e.g. current weather AND forecast, or weather AND air quality): call those tools IN PARALLEL in the same step — do not make them wait for each other.
5. Be concise in your final response. Summarise the data clearly; do not dump raw numbers at the user.`;

  // ---------------------------------------------------------------------------
  // Stream assembly
  // Same pattern as the chat-bot route: pipe the streamText output through
  // toUIMessageStream and forward chunks via createUIMessageStream.
  // onError converts any thrown error into a user-visible string.
  //
  // Note: no pre-flight token estimate here. This route's complexity is in
  // tool orchestration, not in context management.
  // ---------------------------------------------------------------------------
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      console.log('[weather-agent] stream execute start');

      const result = streamText({
        model: google('gemini-2.5-flash-lite'),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: isStepCount(5),
      });

      const reader = toUIMessageStream({ stream: result.stream }).getReader();
      let chunkCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        writer.write(value as UIMessageChunk);
        chunkCount++;
      }

      console.log('[weather-agent] stream execute complete', { chunkCount });
    },
    onError: (error) => {
      console.error('[weather-agent] stream error', {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        ...(APICallError.isInstance(error) && { statusCode: error.statusCode }),
      });
      return describeError(error);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
