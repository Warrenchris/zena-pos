# JWT RS256 Migration Guide

## Overview

This guide explains how to migrate from HS256 (shared secret) to RS256 (public/private key) for better security in a microservices architecture.

## Why RS256?

### Current (HS256) Limitations:
- Both services need the same secret key
- If AI service is compromised, tokens can be forged
- Secret must be shared across services (increases attack surface)

### RS256 Benefits:
- **Private key** (backend): Signs tokens (never shared)
- **Public key** (AI service): Validates tokens (can't forge)
- Better security isolation between services
- Industry best practice for microservices

## Implementation Steps

### 1. Generate RSA Key Pair

```bash
# Generate private key (2048-bit RSA)
openssl genrsa -out jwt_private_key.pem 2048

# Generate public key from private key
openssl rsa -in jwt_private_key.pem -pubout -out jwt_public_key.pem
```

### 2. Update Backend (Node.js)

#### Install crypto (built-in, no install needed)

#### Update `backend/src/controllers/authController.js`:

```javascript
const fs = require('fs');
const crypto = require('crypto');

// Load private key
const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH || './jwt_private_key.pem', 'utf8');

// Sign token with RS256
const token = jwt.sign(
  { 
    id: user.id, 
    role: user.role,
    shopId: user.shopId,
    isEmployee: false
  },
  privateKey,
  { 
    algorithm: 'RS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  }
);
```

#### Update `backend/src/middleware/auth.js`:

```javascript
const fs = require('fs');

// Load public key for verification
const publicKey = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH || './jwt_public_key.pem', 'utf8');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    // Verify with public key
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    req.user = decoded;
    req.shopId = decoded.shopId;
    
    // ... rest of the code
  } catch (error) {
    // ... error handling
  }
};
```

### 3. Update AI Service (Python)

#### Update `ai_service/src/middleware/auth.py`:

```python
import os
from pathlib import Path
from jose import jwt

# Load public key
JWT_PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH", "./jwt_public_key.pem")
JWT_ALGORITHM = "RS256"

def load_public_key():
    """Load RSA public key from file"""
    key_path = Path(JWT_PUBLIC_KEY_PATH)
    if not key_path.exists():
        raise ValueError(f"Public key not found at {JWT_PUBLIC_KEY_PATH}")
    
    with open(key_path, 'r') as f:
        return f.read()

PUBLIC_KEY = load_public_key()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """Verify JWT token with RS256"""
    if not PUBLIC_KEY:
        raise HTTPException(
            status_code=500,
            detail="JWT public key not configured"
        )
    
    token = credentials.credentials
    
    try:
        # Verify with public key
        payload = jwt.decode(
            token,
            PUBLIC_KEY,
            algorithms=[JWT_ALGORITHM]
        )
        
        # ... rest of verification logic
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )
```

### 4. Environment Variables

#### Backend `.env`:
```env
# RS256 Configuration
JWT_PRIVATE_KEY_PATH=./jwt_private_key.pem
JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem
JWT_ALGORITHM=RS256
JWT_EXPIRES_IN=24h
```

#### AI Service `.env`:
```env
# RS256 Configuration
JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem
JWT_ALGORITHM=RS256
```

### 5. Security Best Practices

1. **Key Storage**:
   - Store private key securely (never commit to git)
   - Use environment variables for key paths
   - Consider using secret management services (AWS Secrets Manager, HashiCorp Vault)

2. **Key Rotation**:
   - Implement key rotation strategy
   - Support multiple keys during rotation period
   - Update public key in AI service when rotating

3. **File Permissions**:
   ```bash
   # Private key: read-only for application user
   chmod 600 jwt_private_key.pem
   
   # Public key: readable by all (safe to share)
   chmod 644 jwt_public_key.pem
   ```

4. **Git Ignore**:
   ```
   # Add to .gitignore
   *.pem
   jwt_private_key.pem
   jwt_public_key.pem
   ```

## Migration Checklist

- [ ] Generate RSA key pair
- [ ] Update backend to sign with RS256
- [ ] Update backend middleware to verify with RS256
- [ ] Update AI service to verify with RS256
- [ ] Update environment variables
- [ ] Test token generation and validation
- [ ] Update documentation
- [ ] Deploy with new keys
- [ ] Monitor for authentication errors

## Rollback Plan

If issues occur:
1. Keep HS256 code commented out
2. Switch back to HS256 via environment variable
3. Revert to shared secret temporarily
4. Investigate and fix RS256 issues
5. Re-deploy with RS256

## Testing

```bash
# Test token generation (backend)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test token validation (AI service)
curl -X POST http://localhost:8000/api/finance/analyze \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"revenue":1000,"costs":500,"expenses":200,"assets":5000,"liabilities":2000,"date":"2024-01-01T00:00:00"}'
```

