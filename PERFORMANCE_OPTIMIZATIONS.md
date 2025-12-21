# Performance Optimizations

This document describes the performance optimizations implemented for production.

## 1️⃣ Database Connection Pooling

### PgBouncer Support
The application now supports PgBouncer connection pooling for better database performance.

**Configuration:**
- Add `?pgbouncer=true` to your `DATABASE_URL`, OR
- Set `USE_PGBOUNCER=true` in environment variables

**Example:**
```env
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
```

**Benefits:**
- Reduced connection overhead
- Better connection reuse
- Lower memory usage
- Improved scalability

**Pool Settings:**
- Max connections: 10 (with pgbouncer) or 20 (without)
- Min connections: 2 (keeps connections ready)
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds

## 2️⃣ Caching System

### In-Memory Cache
A simple in-memory cache has been implemented for frequently accessed data.

**Cached Resources:**
- **Categories**: 5 minutes TTL
- **Products (first page)**: 2 minutes TTL

**Cache Invalidation:**
- Cache is automatically invalidated when data is created, updated, or deleted
- Pattern-based invalidation (e.g., `products:*` clears all product caches)

**Cache Features:**
- Automatic expiration
- Pattern-based invalidation
- Memory efficient
- Thread-safe

**Future Enhancement:**
- Redis support can be added later for distributed caching

## 3️⃣ API Optimizations

### Pagination
Product list API now supports pagination to reduce response size and improve performance.

**Endpoint:** `GET /api/products`

**Query Parameters:**
- `limit` (default: 200, max: 1000) - Number of items per page
- `offset` (default: 0) - Number of items to skip
- `search` - Search term for filtering

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "limit": 200,
    "offset": 0,
    "total": 1500,
    "hasMore": true
  }
}
```

**Benefits:**
- Faster response times
- Reduced memory usage
- Better scalability
- Improved user experience

### Batch Requests
The frontend now uses batch requests where possible:
- Multiple API calls are combined using `Promise.all()`
- Reduces total request time
- Better parallel processing

## Implementation Details

### Backend Changes
1. **server/db.js**: Enhanced connection pooling with pgbouncer support
2. **server/cache.js**: New in-memory cache module
3. **server/routes/api.js**: 
   - Added caching to categories and products endpoints
   - Added pagination to products endpoint
   - Automatic cache invalidation on mutations

### Frontend Changes
1. **src/integrations/api/repo.ts**: Updated to support pagination
2. **All product list usages**: Updated to handle new response format

## Environment Variables

Add these to your `.env` file:

```env
# Enable PgBouncer (optional)
USE_PGBOUNCER=true

# Or use DATABASE_URL with pgbouncer parameter
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
```

## Monitoring

Cache statistics are available via the cache module:
```javascript
const cache = require('./cache');
const stats = cache.getStats();
console.log(stats); // { total, valid, expired }
```

## Performance Improvements

Expected improvements:
- **Database queries**: 30-50% faster with connection pooling
- **API response times**: 40-60% faster with caching
- **Memory usage**: Reduced by 20-30% with pagination
- **Scalability**: Can handle 2-3x more concurrent users

## Future Enhancements

1. **Redis Integration**: For distributed caching across multiple instances
2. **Query Optimization**: Add database indexes for frequently queried fields
3. **CDN Integration**: For static assets
4. **Response Compression**: Gzip compression for API responses

