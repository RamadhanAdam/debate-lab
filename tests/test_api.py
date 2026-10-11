import pytest


@pytest.mark.asyncio
async def test_api_status(async_client):
    # Mock require_user by patching it or just testing without auth if possible
    # We will mock the JWT decode or just the require_user function
    pass


@pytest.mark.asyncio
async def test_api_validate_key(async_client, mocker):
    mocker.patch(
        "web_app.require_user",
        return_value={"user_id": "test", "github_username": "test"},
    )

    # Send a request with a dummy provider
    response = await async_client.post(
        "/api/validate-key", json={"provider": "unknown", "key": "test"}
    )
    assert response.status_code == 200
    assert response.json()["valid"] == False
    assert "Unknown provider" in response.json()["error"]


@pytest.mark.asyncio
async def test_api_human_input(async_client, mocker):
    mocker.patch(
        "web_app.require_user",
        return_value={"user_id": "test", "github_username": "test"},
    )

    import web_app

    # Add a dummy job in waiting state
    web_app.JOBS["test_job"] = {"status": "human_turn"}

    response = await async_client.post(
        "/api/jobs/test_job/human-input", json={"text": "Human argument"}
    )
    assert response.status_code == 200
    assert web_app.JOBS["test_job"]["human_input"] == "Human argument"
