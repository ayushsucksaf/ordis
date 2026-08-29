# import judge0
# result = judge0.run(source_code="print(f'hello, {input()}')", stdin="Alice", language=judge0.PYTHON)
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path

#--------------------------------------------------------------------

from .executor import run_python, run_cpp, run_javascript
from .terminal_ws import pty_terminal

from google import genai
from .agent import make_tools

import uuid
import os
from dotenv import load_dotenv
load_dotenv()
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
# this is for demo purposes only, we will be using a self hosted open source model in production



app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
SESSIONS_ROOT = BASE_DIR / "sessions"
def resolve_session_dir(session_id: str) -> Path:
    return SESSIONS_ROOT / session_id

@app.get("/")
async def serve_frontend():
    return FileResponse(BASE_DIR / "index.html")


RUNNERS = {
    "python3": run_python,
    "cpp": run_cpp,
    "javascript": run_javascript,
}

# @app.post("/code/run")
# async def run_code(payload: dict):
#     language = payload.get("language")
#     code = payload.get("source_code", "")
#     stdin = payload.get("stdin", "")

#     runner = RUNNERS.get(language)
#     if not runner:
#         return {"error": f"Unsupported language: {language}"}

#     return await runner(code, stdin)

@app.post("/code/run")
async def run_code(payload: dict):

    session_id = payload.get("session_id")
    filename = payload.get("filename")
    language = payload.get("language")
    stdin = payload.get("stdin", "")

    # print("[1] session_id:", session_id)
    # print("[2] filename:", filename)
    # print("[3] language:", language)
    # print("[4] stdin:", repr(stdin))

    session_dir = resolve_session_dir(session_id)
    file_path = session_dir / filename

    # print("[5] file_path:", file_path)

    if not file_path.exists():
        # print("[ERROR] File does not exist")
        return {"error": "File not found"}

    code = file_path.read_text()

    # print("[6] source_code:", repr(code))

    runner = RUNNERS.get(language)

    # print("[7] runner:", runner)

    if not runner:
        return {"error": f"Unsupported language: {language}"}

    # print("[8] Calling runner...")

    result = await runner(code, stdin)

    # print("[9] result:", repr(result))

    return result

@app.websocket("/terminal")
async def terminal_endpoint(websocket: WebSocket):
    await pty_terminal(websocket, SESSIONS_ROOT)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/agent/chat")
async def agent_chat(payload: dict):
    session_dir = resolve_session_dir(payload.get("session_id"))
    message = payload.get("message")

    response = gemini_client.models.generate_content(
        model="gemini-3.6-flash",
        contents=message,
        config={
            "tools": make_tools(session_dir),
            "system_instruction": (
                "You are a coding assistant embedded in a mobile IDE. "
                "You have read_file, write_file, and list_files tools scoped "
                "to the user's current project. When asked to fix, add, or "
                "edit code, actually call write_file to make the change — "
                "don't just describe it in text."
            ),
        },
    )
    return {"reply": response.text}

# TEMP: quick way to get a project folder + session_id without /git/clone
# built yet. Just makes an empty folder and hands you the id.
@app.post("/session/create")
async def create_session():
    session_id = str(uuid.uuid4())
    os.makedirs(os.path.join(SESSIONS_ROOT, session_id), exist_ok=True)
    return {"session_id": session_id}

# TEMP: bare read/write so the test page can edit a file before running it.
@app.get("/files/read")
async def files_read(session_id: str, path: str):
    session_dir = resolve_session_dir(session_id)
    full = os.path.join(session_dir, path)
    if not os.path.exists(full):
        return {"content": ""}
    with open(full) as f:
        return {"content": f.read()}

@app.post("/files/write")
async def files_write(payload: dict):
    session_dir = resolve_session_dir(payload["session_id"])
    full = os.path.join(session_dir, payload["path"])
    os.makedirs(os.path.dirname(full) or session_dir, exist_ok=True)
    with open(full, "w") as f:
        f.write(payload["content"])
    return {"ok": True}

@app.post("/voice/transcribe")
async def voice_transcribe():
    try:
        result = subprocess.run(
            ["termux-speech-to-text"],
            capture_output=True, text=True, timeout=15,
        )
        # it can print partial matches as it listens, so take the last
        # non-empty line as the actual final transcript
        lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
        text = lines[-1] if lines else ""
        return {"text": text}
    except FileNotFoundError:
        return {"error": "termux-speech-to-text not found — only works inside Termux with Termux:API installed."}
    except subprocess.TimeoutExpired:
        return {"error": "Listening timed out."}