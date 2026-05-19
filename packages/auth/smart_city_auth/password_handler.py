from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


class PasswordHandler:
    def __init__(self) -> None:
        self.hasher = PasswordHasher()

    def hash_password(self, password: str) -> str:
        return self.hasher.hash(password)

    def verify_password(self, password: str, password_hash: str) -> bool:
        try:
            return self.hasher.verify(password_hash, password)
        except VerifyMismatchError:
            return False
        except Exception:
            return False
