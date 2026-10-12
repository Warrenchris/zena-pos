"""
Security regression tests for AI Service JWT authentication & authorization middleware.
Tests RS256 signature verification, expiry enforcement, issuer/audience validation,
malformed token handling, and role boundary enforcement.
"""

import unittest
import time
import os
from unittest.mock import MagicMock
from jose import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

# Generate an in-memory RSA keypair for self-contained, reproducible unit tests
_private_key_obj = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048
)
TEST_PRIVATE_KEY_PEM = _private_key_obj.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
).decode('utf-8')

TEST_PUBLIC_KEY_PEM = _private_key_obj.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo
).decode('utf-8')

# Another key pair to test invalid signature / wrong key
_other_key_obj = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_PRIVATE_KEY_PEM = _other_key_obj.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
).decode('utf-8')

# Import auth module and configure test public key
import src.middleware.auth as auth_module
auth_module.PUBLIC_KEY = TEST_PUBLIC_KEY_PEM
auth_module.JWT_EXPECTED_ISSUER = "zana-backend"
auth_module.JWT_EXPECTED_AUDIENCE = "ai-service"


def create_token(payload_overrides=None, private_key=TEST_PRIVATE_KEY_PEM, expires_in=900):
    now = int(time.time())
    payload = {
        "id": 101,
        "role": "cashier",
        "shopId": 2,
        "isEmployee": True,
        "iss": "zana-backend",
        "aud": "ai-service",
        "iat": now,
        "exp": now + expires_in
    }
    if payload_overrides:
        payload.update(payload_overrides)
        # Allow test to explicitly delete claims by setting value to None
        for k in list(payload.keys()):
            if payload[k] is None:
                del payload[k]
    return jwt.encode(payload, private_key, algorithm="RS256")


class TestAuthMiddleware(unittest.TestCase):

    def test_valid_token_accepted(self):
        token = create_token(payload_overrides={"organizationId": 42})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        result = auth_module.verify_token(creds)
        self.assertEqual(result["id"], 101)
        self.assertEqual(result["role"], "cashier")
        self.assertEqual(result["shopId"], 2)
        self.assertEqual(result["shop_id"], 2)
        self.assertEqual(result["organizationId"], 42)
        self.assertTrue(result["isEmployee"])

    def test_expired_token_rejected_with_401(self):
        token = create_token(expires_in=-60)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("expired", ctx.exception.detail.lower())

    def test_missing_expiration_rejected_with_401(self):
        token = create_token(payload_overrides={"exp": None})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("expiration", ctx.exception.detail.lower())

    def test_wrong_issuer_rejected_with_401(self):
        token = create_token(payload_overrides={"iss": "untrusted-backend"})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("issuer", ctx.exception.detail.lower())

    def test_missing_issuer_rejected_with_401(self):
        token = create_token(payload_overrides={"iss": None})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("issuer", ctx.exception.detail.lower())

    def test_wrong_audience_rejected_with_401(self):
        token = create_token(payload_overrides={"aud": "other-service"})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("audience", ctx.exception.detail.lower())

    def test_missing_audience_rejected_with_401(self):
        token = create_token(payload_overrides={"aud": None})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("audience", ctx.exception.detail.lower())

    def test_invalid_signature_rejected_with_401(self):
        token = create_token(private_key=OTHER_PRIVATE_KEY_PEM)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("verification failed", ctx.exception.detail.lower())

    def test_alg_none_rejected_with_401(self):
        import base64
        import json
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps({
            "id": 1,
            "role": "admin",
            "shopId": 1,
            "iss": "zana-backend",
            "aud": "ai-service",
            "exp": int(time.time()) + 900
        }).encode()).decode().rstrip("=")
        unsigned_token = f"{header}.{payload}."
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=unsigned_token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_hs256_token_rejected_with_401(self):
        now = int(time.time())
        hs256_token = jwt.encode({
            "id": 1,
            "role": "admin",
            "shopId": 1,
            "iss": "zana-backend",
            "aud": "ai-service",
            "iat": now,
            "exp": now + 900
        }, "shared-hmac-secret", algorithm="HS256")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=hs256_token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_static_api_key_rejected_with_401(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="your_ai_service_api_key_here")
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_malformed_token_rejected_with_401(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="garbage.malformed.token")
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_user_id_rejected_with_401(self):
        token = create_token(payload_overrides={"id": None})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with self.assertRaises(HTTPException) as ctx:
            auth_module.verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("missing user id", ctx.exception.detail.lower())

    def test_missing_public_key_fails_closed_with_500(self):
        prev_key = auth_module.PUBLIC_KEY
        try:
            auth_module.PUBLIC_KEY = None
            token = create_token()
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            with self.assertRaises(HTTPException) as ctx:
                auth_module.verify_token(creds)
            self.assertEqual(ctx.exception.status_code, 500)
            self.assertIn("public key not configured", ctx.exception.detail.lower())
        finally:
            auth_module.PUBLIC_KEY = prev_key

    def test_load_public_key_supports_jwt_public_key_env_var(self):
        prev_env = os.environ.get("JWT_PUBLIC_KEY")
        try:
            escaped_pem = TEST_PUBLIC_KEY_PEM.replace("\n", "\\n")
            os.environ["JWT_PUBLIC_KEY"] = escaped_pem
            loaded = auth_module.load_public_key()
            self.assertEqual(loaded, TEST_PUBLIC_KEY_PEM.strip())
        finally:
            if prev_env is None:
                os.environ.pop("JWT_PUBLIC_KEY", None)
            else:
                os.environ["JWT_PUBLIC_KEY"] = prev_env

    def test_load_public_key_returns_none_when_unconfigured(self):
        prev_env = os.environ.get("JWT_PUBLIC_KEY")
        prev_path = os.environ.get("JWT_PUBLIC_KEY_PATH")
        try:
            os.environ.pop("JWT_PUBLIC_KEY", None)
            os.environ["JWT_PUBLIC_KEY_PATH"] = "./nonexistent_public_key_12345.pem"
            loaded = auth_module.load_public_key()
            self.assertIsNone(loaded)
        finally:
            if prev_env is not None:
                os.environ["JWT_PUBLIC_KEY"] = prev_env
            if prev_path is None:
                os.environ.pop("JWT_PUBLIC_KEY_PATH", None)
            else:
                os.environ["JWT_PUBLIC_KEY_PATH"] = prev_path

    def test_require_admin_allows_admin(self):
        user = {"id": 1, "role": "admin"}
        result = auth_module.require_admin(user)
        self.assertEqual(result, user)

    def test_require_admin_blocks_cashier_with_403(self):
        user = {"id": 201, "role": "cashier"}
        with self.assertRaises(HTTPException) as ctx:
            auth_module.require_admin(user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("admin access required", ctx.exception.detail.lower())

    def test_require_role_allows_authorized_role(self):
        checker = auth_module.require_role(["admin", "manager"])
        user = {"id": 105, "role": "manager"}
        result = checker(user)
        self.assertEqual(result, user)

    def test_require_role_blocks_unauthorized_role_with_403(self):
        checker = auth_module.require_role(["admin", "manager"])
        user = {"id": 201, "role": "cashier"}
        with self.assertRaises(HTTPException) as ctx:
            checker(user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("access denied", ctx.exception.detail.lower())


if __name__ == "__main__":
    unittest.main()
