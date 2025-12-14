const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss');
const validator = require('validator');

/**
 * Enhanced Security Middleware
 */

// Enhanced Helmet configuration with strict security headers
const helmetConfig = helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https:"],
			connectSrc: ["'self'"],
			fontSrc: ["'self'"],
			objectSrc: ["'none'"],
			mediaSrc: ["'self'"],
			frameSrc: ["'none'"],
		},
	},
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: { policy: "cross-origin" },
	crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
	frameguard: { action: 'deny' },
	hsts: {
		maxAge: 31536000,
		includeSubDomains: true,
		preload: true
	},
	noSniff: true,
	xssFilter: true,
	referrerPolicy: { policy: "strict-origin-when-cross-origin" },
	permittedCrossDomainPolicies: false,
});

// Rate limiting - Different tiers for different endpoints
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5, // 5 attempts per window
	message: 'Too many authentication attempts, please try again later.',
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true, // Don't count successful requests
	skipFailedRequests: false,
});

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // 100 requests per window
	message: 'Too many requests, please try again later.',
	standardHeaders: true,
	legacyHeaders: false,
});

const strictApiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 20, // 20 requests per window for sensitive operations
	message: 'Too many requests, please try again later.',
	standardHeaders: true,
	legacyHeaders: false,
});

// Slow down requests after exceeding rate limit
const speedLimiter = slowDown({
	windowMs: 15 * 60 * 1000, // 15 minutes
	delayAfter: 50, // Start delaying after 50 requests
	delayMs: (used, req) => {
		// Calculate delay based on how many requests over the limit
		const delayAfter = 50;
		return (used - delayAfter) * 500;
	},
	maxDelayMs: 20000, // Maximum delay of 20 seconds
	skipSuccessfulRequests: true,
});

// File upload rate limiter
const fileUploadLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 10, // 10 file uploads per hour
	message: 'Too many file uploads, please try again later.',
	standardHeaders: true,
	legacyHeaders: false,
});

// XSS Protection - Sanitize user input
const sanitizeInput = (req, res, next) => {
	// Sanitize query parameters
	if (req.query) {
		Object.keys(req.query).forEach(key => {
			if (typeof req.query[key] === 'string') {
				req.query[key] = xss(req.query[key], {
					whiteList: {},
					stripIgnoreTag: true,
					stripIgnoreTagBody: ['script']
				});
			}
		});
	}

	// Sanitize body parameters (except for specific fields that need HTML)
	if (req.body) {
		const sanitizeObject = (obj) => {
			Object.keys(obj).forEach(key => {
				if (typeof obj[key] === 'string') {
					// Skip sanitization for fields that might legitimately contain special characters
					// but sanitize potential XSS
					if (!['password', 'token', 'description', 'notes'].includes(key)) {
						obj[key] = validator.escape(obj[key]);
					}
				} else if (typeof obj[key] === 'object' && obj[key] !== null) {
					sanitizeObject(obj[key]);
				}
			});
		};
		sanitizeObject(req.body);
	}

	next();
};

// SQL Injection prevention - Additional validation
// Note: This is a secondary layer - primary protection is parameterized queries
const validateSQLInput = (req, res, next) => {
	// Only flag suspicious SQL injection patterns, not just SQL keywords in normal text
	// Patterns that indicate actual SQL injection attempts:
	const sqlInjectionPatterns = [
		/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\s+\w+.*(FROM|INTO|SET|WHERE))/gi, // SQL statement patterns
		/(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE))/gi, // Multiple statements
		/(--|\/\*|\*\/)/g, // SQL comments
		/(xp_|sp_|xp_cmdshell)/gi, // SQL Server extended procedures
		/(UNION\s+SELECT)/gi, // SQL injection UNION attacks
		/(OR\s+1\s*=\s*1|OR\s+'1'\s*=\s*'1')/gi, // Boolean-based SQL injection
	];

	const checkValue = (value) => {
		if (typeof value === 'string') {
			// Only check if string is suspiciously long (potential injection)
			// Or contains multiple SQL keywords together
			for (const pattern of sqlInjectionPatterns) {
				if (pattern.test(value)) {
					return false;
				}
			}
		}
		return true;
	};

	// Check query parameters
	if (req.query) {
		for (const key in req.query) {
			if (!checkValue(req.query[key])) {
				return res.status(400).json({ error: 'Invalid input detected' });
			}
		}
	}

	// Check body parameters
	if (req.body) {
		const checkObject = (obj) => {
			for (const key in obj) {
				if (typeof obj[key] === 'string' && !checkValue(obj[key])) {
					return false;
				} else if (typeof obj[key] === 'object' && obj[key] !== null) {
					if (!checkObject(obj[key])) {
						return false;
					}
				}
			}
			return true;
		};

		if (!checkObject(req.body)) {
			return res.status(400).json({ error: 'Invalid input detected' });
		}
	}

	next();
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
	return (req, res, next) => {
		const contentLength = req.get('content-length');
		if (contentLength) {
			const sizeInMB = parseInt(contentLength) / (1024 * 1024);
			const maxSizeInMB = parseFloat(maxSize);
			if (sizeInMB > maxSizeInMB) {
				return res.status(413).json({
					error: `Request entity too large. Maximum size is ${maxSize}`
				});
			}
		}
		next();
	};
};

// File upload security validation
const validateFileUpload = (req, res, next) => {
	if (!req.file) {
		return next();
	}

	// Check file size (10MB limit)
	const maxSize = 10 * 1024 * 1024; // 10MB
	if (req.file.size > maxSize) {
		return res.status(400).json({
			error: 'File size exceeds maximum limit of 10MB'
		});
	}

	// Additional file type validation
	const allowedMimeTypes = [
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-excel',
		'application/octet-stream'
	];

	const allowedExtensions = ['.xlsx', '.xls'];

	if (req.file.originalname) {
		const hasValidExtension = allowedExtensions.some(ext =>
			req.file.originalname.toLowerCase().endsWith(ext)
		);

		if (!hasValidExtension && !allowedMimeTypes.includes(req.file.mimetype)) {
			return res.status(400).json({
				error: 'Invalid file type. Only Excel files are allowed.'
			});
		}
	}

	next();
};

module.exports = {
	helmetConfig,
	authLimiter,
	apiLimiter,
	strictApiLimiter,
	speedLimiter,
	fileUploadLimiter,
	sanitizeInput,
	validateSQLInput,
	requestSizeLimiter,
	validateFileUpload,
};

