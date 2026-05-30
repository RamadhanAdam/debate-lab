# web_app.py
# FastAPI web server with GitHub OAuth, Supabase database, and per-user data.

import asyncio
import json
import mimetypes
import os
import secrets
import threading
import uuid
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
)


# CONFIG


ROOT = Path(__file__).parent
WEB_DIR = ROOT / "web"

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

GITHUB_CLIENT_ID = os.environ["GITHUB_CLIENT_ID"]
GITHUB_CLIENT_SECRET = os.environ["GITHUB_CLIENT_SECRET"]
SESSION_SECRET = os.environ["SESSION_SECRET"]

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


# SUPABASE CLIENT


supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# APP


app = FastAPI()
app.mount("/assets", StaticFiles(directory=str(WEB_DIR / "assets")), name="assets")


# JOBS


JOBS = {}
JOBS_LOCK = threading.Lock()


# SESSION HELPERS


def create_session_token(user_id: str, github_username: str) -> str:
    # Create a signed JWT session token
    payload = {
        "user_id": user_id,
        "github_username": github_username,
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

def require_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


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
    response.set_cookie("oauth_state", state, httponly=True, max_age=600)
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
        max_age=60 * 60 * 24 * 7,  # 7 days
        samesite="lax",
    )
    response.delete_cookie("oauth_state")
    return response

@app.get("/auth/logout")
async def auth_logout():
    response = RedirectResponse("/")
    response.delete_cookie("session")
    return response

@app.get("/auth/me")
async def auth_me(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"authenticated": False})
    return JSONResponse({"authenticated": True, **user})

@app.post("/auth/register")
async def auth_register(request: Request):
    payload = await request.json()
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    try:
        result = supabase.auth.sign_up({"email": email, "password": password})
        return {"ok": True, "message": "Check your email to confirm your account"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/signin")
async def auth_signin(request: Request):
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
            max_age=60*60*24*7,
            samesite="lax",
        )
        return response
    except Exception as e:
        print(f"Sign in error: {e}")
        raise HTTPException(status_code=401, detail="Invalid email or password")   

# STATIC ROUTES


@app.get("/")
async def index(request: Request):
    return FileResponse(WEB_DIR / "index.html")


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
    name = payload.get("name") or "web_input.md"
    content = payload.get("content") or ""
    
    target_dir = INPUT_DIR / user["user_id"]
    target = (target_dir / name).resolve()
    
    if target_dir.resolve() not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    target.parent.mkdir(parents=True, exist_ok=True)
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
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="No file name provided")
        
    target_dir = INPUT_DIR / user["user_id"]
    target = (target_dir / name).resolve()
    
    if target_dir.resolve() not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    target.unlink()
    return {"ok": True}

@app.delete("/api/inputs/all")
async def api_delete_all_inputs(request: Request):
    import shutil
    user = require_user(request)
    target_dir = INPUT_DIR / user["user_id"]
    if target_dir.exists():
        shutil.rmtree(target_dir)
    return {"ok": True}

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
    require_user(request)
    payload = await request.json()
    text = payload.get("text", "").strip()
    
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job.get("status") != "human_turn":
            raise HTTPException(status_code=400, detail="Job not waiting for human input")
        
        job["human_input"] = text if text else None
        event = job.get("human_event")
        if event:
            event.set()
            
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
    require_user(request)
    target = (DEBATES_DIR / name).resolve()
    if DEBATES_DIR.resolve() not in target.parents or not target.exists():
        raise HTTPException(status_code=404, detail="Report not found")
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

    # Delete from Supabase
    supabase.table("debates").delete().eq("user_id", user["user_id"]).eq("artifact_path", str(DEBATES_DIR / name)).execute()

    # Delete file
    target = (DEBATES_DIR / name).resolve()
    if target.exists():
        target.unlink()
    return {"ok": True}

@app.get("/api/jobs/{job_id}")
async def api_job(job_id: str, request: Request):
    require_user(request)
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job:
            job = dict(job)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.post("/api/run")
async def api_run(request: Request):
    user = require_user(request)
    payload = await request.json()
    job_id = str(uuid.uuid4())

    with JOBS_LOCK:
        JOBS[job_id] = {
            "id": job_id,
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
        ))

        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "completed",
                "result": result,
            })
    except Exception as exc:
        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "failed",
                "error": str(exc),
            })
            

@app.post("/api/save_report/{job_id}")
async def api_save_report(job_id: str, request: Request):
    user = require_user(request)
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    
    if not job or job["status"] != "completed" or not job["result"]:
        raise HTTPException(status_code=400, detail="Job not found or not completed")
    
    result = job["result"]
    
    # Save to Supabase
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
    
    return {"ok": True}


@app.post("/api/repo/clone")
async def api_clone_repo(request: Request):
    require_user(request)
    payload = await request.json()
    url = payload.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="No URL provided")

    import subprocess, shutil, tempfile

    # Clone into a temp dir then copy supported files to input/
    supported = {".txt", ".md", ".py", ".ts", ".js", ".json", ".csv"}
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            ["git", "clone", "--depth=1", url, tmp],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Clone failed: {result.stderr[:200]}")

        copied = 0
        for src in Path(tmp).rglob("*"):
            if src.is_file() and src.suffix in supported and ".git" not in src.parts:
                rel = src.relative_to(tmp)
                dest = INPUT_DIR / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
                copied += 1

    return {"ok": True, "files_copied": copied}


@app.post("/api/chat")
async def api_chat(request: Request):
    try:
        require_user(request)
        payload = await request.json()
        message = payload.get("message", "")
        context = payload.get("context", "")[:4000]
        history = payload.get("history", [])
        groq_key = payload.get("groq_key") or os.environ.get("GROQ_API_KEY", "")

        if not groq_key:
            return JSONResponse(status_code=400, content={"error": "Groq API key required for chat"})

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
        return JSONResponse({"reply": response.choices[0].message.content})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ENTRY POINT


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_app:app", host="127.0.0.1", port=8765, reload=True)65, reload=True)