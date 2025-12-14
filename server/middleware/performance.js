const compression = require('compression');

/**
 * Performance Optimization Middleware
 */

// Compression middleware with optimized settings
const compressionConfig = compression({
	level: 6, // Compression level (1-9, 6 is a good balance)
	filter: (req, res) => {
		// Don't compress if client doesn't support it
		if (req.headers['x-no-compression']) {
			return false;
		}

		// Use compression for all text-based content
		return compression.filter(req, res);
	},
	threshold: 1024, // Only compress responses larger than 1KB
});

// Cache control headers for static and dynamic content
const cacheControl = (req, res, next) => {
	// Don't cache API responses by default
	if (req.path.startsWith('/api')) {
		res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		return next();
	}

	// For static assets, allow caching
	if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
		res.set('Cache-Control', 'public, max-age=31536000, immutable');
		return next();
	}

	next();
};

// Response time logging (only in development)
const responseTimeLogger = (req, res, next) => {
	if (process.env.NODE_ENV === 'development') {
		const start = Date.now();
		
		res.on('finish', () => {
			const duration = Date.now() - start;
			const logLevel = duration > 1000 ? '⚠️' : '✓';
			console.log(`${logLevel} ${req.method} ${req.path} - ${duration}ms`);
		});
	}
	
	next();
};

// Connection keep-alive optimization
const keepAlive = (req, res, next) => {
	res.set('Connection', 'keep-alive');
	next();
};

module.exports = {
	compressionConfig,
	cacheControl,
	responseTimeLogger,
	keepAlive,
};

