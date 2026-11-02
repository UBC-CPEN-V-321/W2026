export const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
// Outfit generation waits for the weather, so give up quickly rather than keep the user waiting.
export const WEATHER_REQUEST_TIMEOUT_MS = 5_000;

export const OUTFIT_MODEL = 'claude-sonnet-5-5';
// Generation takes a few seconds, so a request still running after this is treated as unavailable.
export const OUTFIT_REQUEST_TIMEOUT_MS = 30_000;
export const OUTFIT_MAX_RETRIES = 2;
// Far more than an outfit's name and item ids need, so the reply is never cut off.
export const OUTFIT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_OUTFIT_NAME = 'Daily outfit';

// Room update latency NFR (Requirements_and_Design.md section 3.7), checked by tests/nfr/.
export const ROOM_UPDATE_LATENCY_LIMIT_MS = 1_000;
export const ROOM_UPDATES_ON_TIME_SHARE = 0.95;

// Allowed range of each avatar measurement, in metres.
export const HEIGHT_RANGE = { min: 1.0, max: 3.0 };
export const SHOULDER_WIDTH_RANGE = { min: 0.25, max: 0.6 };
export const CHEST_WIDTH_RANGE = { min: 0.1, max: 1.0 };
export const WAIST_WIDTH_RANGE = { min: 0.1, max: 2.0 };
export const HIP_WIDTH_RANGE = { min: 0.1, max: 1.5 };
