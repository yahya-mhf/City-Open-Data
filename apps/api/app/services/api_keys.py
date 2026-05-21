import hashlib
import secrets


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, hash)."""
    raw = secrets.token_urlsafe(32)
    full_key = f"scp_{raw}"
    prefix = full_key[:8]
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


def hash_key(full_key: str) -> str:
    return hashlib.sha256(full_key.encode()).hexdigest()
