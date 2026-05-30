import asyncio
import json
import mimetypes
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from debate import run_debate, list_input_files
from debate_config import AGENTS, DEBATES_DIR, INPUT_DIR, MODES, ROUNDS


ROOT = Path(__file__).parent
WEB_DIR = ROOT / "web"
JOBS = {}
JOBS_LOCK = threading.Lock()


def json_response(handler, payload, status=200):
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler, payload, status=200, content_type="text/plain; charset=utf-8"):
    body = payload.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def safe_input_path(relative_path):
    target = (INPUT_DIR / relative_path).resolve()
    if INPUT_DIR.resolve() not in target.parents and target != INPUT_DIR.resolve():
        raise ValueError("Invalid input path.")
    return target


def run_job(job_id, payload):
    with JOBS_LOCK:
        JOBS[job_id]["status"] = "running"

    try:
        selected_agents = payload.get("agents") or ["groq"]
        result = asyncio.run(run_debate(
            topic=payload.get("topic") or None,
            mode=payload.get("mode") or "review",
            include_human=False,
            selected_agents=selected_agents,
            rounds=int(payload.get("rounds") or ROUNDS),
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


class DebateWebHandler(BaseHTTPRequestHandler):
    server_version = "DebateWeb/1.0"

    def log_message(self, format, *args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.serve_static("index.html")
        elif path.startswith("/assets/"):
            self.serve_static(path.removeprefix("/"))
        elif path == "/api/status":
            self.handle_status()
        elif path == "/api/inputs":
            json_response(self, {"files": list_input_files()})
        elif path == "/api/reports":
            self.handle_reports()
        elif path == "/api/report":
            self.handle_report(parse_qs(parsed.query))
        elif path.startswith("/api/jobs/"):
            self.handle_job(path.rsplit("/", 1)[-1])
        else:
            text_response(self, "Not found", 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/input":
            self.handle_write_input()
        elif parsed.path == "/api/run":
            self.handle_run()
        else:
            text_response(self, "Not found", 404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body)

    def serve_static(self, relative_path):
        target = (WEB_DIR / relative_path).resolve()
        if WEB_DIR.resolve() not in target.parents and target != WEB_DIR.resolve():
            text_response(self, "Not found", 404)
            return
        if not target.exists() or not target.is_file():
            text_response(self, "Not found", 404)
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_status(self):
        json_response(self, {
            "agents": [
                {"id": key, "name": value}
                for key, value in AGENTS.items()
                if key != "human"
            ],
            "modes": MODES,
            "default_rounds": ROUNDS,
            "input_files": list_input_files(),
        })

    def handle_reports(self):
        reports = []
        for path in sorted(DEBATES_DIR.glob("debate_*.md"), reverse=True):
            reports.append({
                "name": path.name,
                "path": str(path),
                "modified": path.stat().st_mtime,
                "size": path.stat().st_size,
            })
        json_response(self, {"reports": reports})

    def handle_report(self, query):
        name = query.get("name", [""])[0]
        target = (DEBATES_DIR / name).resolve()
        if DEBATES_DIR.resolve() not in target.parents or not target.exists():
            text_response(self, "Report not found", 404)
            return
        json_response(self, {
            "name": target.name,
            "content": target.read_text(encoding="utf-8"),
        })

    def handle_job(self, job_id):
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job:
                job = dict(job)
        if not job:
            json_response(self, {"error": "Job not found"}, 404)
            return
        json_response(self, job)

    def handle_write_input(self):
        try:
            payload = self.read_json()
            name = payload.get("name") or "web_input.md"
            content = payload.get("content") or ""
            target = safe_input_path(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            json_response(self, {
                "ok": True,
                "file": {
                    "path": str(target.relative_to(INPUT_DIR)),
                    "size": target.stat().st_size,
                },
            })
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 400)

    def handle_run(self):
        try:
            payload = self.read_json()
            job_id = str(uuid.uuid4())
            with JOBS_LOCK:
                JOBS[job_id] = {
                    "id": job_id,
                    "status": "queued",
                    "result": None,
                    "error": None,
                }
            thread = threading.Thread(target=run_job, args=(job_id, payload), daemon=True)
            thread.start()
            json_response(self, {"job_id": job_id})
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 400)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), DebateWebHandler)
    print("Debate web UI running at http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
