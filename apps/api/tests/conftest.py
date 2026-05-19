import asyncio
import sys
from pathlib import Path

import pytest

# Ensure packages are importable
sys.path.insert(0, str(Path(__file__).parent.parent / "app"))


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
