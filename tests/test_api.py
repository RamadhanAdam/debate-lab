import pytest

@pytest.mark.asyncio
async def test_api_status(async_client):
    # Mock require_user by patching it or just testing without auth if possible
    # We will mock the JWT decode or just the require_user function
    pass

@pytest.mark.asyncio
async def test_api_validate_key(async_client, mocker):
    mocker.patch("web_app.require_user", return_value={"user_id": "test", "github_username": "test"})
    
    # Send a request with a dummy provider
    response = await async_client.post("/api/validate-key", json={"provider": "unknown", "key": "test"})
    assert response.status_code == 200
    assert response.json()["valid"] == False
    assert "Unknown provider" in response.json()["error"]

@pytest.mark.asyncio
async def test_api_human_input(async_client, mocker):
    mocker.patch("web_app.require_user", return_value={"user_id": "test", "github_username": "test"})
    
    import web_app
    # Add a dummy job in waiting state
    web_app.JOBS["test_job"] = {"user_id": "test", "status": "human_turn"}
    
    response = await async_client.post("/api/jobs/test_job/human-input", json={"text": "Human argument"})
    assert response.status_code == 200
    assert web_app.JOBS["test_job"]["human_input"] == "Human argument"


@pytest.mark.asyncio
async def test_api_human_input_rejects_other_users(async_client, mocker):
    mocker.patch("web_app.require_user", return_value={"user_id": "test", "github_username": "test"})

    import web_app
    web_app.JOBS["other_job"] = {"user_id": "other", "status": "human_turn"}

    response = await async_client.post("/api/jobs/other_job/human-input", json={"text": "Nope"})

    assert response.status_code == 400
    assert "human_input" not in web_app.JOBS["other_job"]


def test_github_url_validation_rejects_lookalike_hosts():
    from web_app import is_allowed_github_repo_url

    assert is_allowed_github_repo_url("https://github.com/RamadhanAdam/debate-lab")
    assert is_allowed_github_repo_url("git@github.com:RamadhanAdam/debate-lab.git")
    assert is_allowed_github_repo_url("ssh://git@github.com/RamadhanAdam/debate-lab.git")
    assert not is_allowed_github_repo_url("ssh://git@evilgithub.com/RamadhanAdam/debate-lab.git")
    assert not is_allowed_github_repo_url("https://github.com.evil.test/RamadhanAdam/debate-lab")


def test_clone_filter_skips_sensitive_files(tmp_path):
    from web_app import should_copy_cloned_file

    safe = tmp_path / "README.md"
    env_file = tmp_path / ".env"
    token_file = tmp_path / "src" / "api_token.txt"
    key_file = tmp_path / "deploy.pem"
    safe.write_text("hello", encoding="utf-8")
    env_file.write_text("SECRET=value", encoding="utf-8")
    token_file.parent.mkdir()
    token_file.write_text("token", encoding="utf-8")
    key_file.write_text("key", encoding="utf-8")

    assert should_copy_cloned_file(safe, tmp_path)
    assert not should_copy_cloned_file(env_file, tmp_path)
    assert not should_copy_cloned_file(token_file, tmp_path)
    assert not should_copy_cloned_file(key_file, tmp_path)
