"""SQLAlchemy 2.0 Declarative Base and ID generation utilities (`app/db/base.py`).

Implements Contract 4 Section 1 (`docs/contracts/database-schema.md`):
String-Prefixed Sortable IDs (`job_`, `cnd_`, `ses_`, `trn_`, `rep_` + 26-char sortable ULID/hex).
"""

from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone

from sqlalchemy.orm import DeclarativeBase


CROCKFORD_BASE32 = "0123456789abcdefghjkmnpqrstvwxyz"


def _encode_base32(value: int, length: int) -> str:
    chars = []
    for _ in range(length):
        chars.append(CROCKFORD_BASE32[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def generate_prefixed_id(prefix: str) -> str:
    """Generate a `VARCHAR(36)` string-prefixed ULID (`<prefix>_<26_char_ulid>`)."""
    timestamp_ms = int(time.time() * 1000)
    time_part = _encode_base32(timestamp_ms, 10)
    rand_bits = secrets.randbits(80)
    rand_part = _encode_base32(rand_bits, 16)
    clean_prefix = prefix.rstrip("_")
    return f"{clean_prefix}_{time_part}{rand_part}"[:36]


def utc_now() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 DeclarativeBase for all ORM entities."""

    pass
