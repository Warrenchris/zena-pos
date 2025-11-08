# Inter-Service Authentication Flow

## Overview

This document describes how authentication works between services in the Zana POS system. The system uses **RS256 (asymmetric) JWT tokens** for secure inter-service communication.

## Architecture

The system consists of three main components:

1. **Frontend** (React/Vite) - Port 5173
2. **Backend** (Node.js/Express) - Port 3000
3. **AI Service** (Python/FastAPI) - Port 8000

## Authentication Flow

### 1. User Login Flow

```
┌─────────┐                    ┌─────────┐
│Frontend │                    │ Backend │
└────┬────┘                    └────┬────┘
     │                               │
     │  1. POST /api/auth/login      │
     │     {email, password}          │
     ├───────────────────────────────>│
     │                               │
     │                               │ 2. Verify credentials
     │                               │    (Database lookup)
     │                               │
     │                               │ 3. Sign JWT token
     │                               │    (RS256 with private key)
     │                               │
     │  4. Response: {user, token}   │
     │<──────────────────────────────┤
     │                               │
     │ 5. Store token in localStorage│
     │                               │
```

**Details:**
- User submits credentials via frontend
- Backend validates credentials against database
- Backend signs JWT token using **private key** (`jwt_private_key.pem`)
- Token payload includes: `{id, role, shopId, isEmployee}`
- Token expiration: 24 hours (configurable via `JWT_EXPIRES_IN`)
- Frontend stores token for subsequent requests

### 2. Frontend to Backend Communication

```
┌─────────┐                    ┌─────────┐
│Frontend │                    │ Backend │
└────┬────┘                    └────┬────┘
     │                               │
     │  Request with Authorization   │
     │  Header: Bearer <token>       │
     ├──────────────────────────────>│
     │                               │
     │                               │ 1. Extract token from header
     │                               │
     │                               │ 2. Verify token signature
     │                               │    (RS256 with public key)
     │                               │
     │                               │ 3. Validate expiration
     │                               │
     │                               │ 4. Extract user context
     │                               │    (req.user, req.shopId)
     │                               │
     │                               │ 5. Process request
     │                               │
     │  Response with data          │
     │<──────────────────────────────┤
     │                               │
```

**Details:**
- All authenticated backend endpoints require `Authorization: Bearer <token>` header
- Backend validates token using **public key** (`jwt_public_key.pem`)
- User context is attached to request (`req.user`, `req.shopId`)
- Shop isolation is enforced for multi-tenant operations

### 3. Backend to AI Service Communication

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│Frontend │                    │ Backend │                    │AI Service│
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                               │                               │
     │ 1. POST /api/ai/forward/...   │                               │
     │    Authorization: Bearer <token>                              │
     ├──────────────────────────────>│                               │
     │                               │                               │
     │                               │ 2. Validate token             │
     │                               │    (Backend auth middleware)  │
     │                               │                               │
     │                               │ 3. Forward request            │
     │                               │    POST /api/finance/analyze  │
     │                               │    Authorization: Bearer <token>│
     │                               ├───────────────────────────────>│
     │                               │                               │
     │                               │                               │ 4. Verify token
     │                               │                               │    (RS256 with public key)
     │                               │                               │
     │                               │                               │ 5. Extract user context
     │                               │                               │    (user.id, user.role, etc.)
     │                               │                               │
     │                               │                               │ 6. Process AI request
     │                               │                               │
     │                               │ 7. Response with AI results   │
     │                               │<───────────────────────────────┤
     │                               │                               │
     │ 8. Response with AI results  │                               │
     │<──────────────────────────────┤                               │
     │                               │                               │
```

**Details:**
- Frontend makes request to backend proxy endpoint: `/api/ai/forward/*`
- Backend validates the token first (prevents unauthorized proxy access)
- Backend forwards the **same token** to AI service in `Authorization` header
- AI service validates token using **public key** (`jwt_public_key.pem`)
- AI service extracts user context for request processing
- Response flows back through backend to frontend

### 4. Direct Backend to AI Service Calls

In some cases, the backend makes direct calls to the AI service (e.g., from controllers):

```
┌─────────┐                    ┌──────────┐
│ Backend │                    │AI Service│
└────┬────┘                    └────┬─────┘
     │                               │
     │ 1. Extract token from         │
     │    incoming request           │
     │                               │
     │ 2. Direct API call            │
     │    POST /api/insights/analyze │
     │    Authorization: Bearer <token>│
     ├──────────────────────────────>│
     │                               │
     │                               │ 3. Verify token
     │                               │    (RS256 with public key)
     │                               │
     │                               │ 4. Process request
     │                               │
     │ 5. Response                   │
     │<───────────────────────────────┤
     │                               │
```

**Details:**
- Backend extracts token from incoming request headers
- Backend includes token in direct AI service calls
- Same validation process occurs on AI service side

## JWT Token Structure

### Token Payload

```json
{
  "id": 123,
  "role": "admin",
  "shopId": 456,
  "isEmployee": false,
  "iat": 1234567890,
  "exp": 1234654290
}
```

**Fields:**
- `id`: User ID
- `role`: User role (admin, manager, cashier, etc.)
- `shopId`: Shop/tenant ID for multi-tenant isolation
- `isEmployee`: Boolean indicating if user is an employee
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

### Token Format

```
Header: {
  "alg": "RS256",
  "typ": "JWT"
}
Payload: { ... }
Signature: <RSA signature>
```

## Key Management

### RS256 Key Pair

The system uses **asymmetric cryptography** (RS256):

- **Private Key** (`jwt_private_key.pem`):
  - Location: `backend/jwt_private_key.pem`
  - Used by: Backend only
  - Purpose: Sign JWT tokens
  - **NEVER shared or exposed**

- **Public Key** (`jwt_public_key.pem`):
  - Location: 
    - `backend/jwt_public_key.pem` (for backend token verification)
    - `ai_service/jwt_public_key.pem` (for AI service token verification)
  - Used by: Backend and AI Service
  - Purpose: Verify JWT token signatures
  - **Safe to share** (cannot be used to forge tokens)

### Key Generation

```bash
# Generate key pair
make keys

# Or manually:
cd backend
node scripts/generate-jwt-keys.js
```

This creates:
- `backend/jwt_private_key.pem` (2048-bit RSA private key)
- `backend/jwt_public_key.pem` (corresponding public key)
- Copies public key to `ai_service/jwt_public_key.pem`

## Configuration

### Backend Environment Variables

```env
# JWT Configuration
JWT_EXPIRES_IN=24h
JWT_PRIVATE_KEY_PATH=./jwt_private_key.pem  # Optional, defaults to this path

# AI Service URL
AI_SERVICE_URL=http://ai_service:8000  # Docker service name
# Or: http://127.0.0.1:8000  # Local development
```

### AI Service Environment Variables

```env
# JWT Configuration
JWT_ALGORITHM=RS256
JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem  # Optional, defaults to this path
```

## Security Features

### 1. Token Validation

- **Signature Verification**: Tokens are cryptographically signed and verified
- **Expiration Check**: Tokens expire after configured time (default: 24h)
- **Algorithm Enforcement**: Only RS256 tokens are accepted

### 2. Service Isolation

- **Private Key Protection**: Private key only exists in backend
- **Public Key Verification**: AI service can verify but cannot forge tokens
- **No Shared Secrets**: No shared secrets between services

### 3. Request Validation

- **Backend Proxy**: All AI service requests go through authenticated backend proxy
- **Direct Calls**: Backend includes tokens in direct AI service calls
- **Header Forwarding**: Authorization headers are properly forwarded

### 4. Multi-Tenant Isolation

- **Shop Context**: `shopId` in token enforces data isolation
- **Role-Based Access**: User roles control access to features
- **Employee Flag**: Distinguishes employees from shop owners

## Error Handling

### Authentication Errors

| Status Code | Scenario | Response |
|------------|----------|----------|
| 401 | Missing token | `{"error": "Authorization token required."}` |
| 401 | Invalid token | `{"error": "Invalid token."}` |
| 401 | Expired token | `{"error": "Token expired."}` |
| 403 | Insufficient permissions | `{"error": "Access denied."}` |
| 500 | Key configuration error | `{"detail": "JWT public key not configured"}` |

### Token Validation Flow

1. **Extract Token**: From `Authorization: Bearer <token>` header
2. **Verify Signature**: Using public key and RS256 algorithm
3. **Check Expiration**: Validate `exp` claim against current time
4. **Extract Context**: Load user information from payload
5. **Enforce Isolation**: Apply shop context and role checks

## Endpoint Security Matrix

### Backend Endpoints

| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `POST /api/auth/login` | ❌ No | Public authentication endpoint |
| `POST /api/auth/register` | ❌ No | Public registration endpoint |
| `GET /api/auth/profile` | ✅ Yes | Requires valid JWT token |
| `* /api/*` | ✅ Yes | All other endpoints require authentication |
| `GET /api/ai/status` | ❌ No | Health check (no auth) |
| `* /api/ai/forward/*` | ✅ Yes | Proxy routes require authentication |

### AI Service Endpoints

| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `GET /` | ❌ No | Health check |
| `GET /openapi.json` | ❌ No | OpenAPI schema (health check) |
| `POST /api/finance/analyze` | ✅ Yes | Requires JWT token |
| `POST /api/forecasting/forecast` | ✅ Yes | Requires JWT token |
| `POST /api/insights/analyze` | ✅ Yes | Requires JWT token |

## Testing Authentication Flow

### 1. Test User Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

**Expected Response:**
```json
{
  "user": {
    "id": 1,
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "admin",
    "shopId": 1
  },
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Test Backend Endpoint with Token

```bash
TOKEN="your-jwt-token-here"

curl -X GET http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Test AI Service via Proxy

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:3000/api/ai/forward/api/finance/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "revenue": 1000,
    "costs": 500,
    "expenses": 200,
    "assets": 5000,
    "liabilities": 2000,
    "date": "2024-01-01T00:00:00"
  }'
```

### 4. Test Direct AI Service Access (Should Fail)

```bash
# Without token - should return 401
curl -X POST http://localhost:8000/api/finance/analyze \
  -H "Content-Type: application/json" \
  -d '{"revenue":1000,"costs":500,"expenses":200,"assets":5000,"liabilities":2000,"date":"2024-01-01T00:00:00"}'
```

**Expected Response:**
```json
{
  "detail": "Not authenticated"
}
```

### 5. Test Direct AI Service Access (Should Succeed)

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:8000/api/finance/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "revenue": 1000,
    "costs": 500,
    "expenses": 200,
    "assets": 5000,
    "liabilities": 2000,
    "date": "2024-01-01T00:00:00"
  }'
```

## Troubleshooting

### Issue: "JWT public key not configured"

**Solution:**
- Ensure `jwt_public_key.pem` exists in `ai_service/` directory
- Check `JWT_PUBLIC_KEY_PATH` environment variable
- Verify file permissions

### Issue: "Invalid token" errors

**Possible causes:**
1. Token expired - Check `JWT_EXPIRES_IN` setting
2. Wrong public key - Ensure public key matches private key
3. Token not forwarded - Check Authorization header is included
4. Algorithm mismatch - Ensure RS256 is used consistently

### Issue: AI service returns 401

**Check:**
1. Is `jwt_public_key.pem` present in `ai_service/`?
2. Does public key match the private key used to sign tokens?
3. Is `JWT_ALGORITHM=RS256` set in AI service `.env`?
4. Is Authorization header being sent?
5. Is token still valid (not expired)?

### Issue: Backend can't reach AI service

**Check:**
1. Is AI service running on port 8000?
2. Is `AI_SERVICE_URL` correct in backend `.env`?
3. In Docker: Use service name (`ai_service:8000`)
4. Locally: Use `127.0.0.1:8000` or `localhost:8000`
5. Check firewall/network settings

## Best Practices

1. **Never commit private keys to Git**
   - Add `*.pem` to `.gitignore`
   - Use `.env.example` for documentation

2. **Use strong key pairs**
   - Generate 2048-bit or higher RSA keys
   - Rotate keys periodically in production

3. **Monitor authentication failures**
   - Log 401 errors for security monitoring
   - Alert on suspicious patterns

4. **Token expiration**
   - Use reasonable expiration times (24h default)
   - Implement token refresh if needed

5. **Production considerations**
   - Use secrets management (not `.env` files)
   - Enable HTTPS for all communications
   - Implement rate limiting
   - Monitor and log authentication events

## Related Documentation

- [JWT Setup Guide](./JWT_SETUP_GUIDE.md) - Detailed setup instructions
- [JWT RS256 Migration Guide](./JWT_RS256_MIGRATION_GUIDE.md) - Migration from HS256
- [Docker Setup](./DOCKER_SETUP.md) - Docker environment configuration
- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference

