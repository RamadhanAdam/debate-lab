# web_app.py
# Browser app server with GitHub OAuth, Supabase database, and per-user data.

import asyncio
import base64
import json
import mimetypes
import os
import secrets
import threading
import uuid
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from jose import jwt
from supabase import create_client, Client

from debate import run_debate, list_input_files
from debate_config import (
    AGENTS,
    DEBATES_DIR,
    INPUT_DIR,
    MODES,
    ROUNDS,
    SUPPORT_DIR,
)


# CONFIG


ROOT = Path(__file__).parent
WEB_DIR = ROOT / "web"
DOCS_DIR = ROOT / "docs"
SUPPORT_FILE = SUPPORT_DIR / "support.jsonl"
SUPPORT_ADMIN_USERNAME = os.getenv("SUPPORT_ADMIN_USERNAME", "")
CLEAR_WORKSPACE_ON_LOGOUT = os.getenv("CLEAR_WORKSPACE_ON_LOGOUT", "false").lower() == "true"
SESSION_MAX_AGE_SECONDS = int(os.getenv("SESSION_MAX_AGE_SECONDS", str(60 * 60 * 8)))
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"

def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = require_env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = require_env("SUPABASE_SERVICE_KEY")
SUPABASE_ANON_KEY = require_env("SUPABASE_ANON_KEY")

GITHUB_CLIENT_ID = require_env("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = require_env("GITHUB_CLIENT_SECRET")
SESSION_SECRET = require_env("SESSION_SECRET")

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


# SUPABASE CLIENT


supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# APP


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/assets", StaticFiles(directory=str(WEB_DIR / "assets")), name="assets")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com; "
        "connect-src 'self' https://api.github.com https://*.supabase.co https://api.groq.com https://api.moonshot.cn https://api.deepseek.com https://generativelanguage.googleapis.com https://api.anthropic.com; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-eval' https://cdnjs.cloudflare.com https://unpkg.com; "
        "font-src 'self' data:; "
        "form-action 'self' https://github.com"
    )
    return response


# JOBS


JOBS = {}
JOBS_LOCK = threading.Lock()
RATE_LIMITS: dict[str, deque[float]] = {}
RATE_LIMITS_LOCK = threading.Lock()


SENSITIVE_CLONE_NAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "credentials.json",
    "service-account.json",
}
SENSITIVE_CLONE_PARTS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
}
SENSITIVE_CLONE_EXTENSIONS = {
    ".key",
    ".pem",
    ".p12",
    ".pfx",
    ".crt",
    ".cer",
}
SENSITIVE_CLONE_PATTERNS = re.compile(
    r"(secret|token|credential|private[_-]?key|api[_-]?key)",
    re.IGNORECASE,
)


# SESSION HELPERS


def create_session_token(user_id: str, github_username: str) -> str:
    # Create a signed JWT session token
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "github_username": github_username,
        "iat": int(now.timestamp()),
        "exp": int((now.timestamp() + SESSION_MAX_AGE_SECONDS)),
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")

def get_current_user(request: Request) -> dict | None:
    # Read and verify the session token from the cookie
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        return None


def get_user_profile(user_id: str) -> dict:
    """Fetch the stored profile for a user, falling back to an empty avatar."""
    result = (
        supabase.table("profiles")
        .select("id, github_username, github_avatar")
        .eq("id", user_id)
        .execute()
    )
    data = result.data[0] if result.data else {}
    return {
        "id": data.get("id", user_id),
        "github_username": data.get("github_username", ""),
        "github_avatar": data.get("github_avatar", ""),
    }

def require_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = get_user_profile(user["user_id"])
    return {**user, **profile}


def safe_relative_path(base_dir: Path, relative_name: str) -> Path:
    """Resolve a user-provided relative path safely inside a base directory."""
    candidate = (base_dir / relative_name).resolve()
    base_resolved = base_dir.resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    return candidate


def report_path_for_user(user_id: str, name: str) -> Path:
    """Return a report path only when Supabase says this user owns it."""
    clean_name = sanitize_name(name)
    target = safe_relative_path(DEBATES_DIR, clean_name)
    result = (
        supabase.table("debates")
        .select("id, artifact_path")
        .eq("user_id", user_id)
        .eq("artifact_path", str(target))
        .execute()
    )
    if not result.data or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Report not found")
    return target


def job_for_user(job_id: str, user_id: str, *, include_private: bool = False) -> dict:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Job not found")
        if include_private:
            return job
        return {
            key: value
            for key, value in job.items()
            if key not in {"human_event", "user_id"}
        }


def is_allowed_github_repo_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme == "https":
        return parsed.netloc.lower() == "github.com" and bool(parsed.path.strip("/"))
    if url.startswith("git@github.com:"):
        return bool(url.removeprefix("git@github.com:").strip())
    if parsed.scheme in {"ssh", "git+ssh"}:
        hostname = (parsed.hostname or "").lower()
        return hostname == "github.com" and bool(parsed.path.strip("/"))
    return False


def should_copy_cloned_file(path: Path, root: Path, max_bytes: int = 1_000_000) -> bool:
    if not path.is_file() or path.is_symlink():
        return False
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    parts = [part.lower() for part in rel.parts]
    if any(part in SENSITIVE_CLONE_PARTS for part in parts):
        return False
    name = path.name.lower()
    if name in SENSITIVE_CLONE_NAMES:
        return False
    if path.suffix.lower() in SENSITIVE_CLONE_EXTENSIONS:
        return False
    if SENSITIVE_CLONE_PATTERNS.search(str(rel)):
        return False
    try:
        return path.stat().st_size <= max_bytes
    except OSError:
        return False


def rate_limit(request: Request, bucket: str, limit: int, window_seconds: int = 60) -> None:
    client = request.client.host if request.client else "unknown"
    key = f"{client}:{bucket}"
    now = datetime.now(timezone.utc).timestamp()
    with RATE_LIMITS_LOCK:
      hits = RATE_LIMITS.get(key)
      if hits is None:
          hits = deque()
          RATE_LIMITS[key] = hits
      while hits and hits[0] <= now - window_seconds:
          hits.popleft()
      if len(hits) >= limit:
          raise HTTPException(status_code=429, detail="Too many requests. Please slow down and try again.")
      hits.append(now)


def friendly_auth_error(error: Exception) -> str:
    text = str(error).strip()
    lowered = text.lower()
    if "invalid login credentials" in lowered or "incorrect password" in lowered:
        return "Email or password is incorrect."
    if "invalid email" in lowered or "email address" in lowered:
        return "That email address looks invalid."
    if "email not confirmed" in lowered:
        return "Please confirm your email before signing in."
    if "user not found" in lowered or "no user found" in lowered:
        return "No account exists for that email."
    if "already registered" in lowered or "already exists" in lowered:
        return "An account with that email already exists."
    return text or "Authentication failed."


def sanitize_name(name: str) -> str:
    cleaned = name.strip().replace("\\", "/").lstrip("/")
    if not cleaned or cleaned in {".", ".."}:
        raise HTTPException(status_code=400, detail="Name required")
    if any(part in {"", ".", ".."} for part in cleaned.split("/")):
        raise HTTPException(status_code=400, detail="Invalid path")
    if any(ord(ch) < 32 for ch in cleaned):
        raise HTTPException(status_code=400, detail="Invalid characters in path")
    return cleaned


DOC_PAGES = {
    "getting-started": ("Getting Started", DOCS_DIR / "GETTING_STARTED.md"),
    "web-ui": ("Web UI Guide", DOCS_DIR / "WEB_UI.md"),
    "workspace": ("Workspace Guide", DOCS_DIR / "WORKSPACE.md"),
    "cli": ("CLI Reference", DOCS_DIR / "CLI.md"),
    "agents": ("Agent Guide", DOCS_DIR / "AGENTS.md"),
    "security": ("Security Notes", DOCS_DIR / "SECURITY.md"),
    "profiles": ("Profile and Avatar Guide", DOCS_DIR / "PROFILES.md"),
}


def _doc_summary(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    for line in lines:
        if line and not line.startswith("#"):
            return line[:180]
    return ""


def _load_support_items() -> list[dict]:
    if not SUPPORT_FILE.exists():
        return []
    items: list[dict] = []
    for raw in SUPPORT_FILE.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            items.append(json.loads(raw))
        except Exception:
            continue
    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return items


def _append_support_item(item: dict) -> dict:
    SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    with SUPPORT_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return item


def _clear_workspace(user_id: str) -> None:
    import shutil

    user_input_dir = INPUT_DIR / user_id
    if user_input_dir.exists():
        shutil.rmtree(user_input_dir)

    # Keep debate history by default, but allow full cleanup in explicit privacy mode.
    if CLEAR_WORKSPACE_ON_LOGOUT:
        debates = supabase.table("debates").select("id, artifact_path").eq("user_id", user_id).execute().data or []
        for debate in debates:
            artifact = debate.get("artifact_path")
            if not artifact:
                continue
            try:
                report_path = Path(artifact)
                if report_path.exists():
                    report_path.unlink()
            except Exception:
                continue
        supabase.table("debates").delete().eq("user_id", user_id).execute()


# AUTH ROUTES


@app.get("/auth/login")
async def auth_login(request: Request):
    # Generate a random state to prevent CSRF
    state = secrets.token_urlsafe(16)
    params = urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "scope": "read:user user:email",
        "state": state,
    })
    response = RedirectResponse(f"{GITHUB_AUTHORIZE_URL}?{params}")
    # Store state in cookie for verification
    response.set_cookie("oauth_state", state, httponly=True, max_age=600, secure=SESSION_COOKIE_SECURE, samesite="lax", path="/")
    return response

@app.get("/auth/callback")
async def auth_callback(request: Request, code: str, state: str):
    # Verify state matches what we set
    stored_state = request.cookies.get("oauth_state")
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    # Exchange code for GitHub access token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get GitHub token")

        # Get GitHub user info
        user_response = await client.get(
            GITHUB_USER_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        github_user = user_response.json()

    github_id = str(github_user["id"])
    github_username = github_user["login"]
    github_avatar = github_user.get("avatar_url", "")

    # Check if user exists in Supabase, create if not
    existing = supabase.table("profiles").select("id").eq("github_username", github_username).execute()

    if existing.data:
        user_id = existing.data[0]["id"]
    else:
        # Create new user in Supabase auth
        new_user = supabase.auth.admin.create_user({
            "email": f"{github_username}@github.debate-lab",
            "password": secrets.token_urlsafe(32),
            "email_confirm": True,
        })
        user_id = new_user.user.id

        # Create profile
        supabase.table("profiles").insert({
            "id": user_id,
            "github_username": github_username,
            "github_avatar": github_avatar,
        }).execute()

    # Create session token and redirect to app
    session_token = create_session_token(user_id, github_username)
    response = RedirectResponse("/")
    response.set_cookie(
        "session",
        session_token,
        httponly=True,
        max_age=SESSION_MAX_AGE_SECONDS,
        samesite="lax",
        secure=SESSION_COOKIE_SECURE,
        path="/",
    )
    response.delete_cookie("oauth_state", path="/")
    return response

@app.get("/auth/logout")
async def auth_logout(request: Request):
    user = get_current_user(request)
    if user:
        _clear_workspace(user["user_id"])
    response = RedirectResponse("/")
    response.delete_cookie("session", path="/")
    return response

@app.get("/auth/me")
async def auth_me(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"authenticated": False})
    profile = get_user_profile(user["user_id"])
    return JSONResponse({"authenticated": True, **user, **profile})

@app.post("/auth/register")
async def auth_register(request: Request):
    rate_limit(request, "auth-register", 5, 300)
    payload = await request.json()
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    try:
        result = supabase.auth.sign_up({"email": email, "password": password})
        return {"ok": True, "message": "Check your email to confirm your account"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=friendly_auth_error(e))


@app.post("/auth/reset-password")
async def auth_reset_password(request: Request):
    rate_limit(request, "auth-reset", 5, 300)
    payload = await request.json()
    email = (payload.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    try:
        redirect_to = os.getenv("PASSWORD_RESET_REDIRECT_URL", "http://127.0.0.1:8765")
        resetter = getattr(supabase.auth, "reset_password_for_email", None) or getattr(supabase.auth, "reset_password_email", None)
        if not resetter:
            raise RuntimeError("Password reset is not available with the current Supabase client.")
        try:
            resetter(email, {"redirect_to": redirect_to})
        except TypeError:
            resetter(email)
        return {"ok": True, "message": "If an account exists for that email, a recovery link has been sent."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/auth/delete-account")
async def auth_delete_account(request: Request):
    user = require_user(request)

    import shutil

    # Best-effort cleanup across app data and stored metadata.
    supabase.table("debates").delete().eq("user_id", user["user_id"]).execute()
    supabase.table("profiles").delete().eq("id", user["user_id"]).execute()
    _clear_workspace(user["user_id"])

    try:
        if hasattr(supabase.auth, "admin") and hasattr(supabase.auth.admin, "delete_user"):
            supabase.auth.admin.delete_user(user["user_id"])
    except Exception:
        # Don't block local cleanup if auth deletion is unavailable.
        pass

    response = JSONResponse({"ok": True})
    response.delete_cookie("session", path="/")
    return response

@app.post("/auth/signin")
async def auth_signin(request: Request):
    rate_limit(request, "auth-signin", 8, 300)
    payload = await request.json()
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    try:
        result = supabase.auth.sign_in_with_password({"email": email, "password": password})
        user_id = result.user.id
        username = result.user.email.split("@")[0]
        existing = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not existing.data:
            supabase.table("profiles").insert({
                "id": user_id,
                "github_username": username,
                "github_avatar": "",
            }).execute()
        session_token = create_session_token(user_id, username)
        response = JSONResponse({"ok": True})
        response.set_cookie(
            "session",
            session_token,
            httponly=True,
            max_age=SESSION_MAX_AGE_SECONDS,
            samesite="lax",
            secure=SESSION_COOKIE_SECURE,
            path="/",
        )
        return response
    except Exception as e:
        print(f"Sign in error: {e}")
        raise HTTPException(status_code=401, detail=friendly_auth_error(e))   

# STATIC ROUTES


@app.get("/")
async def index(request: Request):
    return FileResponse(WEB_DIR / "index.html")


@app.get("/docs", response_class=HTMLResponse)
async def docs_index(request: Request):
    return FileResponse(WEB_DIR / "docs.html")


@app.get("/docs/{slug}", response_class=HTMLResponse)
async def docs_page(request: Request, slug: str):
    return FileResponse(WEB_DIR / "docs.html")


# API ROUTES


@app.get("/api/status")
async def api_status(request: Request):
    user = require_user(request)
    return {
        "agents": [
            {"id": key, "name": value}
            for key, value in AGENTS.items()
            if key != "human"
        ],
        "modes": MODES,
        "default_rounds": ROUNDS,
        "input_files": list_input_files(user["user_id"]),
        "user": user,
    }

@app.get("/api/inputs")
async def api_inputs(request: Request):
    user = require_user(request)
    return {"files": list_input_files(user["user_id"])}

@app.post("/api/input")
async def api_write_input(request: Request):
    user = require_user(request)
    payload = await request.json()
    name = sanitize_name(payload.get("name") or "web_input.md")
    content = payload.get("content") or ""
    encoding = payload.get("encoding") or "utf-8"

    target_dir = INPUT_DIR / user["user_id"]
    target = safe_relative_path(target_dir, name)
    target.parent.mkdir(parents=True, exist_ok=True)
    if encoding == "base64":
        target.write_bytes(base64.b64decode(content))
    else:
        target.write_text(content, encoding="utf-8")
    return {
        "ok": True,
        "file": {
            "path": str(target.relative_to(target_dir)),
            "size": target.stat().st_size,
        },
    }

@app.delete("/api/input")
async def api_delete_input(request: Request):
    user = require_user(request)
    payload = await request.json()
    name = sanitize_name(payload.get("name") or "")

    target_dir = INPUT_DIR / user["user_id"]
    target = safe_relative_path(target_dir, name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    import shutil
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"ok": True}

@app.post("/api/folders")
async def api_create_folder(request: Request):
    user = require_user(request)
    payload = await request.json()
    name = sanitize_name(payload.get("name") or "")

    target_dir = INPUT_DIR / user["user_id"]
    target = safe_relative_path(target_dir, name)
    target.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "folder": str(target.relative_to(target_dir))}

@app.get("/api/docs")
async def api_docs():
    docs = []
    for slug, (title, path) in DOC_PAGES.items():
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        docs.append({
            "slug": slug,
            "title": title,
            "summary": _doc_summary(content),
            "url": f"/docs/{slug}",
        })
    return {"docs": docs}

@app.get("/api/docs/{slug}")
async def api_doc(slug: str):
    if slug not in DOC_PAGES:
        raise HTTPException(status_code=404, detail="Doc not found")
    title, path = DOC_PAGES[slug]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Doc file not found")
    return {
        "slug": slug,
        "title": title,
        "content": path.read_text(encoding="utf-8"),
    }

@app.delete("/api/inputs/all")
async def api_delete_all_inputs(request: Request):
    import shutil
    user = require_user(request)
    target_dir = INPUT_DIR / user["user_id"]
    if target_dir.exists():
        shutil.rmtree(target_dir)
    return {"ok": True}


@app.get("/api/support")
async def api_support(request: Request):
    user = require_user(request)
    items = _load_support_items()
    if SUPPORT_ADMIN_USERNAME and user.get("github_username") == SUPPORT_ADMIN_USERNAME:
        return {"items": items}
    return {
        "items": [
            item for item in items
            if item.get("user_id") == user["user_id"]
        ]
    }


@app.post("/api/support")
async def api_create_support(request: Request):
    user = require_user(request)
    payload = await request.json()
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message required")

    item = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user["user_id"],
        "github_username": user.get("github_username", ""),
        "contact": (payload.get("contact") or "").strip(),
        "category": (payload.get("category") or "feedback").strip()[:40],
        "subject": (payload.get("subject") or "Support request").strip()[:120],
        "message": message[:4000],
        "page": (payload.get("page") or "").strip()[:80],
    }
    _append_support_item(item)
    return {"ok": True, "item": item}

@app.get("/api/agent-stats")
async def api_agent_stats(request: Request):
    require_user(request)
    from reward import q_manager
    return {"stats": q_manager.get_agent_stats()}

@app.get("/api/sessions")
async def api_sessions(request: Request):
    user = require_user(request)
    result = supabase.table("debates").select("id, topic, mode, created_at, agent_averages").eq("user_id", user["user_id"]).order("created_at", desc=True).limit(20).execute()
    return {"sessions": result.data}

@app.post("/api/validate-key")
async def api_validate_key(request: Request):
    require_user(request)
    payload = await request.json()
    provider = payload.get("provider")
    key = payload.get("key")
    if not key:
        return {"valid": False, "error": "No key provided"}
    
    try:
        if provider == "groq":
            from groq import Groq
            client = Groq(api_key=key, max_retries=0)
            client.models.list()
        elif provider == "google":
            from google import genai
            client = genai.Client(api_key=key)
            client.models.get(model="models/gemini-2.0-flash-lite")
        elif provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=key, max_retries=0)
            client.models.list()
        elif provider in ("kimi", "deepseek"):
            from openai import OpenAI
            base_url = "https://api.moonshot.cn/v1" if provider == "kimi" else "https://api.deepseek.com/v1"
            client = OpenAI(api_key=key, base_url=base_url, max_retries=0)
            client.models.list()
        else:
            return {"valid": False, "error": f"Unknown provider {provider}"}
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.post("/api/jobs/{job_id}/human-input")
async def api_human_input(job_id: str, request: Request):
    user = require_user(request)
    payload = await request.json()
    text = payload.get("text", "").strip()
    
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job.get("user_id") != user["user_id"] or job.get("status") != "human_turn":
            raise HTTPException(status_code=400, detail="Job not waiting for human input")
        
        job["human_input"] = text if text else None
        event = job.get("human_event")
        if event:
            event.set()
            
    return {"ok": True}

@app.post("/api/jobs/{job_id}/interject")
async def api_interject(job_id: str, request: Request):
    user = require_user(request)
    payload = await request.json()
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text required")
        
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job.get("user_id") != user["user_id"] or job.get("status") != "running":
            raise HTTPException(status_code=400, detail="Job not running")
        if "interjections" not in job:
            job["interjections"] = []
        job["interjections"].append(text)
        
    return {"ok": True}

@app.get("/api/reports")
async def api_reports(request: Request):
    user = require_user(request)
    # Get debates from Supabase for this user
    result = supabase.table("debates").select("*").eq("user_id", user["user_id"]).order("created_at", desc=True).execute()
    reports = []
    for debate in result.data:
        artifact = Path(debate["artifact_path"]) if debate.get("artifact_path") else None
        reports.append({
            "name": artifact.name if artifact else debate["id"],
            "id": debate["id"],
            "topic": debate["topic"],
            "mode": debate["mode"],
            "created_at": debate["created_at"],
            "summary": debate["summary"],
        })
    return {"reports": reports}

@app.get("/api/report")
async def api_report(request: Request, name: str):
    user = require_user(request)
    target = report_path_for_user(user["user_id"], name)
    return {
        "name": target.name,
        "content": target.read_text(encoding="utf-8"),
    }

@app.delete("/api/report")
async def api_delete_report(request: Request):
    user = require_user(request)
    payload = await request.json()
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="No report name provided")

    target = report_path_for_user(user["user_id"], name)

    # Delete from Supabase
    supabase.table("debates").delete().eq("user_id", user["user_id"]).eq("artifact_path", str(target)).execute()

    # Delete file
    if target.exists():
        target.unlink()
    return {"ok": True}

@app.get("/api/jobs/{job_id}")
async def api_job(job_id: str, request: Request):
    user = require_user(request)
    return job_for_user(job_id, user["user_id"])

@app.post("/api/run")
async def api_run(request: Request):
    user = require_user(request)
    payload = await request.json()
    job_id = str(uuid.uuid4())

    with JOBS_LOCK:
        JOBS[job_id] = {
            "id": job_id,
            "user_id": user["user_id"],
            "status": "queued",
            "result": None,
            "error": None,
        }

    thread = threading.Thread(
        target=run_job,
        args=(job_id, payload, user),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id}


# JOB RUNNER


def run_job(job_id: str, payload: dict, user: dict):
    with JOBS_LOCK:
        JOBS[job_id]["status"] = "running"
        JOBS[job_id]["transcript"] = []
        JOBS[job_id]["human_event"] = threading.Event()
        JOBS[job_id]["human_input"] = None
        JOBS[job_id]["interjections"] = []

    def on_argument(agent_name, argument):
        with JOBS_LOCK:
            JOBS[job_id]["transcript"].append({
                "agent": agent_name,
                "text": argument,
            })

    def human_input_hook(round_num: int) -> str | None:
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "human_turn"
            JOBS[job_id]["human_event"].clear()
            JOBS[job_id]["human_input"] = None
        
        # Wait for input from API (up to 5 mins)
        JOBS[job_id]["human_event"].wait(timeout=300)
        
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "running"
            return JOBS[job_id]["human_input"]

    def check_interject_hook() -> list:
        with JOBS_LOCK:
            interjections = list(JOBS[job_id]["interjections"])
            JOBS[job_id]["interjections"].clear()
            return interjections

    try:
        selected_agents = payload.get("agents") or ["groq"]
        include_human = "human" in selected_agents
        result = asyncio.run(run_debate(
            topic=payload.get("topic") or None,
            mode=payload.get("mode") or "review",
            include_human=include_human,
            selected_agents=selected_agents,
            rounds=int(payload.get("rounds") or ROUNDS),
            on_argument=on_argument,
            human_input_hook=human_input_hook,
            user_id=user["user_id"],
            check_interject_hook=check_interject_hook,
            goal=payload.get("goal"),
            persona=payload.get("persona"),
        ))

        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "completed",
                "result": result,
            })

        try:
            existing = (
                supabase.table("debates")
                .select("id")
                .eq("user_id", user["user_id"])
                .eq("artifact_path", result["artifact_path"])
                .execute()
            )
            if not existing.data:
                supabase.table("debates").insert({
                    "user_id": user["user_id"],
                    "topic": result["topic"],
                    "mode": result["mode"],
                    "rounds": result["rounds"],
                    "agents": result["agents"],
                    "artifact_path": result["artifact_path"],
                    "summary": result["summary"],
                    "warnings": result["warnings"],
                    "agent_averages": result["agent_averages"],
                }).execute()
        except Exception as exc:
            with JOBS_LOCK:
                JOBS[job_id].setdefault("warnings", []).append(f"Auto-save failed: {exc}")
    except Exception as exc:
        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "failed",
                "error": str(exc),
            })
            

@app.post("/api/save_report/{job_id}")
async def api_save_report(job_id: str, request: Request):
    user = require_user(request)
    job = job_for_user(job_id, user["user_id"], include_private=True)
    
    if not job or job["status"] != "completed" or not job["result"]:
        raise HTTPException(status_code=400, detail="Job not found or not completed")
    
    result = job["result"]
    
    artifact_path = result["artifact_path"]
    existing = (
        supabase.table("debates")
        .select("id")
        .eq("user_id", user["user_id"])
        .eq("artifact_path", artifact_path)
        .execute()
    )

    if not existing.data:
        supabase.table("debates").insert({
            "user_id": user["user_id"],
            "topic": result["topic"],
            "mode": result["mode"],
            "rounds": result["rounds"],
            "agents": result["agents"],
            "artifact_path": artifact_path,
            "summary": result["summary"],
            "warnings": result["warnings"],
            "agent_averages": result["agent_averages"],
        }).execute()
    
    return {"ok": True}


@app.post("/api/repo/clone")
async def api_clone_repo(request: Request):
    user = require_user(request)
    rate_limit(request, "repo-clone", 6, 600)
    payload = await request.json()
    url = payload.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="No URL provided")

    if not is_allowed_github_repo_url(url):
        raise HTTPException(status_code=400, detail="Only github.com HTTPS or SSH URLs are allowed")

    import subprocess, shutil, tempfile

    # Clone into a temp dir then copy all regular files except git metadata.
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            ["git", "clone", "--depth=1", url, tmp],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Clone failed: {result.stderr[:200]}")

        copied = 0
        tmp_path = Path(tmp)
        for src in tmp_path.rglob("*"):
            if not should_copy_cloned_file(src, tmp_path):
                continue
            rel = src.relative_to(tmp_path)
            dest = INPUT_DIR / user["user_id"] / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            copied += 1

    return {"ok": True, "files_copied": copied}


def _local_chat_reply(message: str, context: str, history: list) -> str:
    """
    Lightweight local fallback for chat when no external assistant key is available.
    It stays grounded in the saved report/context and avoids pretending to be a full LLM.
    """
    clean_context = (context or "").strip()
    if not clean_context:
        return (
            "I do not have a report loaded yet.\n\n"
            "Open a saved report or finish a run first, then ask me again. "
            "I can help summarize the findings, pull out follow-up questions, and turn the debate into a concrete plan."
        )

    terms = [
        word for word in re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", message.lower())
        if word not in {"what", "this", "that", "with", "from", "have", "about", "there", "their", "would", "could", "should", "after", "before", "where", "when", "which"}
    ]
    files: list[str] = []
    snippets: list[str] = []
    current_file = None
    for raw_line in clean_context.splitlines():
        line = raw_line.strip()
        file_match = re.match(r"^=== FILE: (.+?) ===$", line)
        if file_match:
            current_file = file_match.group(1)
            if current_file not in files:
                files.append(current_file)
            continue
        if not line:
            continue
        if terms and not any(term in line.lower() for term in terms):
            continue
        if line.startswith("#"):
            snippets.append(f"{current_file or 'Report'}: {line.lstrip('# ').strip()}")
        elif len(line) > 20:
            snippets.append(f"{current_file or 'Report'}: {line[:240]}")
        if len(snippets) >= 4:
            break

    if not snippets:
        for raw_line in clean_context.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("#"):
                snippets.append(line.lstrip("# ").strip())
            elif len(line) > 40:
                snippets.append(line[:240])
            if len(snippets) >= 3:
                break

    history_hint = ""
    if history:
        last_user = next((msg.get("text", "") for msg in reversed(history) if msg.get("role") == "user"), "")
        if last_user and last_user.strip().lower() != message.strip().lower():
            history_hint = f"Your latest prior question was: {last_user.strip()[:180]}\n\n"

    bullets = "\n".join(f"- {snippet}" for snippet in snippets[:4]) if snippets else "- I could not find a tight snippet, so I am answering at the report level."
    files_text = ", ".join(files[:4]) if files else "the loaded report"

    return (
        "I am using the local report-grounded assistant because no external chat key is available.\n\n"
        f"{history_hint}"
        "What the report appears to emphasize:\n"
        f"{bullets}\n\n"
        "What to improve next:\n"
        "- Turn the strongest repeated point into a concrete patch or revision.\n"
        "- Name the exact file, section, or workflow that should change.\n"
        "- Add a verification step so the fix can be checked after it lands.\n\n"
        f"Loaded material: {files_text}\n\n"
        "If you want, ask me for a deeper pass on one file, one section, or one suggested fix."
    )


@app.post("/api/chat")
async def api_chat(request: Request):
    try:
        require_user(request)
        rate_limit(request, "chat", 20, 300)
        payload = await request.json()
        message = payload.get("message", "")
        context = payload.get("context", "")[:4000]
        history = payload.get("history", [])
        groq_key = payload.get("groq_key") or os.environ.get("GROQ_API_KEY", "")

        if not groq_key:
            return JSONResponse({"reply": _local_chat_reply(message, context, history), "mode": "local"})

        from groq import Groq
        client = Groq(api_key=groq_key, timeout=30, max_retries=0)

        messages = [
            {
                "role": "system",
                "content": f"You are a research assistant. Answer questions about this debate report.\n\nREPORT:\n{context}"
            }
        ]
        for msg in history[-6:]:
            messages.append({"role": msg["role"], "content": msg["text"]})
        messages.append({"role": "user", "content": message})

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=800,
        )
        return JSONResponse({"reply": response.choices[0].message.content, "mode": "groq"})
    except Exception as e:
        fallback_reply = _local_chat_reply(message if "message" in locals() else "", context if "context" in locals() else "", history if "history" in locals() else [])
        return JSONResponse({"reply": fallback_reply, "mode": "local", "warning": str(e)})

# ENTRY POINT


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_app:app", host="127.0.0.1", port=8765, reload=True)
