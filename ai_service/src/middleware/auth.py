"""
JWT Authentication Middleware for AI Service
Validates JWT tokens from the main backend service using RS256 algorithm
"""

from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

# Security scheme for Bearer token
security = HTTPBearer()

# RS256 Configuration
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
    """
    Verify JWT token and return decoded payload
    
    Args:
        credentials: HTTPAuthorizationCredentials from Security scheme
        
    Returns:
        dict: Decoded JWT payload
        
    Raises:
        HTTPException: If token is invalid, expired, or missing
    """
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
        
        # Extract user information
        user_id = payload.get("id")
        role = payload.get("role")
        shop_id = payload.get("shopId")
        is_employee = payload.get("isEmployee", False)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing user ID"
            )
        
        return {
            "id": user_id,
            "role": role,
            "shopId": shop_id,
            "isEmployee": is_employee,
            "payload": payload
        }
        
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Token verification failed: {str(e)}"
        )


def get_current_user(token_data: dict = Depends(verify_token)) -> dict:
    """
    Dependency to get current authenticated user
    
    Args:
        token_data: Decoded token data from verify_token
        
    Returns:
        dict: User information
    """
    return token_data


def require_role(allowed_roles: list[str]):
    """
    Dependency factory to require specific roles
    
    Args:
        allowed_roles: List of allowed roles
        
    Returns:
        Dependency function that checks role
    """
    def role_checker(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("role")
        
        if not user_role:
            raise HTTPException(
                status_code=403,
                detail="User role not found in token"
            )
        
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed_roles}, User role: {user_role}"
            )
        
        return user
    
    return role_checker


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency to require admin role
    
    Args:
        user: Current user from get_current_user
        
    Returns:
        dict: User information if admin
        
    Raises:
        HTTPException: If user is not admin
    """
    user_role = user.get("role")
    
    if user_role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    
    return user

