/**
 * Type definitions for MCP Weather API
 */

// ============================================================================
// Geocoding Types
// ============================================================================

/**
 * Geocoding candidate from Open-Meteo API
 */
export interface GeoCandidate {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

/**
 * Geocoding search result
 */
export interface GeocodingResult {
  kind: "geocode";
  query: string;
  days: number;
  candidates: GeoCandidate[];
}

/**
 * Geocoding tool input
 */
export interface GeocodePlaceInput {
  place: string;
  count?: number;
  days?: number;
}

// ============================================================================
// Forecast Types
// ============================================================================

/**
 * Current weather data
 */
export interface CurrentWeather {
  temperature_c: number;
  windspeed: number;
  winddirection?: number;
  is_day?: boolean;
  time?: string;
}

/**
 * Daily forecast data point
 */
export interface DailyForecast {
  date: string;
  weathercode: number;
  summary_ja: string;
  temp_max_c: number;
  temp_min_c: number;
  precip_prob_max_percent: number;
}

/**
 * Location information
 */
export interface Location {
  latitude: number;
  longitude: number;
  timezone: string;
  label?: string;
}

/**
 * Forecast result
 */
export interface ForecastResult {
  kind: "forecast";
  location: Location;
  current: CurrentWeather | null;
  daily: DailyForecast[];
  source: string;
}

/**
 * Forecast tool input
 */
export interface GetForecastInput {
  latitude: number;
  longitude: number;
  days?: number;
  timezone?: string;
  label?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Open-Meteo Geocoding API response
 */
export interface OpenMeteoGeocodingResponse {
  results?: Array<{
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }>;
}

/**
 * Open-Meteo Forecast API response
 */
export interface OpenMeteoForecastResponse {
  current_weather?: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    is_day: boolean;
    time: string;
  };
  daily?: {
    time?: string[];
    weathercode?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

// ============================================================================
// MCP Response Types
// ============================================================================

/**
 * MCP tool content item
 */
export interface ToolContent {
  type: "text";
  text: string;
}

/**
 * MCP tool response
 */
export interface ToolResponse {
  content: ToolContent[];
  structuredContent: GeocodingResult | ForecastResult;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable?: boolean
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in seconds
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}
