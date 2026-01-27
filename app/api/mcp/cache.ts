/**
 * Simple in-memory caching utility for MCP Weather API
 * Provides caching for API responses with TTL support
 */

import type { CacheEntry, CacheStats } from "./types";

/**
 * Simple in-memory cache with TTL support
 * Suitable for Vercel Serverless functions
 */
class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private maxSize: number;
  private defaultTTL: number; // in seconds

  constructor(options: { maxSize?: number; defaultTTL?: number } = {}) {
    this.maxSize = options.maxSize ?? 100; // Max 100 entries
    this.defaultTTL = options.defaultTTL ?? 3600; // Default 1 hour
  }

  /**
   * Get value from cache if it exists and hasn't expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000; // Convert to seconds
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set value in cache with optional TTL
   */
  set(key: string, value: T, ttl: number = this.defaultTTL): void {
    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get hit rate percentage
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return (this.stats.hits / total) * 100;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, size: this.stats.size };
  }
}

/**
 * Cache key generator for geocoding requests
 */
export function generateGeocodeKey(place: string, count: number): string {
  return `geocode:${place.toLowerCase()}:${count}`;
}

/**
 * Cache key generator for forecast requests
 */
export function generateForecastKey(
  latitude: number,
  longitude: number,
  days: number,
  timezone: string
): string {
  return `forecast:${latitude}:${longitude}:${days}:${timezone}`;
}

/**
 * Global cache instance for geocoding results
 * TTL: 24 hours (86400 seconds)
 */
export const geocodeCache = new MemoryCache<any>({
  maxSize: 100,
  defaultTTL: 86400, // 24 hours
});

/**
 * Global cache instance for forecast results
 * TTL: 1 hour (3600 seconds) - weather changes frequently
 */
export const forecastCache = new MemoryCache<any>({
  maxSize: 200,
  defaultTTL: 3600, // 1 hour
});

/**
 * Cleanup expired cache entries (run periodically)
 */
export function cleanupCaches(): void {
  geocodeCache.cleanup();
  forecastCache.cleanup();
}

/**
 * Clear all caches (useful for debugging/testing)
 */
export function clearAllCaches(): void {
  geocodeCache.clear();
  forecastCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStatistics(): {
  geocode: CacheStats & { hitRate: number };
  forecast: CacheStats & { hitRate: number };
} {
  return {
    geocode: {
      ...geocodeCache.getStats(),
      hitRate: geocodeCache.getHitRate(),
    },
    forecast: {
      ...forecastCache.getStats(),
      hitRate: forecastCache.getHitRate(),
    },
  };
}
