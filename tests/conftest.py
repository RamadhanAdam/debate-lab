import pytest
import asyncio
from httpx import AsyncClient


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def async_client():
    from web_app import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_agent_response():
    return "Mocked argument text"


@pytest.fixture
def mock_supabase(mocker):
    return mocker.patch("web_app.supabase")
