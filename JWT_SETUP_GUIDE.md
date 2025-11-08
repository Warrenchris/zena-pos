# JWT Setup Guide - Complete Implementation

## Quick Setup

### 1. Backend Environment Variables

Create or update `backend/.env`:

```env
# Database Configuration
DB_NAME=zana_pos
DB_USER=root
DB_PASS=
DB_HOST=127.0.0.1
DB_PORT=3306
DB_SYNC=false

# JWT Configuration (REQUIRED)
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development

# AI Service Configuration
AI_SERVICE_URL=http://127.0.0.1:8000
AI_PROXY_URL=http://localhost:3000/api/ai/status

# Permission Cache Configuration
PERMISSION_CACHE_TTL=3600000

# Optional: Market Alerts
MARKET_ALERTS_ENABLED=false
MARKET_ALERTS_URL=
```

### 2. AI Service Environment Variables

Create or update `ai_service/.env`:

```env
# JWT Configuration (REQUIRED)
# IMPORTANT: Must match JWT_SECRET in backend/.env
JWT_SECRET=your-secret-key-change-this-in-production
JWT_ALGORITHM=HS256
```

**⚠️ CRITICAL**: Both services **MUST** use the **same** `JWT_SECRET` value!

## Implementation Checklist

### ✅ Completed

1. **AI Service JWT Authentication**
   - ✅ Created `ai_service/src/middleware/auth.py`
   - ✅ All AI endpoints require JWT tokens
   - ✅ Uses `python-jose` library

2. **Backend Security**
   - ✅ Backend proxy requires authentication
   - ✅ Direct AI service calls include JWT tokens
   - ✅ Authorization headers are forwarded

3. **Health Check Endpoints**
   - ✅ `/` and `/openapi.json` don't require auth (for health checks)
   - ✅ All other endpoints require authentication

4. **Documentation**
   - ✅ Security analysis document
   - ✅ RS256 migration guide
   - ✅ Implementation summary
   - ✅ Setup guide (this document)

## Testing the Implementation

### 1. Test Backend Authentication

```bash
# Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Save the token from response
TOKEN="your-jwt-token-here"
```

### 2. Test AI Service Direct Access (Should Fail)

```bash
# Try to access without token (should return 401)
curl -X POST http://localhost:8000/api/finance/analyze \
  -H "Content-Type: application/json" \
  -d '{"revenue":1000,"costs":500,"expenses":200,"assets":5000,"liabilities":2000,"date":"2024-01-01T00:00:00"}'

# Expected: {"detail":"Not authenticated"}
```

### 3. Test AI Service with Token (Should Succeed)

```bash
# Access with valid token
curl -X POST http://localhost:8000/api/finance/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"revenue":1000,"costs":500,"expenses":200,"assets":5000,"liabilities":2000,"date":"2024-01-01T00:00:00"}'

# Expected: Financial metrics JSON response
```

### 4. Test Backend Proxy (Should Work)

```bash
# Access AI service through backend proxy
curl -X POST http://localhost:3000/api/ai/forward/api/finance/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"revenue":1000,"costs":500,"expenses":200,"assets":5000,"liabilities":2000,"date":"2024-01-01T00:00:00"}'

# Expected: Financial metrics JSON response
```

### 5. Test Health Check (Should Work Without Auth)

```bash
# Health check should work without authentication
curl http://localhost:8000/
# Expected: {"status":"ok","service":"Zana AI Financial Helper"}

curl http://localhost:8000/openapi.json
# Expected: OpenAPI schema JSON
```

## Troubleshooting

### Issue: "JWT_SECRET not configured"

**Solution**: Ensure both `.env` files have `JWT_SECRET` set with the same value.

### Issue: "Invalid token" errors

**Possible causes**:
1. Token expired - Check `JWT_EXPIRES_IN` setting
2. Wrong secret - Ensure both services use the same `JWT_SECRET`
3. Token not forwarded - Check that Authorization header is included

### Issue: AI service returns 401

**Check**:
1. Is `JWT_SECRET` set in `ai_service/.env`?
2. Does it match the backend `JWT_SECRET`?
3. Is the Authorization header being sent?
4. Is the token still valid (not expired)?

### Issue: Backend can't reach AI service

**Check**:
1. Is AI service running on port 8000?
2. Is `AI_SERVICE_URL` correct in backend `.env`?
3. Check firewall/network settings

## Security Best Practices

1. **Never commit secrets to git**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for documentation

2. **Use strong secrets**
   - Generate random 32+ character strings
   - Use: `openssl rand -base64 32`

3. **Rotate secrets regularly**
   - Plan for secret rotation
   - Update both services simultaneously

4. **Monitor authentication failures**
   - Log 401 errors
   - Alert on suspicious patterns

5. **Consider RS256 for production**
   - See `JWT_RS256_MIGRATION_GUIDE.md`
   - Better security isolation

## Next Steps

1. ✅ Set `JWT_SECRET` in both `.env` files
2. ✅ Restart both services
3. ✅ Test authentication
4. 📋 Monitor logs for errors
5. 📋 Consider RS256 migration for production

## Files Modified

### New Files:
- `ai_service/src/middleware/__init__.py`
- `ai_service/src/middleware/auth.py`
- `JWT_SECURITY_ANALYSIS.md`
- `JWT_RS256_MIGRATION_GUIDE.md`
- `JWT_IMPLEMENTATION_SUMMARY.md`
- `JWT_SETUP_GUIDE.md` (this file)

### Modified Files:
- `ai_service/src/main.py` - Added health check endpoints
- `ai_service/src/routers/financial_analysis.py` - Added JWT auth
- `ai_service/src/routers/forecasting.py` - Added JWT auth
- `ai_service/src/routers/insights.py` - Added JWT auth
- `backend/src/routes/aiProxy.js` - Added auth middleware
- `backend/src/controllers/insightsController.js` - Added JWT token forwarding

## Support

If you encounter issues:
1. Check both `.env` files have `JWT_SECRET` set
2. Verify both services are using the same secret
3. Check service logs for detailed error messages
4. Review `JWT_SECURITY_ANALYSIS.md` for security details

