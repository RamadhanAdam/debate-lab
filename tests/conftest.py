import pytest
import asyncio
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport

@pytest.fixture
def anyio_backend():
    return 'asyncio'

@pytest.fixture
async def async_client():
    from web_app import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def mocker():
    active = []

    class MiniMocker:
        def patch(self, target, *args, **kwargs):
            mocked = patch(target, *args, **kwargs)
            value = mocked.start()
            active.append(mocked)
            return value

    try:
        yield MiniMocker()
    finally:
        while active:
            active.pop().stop()

@pytest.fixture
def mock_agent_response():
    return "Mocked argument text"

@pytest.fixture
def mock_supabase(mocker):
    return mocker.patch("web_app.supabase")
