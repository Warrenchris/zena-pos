# RBAC Permission Caching Implementation

## Overview
This document describes the implementation of RBAC (Role-Based Access Control) permission caching to reduce database queries and improve system performance.

## Implementation Summary

### 1. Permission Cache Service (`backend/src/services/permissionCache.js`)
A comprehensive in-memory caching service that:
- **Caches role-permission mappings** to avoid repeated database queries
- **Caches user-specific permissions** for faster lookups
- **Implements TTL (Time To Live)** with configurable expiration (default: 1 hour)
- **Prevents memory issues** with a maximum cache size limit (1000 entries)
- **Provides automatic cache invalidation** when permissions change

#### Key Features:
- **Cache Hit/Miss Tracking**: Logs cache hits and misses for monitoring
- **Automatic Expiration**: Cache entries expire after TTL period
- **Memory Management**: FIFO eviction when cache reaches max size
- **Cache Statistics**: Provides cache stats for monitoring

#### Configuration:
- `PERMISSION_CACHE_TTL`: Cache TTL in milliseconds (default: 3600000 = 1 hour)
- Maximum cache size: 1000 entries per cache type

### 2. User Model Updates (`backend/src/models/User.js`)
Updated the User model to:
- **Use cached permissions** in `hasPermission()` method
- **Use cached permissions** in `getPermissions()` method
- **Invalidate cache** when user role changes
- **Invalidate cache** when user is updated or deleted

#### Changes:
- Removed duplicate `validatePassword` method
- Replaced direct database queries with cache service calls
- Added cache invalidation hooks for role changes

### 3. RolePermission Model Updates (`backend/src/models/RolePermission.js`)
Added cache invalidation hooks that:
- **Invalidate role cache** when permissions are assigned/removed
- **Invalidate all user caches** when role permissions change
- **Handle role changes** in permission assignments

### 4. Middleware Updates (`backend/src/middleware/rolePermissions.js`)
Enhanced the permission middleware to:
- **Support both hardcoded and cached permissions**
- **Maintain backward compatibility** with existing routes
- **Provide optional cache usage** via `useCache` option
- **Export utility functions** for getting permissions

#### Usage:
```javascript
// Default: Uses hardcoded permissions (fast, synchronous)
router.use(checkPermission('manage_settings'));

// Optional: Use cached database permissions
router.use(checkPermission('manage_settings', { useCache: true }));
```

### 5. System Health Monitoring (`backend/src/routes/systemHealth.js`)
Added cache monitoring:
- **Cache stats in system health endpoint** (`/api/system-health`)
- **Admin-only detailed cache stats** (`/api/system-health/cache-stats`)

## Benefits

### Performance Improvements:
1. **Reduced Database Queries**: Permission checks no longer query the database on every request
2. **Faster Response Times**: Cached permissions are retrieved instantly from memory
3. **Lower Database Load**: Significant reduction in permission-related queries
4. **Scalability**: System can handle more concurrent requests with less database overhead

### Cache Behavior:
- **First Request**: Cache miss → Database query → Cache stored
- **Subsequent Requests**: Cache hit → Instant response (no database query)
- **After TTL Expires**: Cache invalidated → Next request fetches from database
- **On Permission Changes**: Cache automatically invalidated → Fresh data on next request

## Cache Invalidation Strategy

The system automatically invalidates caches when:
1. **User role changes** → User cache and role cache invalidated
2. **Permissions assigned/removed** → Role cache and all user caches invalidated
3. **User deleted** → User cache invalidated
4. **TTL expiration** → Automatic expiration after configured time

## Monitoring

### Cache Statistics Endpoint
**GET** `/api/system-health/cache-stats` (Admin only)

Returns:
```json
{
  "success": true,
  "cache": {
    "rolePermissions": {
      "size": 3,
      "maxSize": 1000
    },
    "userPermissions": {
      "size": 15,
      "maxSize": 1000
    },
    "ttl": 3600000,
    "ttlMinutes": 60
  }
}
```

### System Health Endpoint
**GET** `/api/system-health`

Includes permission cache status in the health check response.

## Configuration

### Environment Variables
```env
# Permission cache TTL in milliseconds (default: 3600000 = 1 hour)
PERMISSION_CACHE_TTL=3600000
```

## Testing Recommendations

1. **Cache Hit/Miss Verification**:
   - Check logs for "Permission cache HIT" and "Permission cache MISS" messages
   - First request should show MISS, subsequent requests should show HIT

2. **Cache Invalidation Testing**:
   - Change a user's role → Verify cache is invalidated
   - Modify role permissions → Verify role cache is invalidated

3. **Performance Testing**:
   - Compare response times before and after caching
   - Monitor database query counts for permission checks

4. **Cache Statistics**:
   - Monitor cache size and hit rates via `/api/system-health/cache-stats`
   - Verify cache doesn't exceed max size limits

## Files Modified

1. `backend/src/services/permissionCache.js` - **NEW**: Cache service implementation
2. `backend/src/models/User.js` - Updated to use cache
3. `backend/src/models/RolePermission.js` - Added cache invalidation hooks
4. `backend/src/middleware/rolePermissions.js` - Enhanced with cache support
5. `backend/src/routes/systemHealth.js` - Added cache monitoring

## Backward Compatibility

✅ **Fully backward compatible**:
- Existing routes continue to work without changes
- Default behavior uses hardcoded permissions (no breaking changes)
- Cache is opt-in via `useCache` option
- User model methods maintain same API signature

## Future Enhancements

Potential improvements:
1. **Redis Integration**: Move from in-memory to Redis for multi-instance deployments
2. **Cache Warming**: Pre-load permissions on server startup
3. **Metrics Collection**: Track cache hit rates and performance metrics
4. **Cache Compression**: For very large permission sets
5. **Distributed Cache**: For microservices architecture

## Notes

- Cache is stored in-memory, so it's reset on server restart
- For production deployments with multiple instances, consider Redis
- Cache TTL can be adjusted based on permission change frequency
- Maximum cache size prevents memory issues in high-traffic scenarios

