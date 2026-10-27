# JWT Authentication

## Overview
The system uses RS256 (asymmetric) JWT tokens for authentication:
- Backend signs tokens with a private key
- Other services verify tokens with the public key
- This is more secure than HS256 as services only need the public key to verify

## Setting up JWT keys

1. Generate the key pair:
```bash
make keys
```
This will:
- Create `backend/jwt_private_key.pem` (keep private!)
- Create `backend/jwt_public_key.pem`
- Copy the public key to `ai_service/`

Or manually:
```bash
cd backend
node scripts/generate-jwt-keys.js
```

## Key locations
- Backend:
  - Private key: `backend/jwt_private_key.pem`
  - Public key: `backend/jwt_public_key.pem`
- AI Service:
  - Public key: `ai_service/jwt_public_key.pem`

## Environment variables
Backend needs:
```env
JWT_EXPIRES_IN=24h
JWT_PRIVATE_KEY_PATH=./jwt_private_key.pem  # Optional, default location
```

AI Service needs:
```env
JWT_ALGORITHM=RS256
JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem
```

## Security notes
- Never commit private keys to Git
- In production, use proper secrets management
- The public key can be shared safely
- Keys in the repo are for development only