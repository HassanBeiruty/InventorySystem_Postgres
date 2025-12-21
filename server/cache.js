/**
 * Simple in-memory cache for frequently accessed data
 * Cache expires after TTL (Time To Live) to ensure data freshness
 */

class SimpleCache {
	constructor() {
		this.cache = new Map();
		this.defaultTTL = 5 * 60 * 1000; // 5 minutes default
	}

	/**
	 * Get value from cache
	 * @param {string} key - Cache key
	 * @returns {any|null} - Cached value or null if expired/not found
	 */
	get(key) {
		const item = this.cache.get(key);
		if (!item) return null;

		// Check if expired
		if (Date.now() > item.expiresAt) {
			this.cache.delete(key);
			return null;
		}

		return item.value;
	}

	/**
	 * Set value in cache
	 * @param {string} key - Cache key
	 * @param {any} value - Value to cache
	 * @param {number} ttl - Time to live in milliseconds (optional)
	 */
	set(key, value, ttl = null) {
		const expiresAt = Date.now() + (ttl || this.defaultTTL);
		this.cache.set(key, { value, expiresAt });
	}

	/**
	 * Delete value from cache
	 * @param {string} key - Cache key
	 */
	delete(key) {
		this.cache.delete(key);
	}

	/**
	 * Clear all cache
	 */
	clear() {
		this.cache.clear();
	}

	/**
	 * Invalidate cache by pattern (e.g., 'products:*')
	 * @param {string} pattern - Pattern to match keys
	 */
	invalidate(pattern) {
		const regex = new RegExp(pattern.replace('*', '.*'));
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats() {
		const now = Date.now();
		let valid = 0;
		let expired = 0;

		for (const item of this.cache.values()) {
			if (Date.now() > item.expiresAt) {
				expired++;
			} else {
				valid++;
			}
		}

		return {
			total: this.cache.size,
			valid,
			expired,
		};
	}

	/**
	 * Clean up expired entries
	 */
	cleanup() {
		const now = Date.now();
		for (const [key, item] of this.cache.entries()) {
			if (now > item.expiresAt) {
				this.cache.delete(key);
			}
		}
	}
}

// Create singleton instance
const cache = new SimpleCache();

// Cleanup expired entries every minute
setInterval(() => {
	cache.cleanup();
}, 60 * 1000);

module.exports = cache;

