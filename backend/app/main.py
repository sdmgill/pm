import hashlib
import hmac
import os
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError

from app import ai
from app import db

app = FastAPI(title="PM MVP Backend")
STATIC_DIR = Path(__file__).resolve().parent / "static"
DB_PATH = Path(os.getenv("DB_PATH", "/data/pm.db"))
SESSION_COOKIE_NAME = "pm_session"
SESSION_SECRET = os.getenv("SESSION_SECRET", "local-dev-session-secret")
VALID_USERNAME = "user"
VALID_PASSWORD = "password"


class LoginRequest(BaseModel):
  username: str
  password: str


class CardModel(BaseModel):
  id: str
  title: str
  details: str


class ColumnModel(BaseModel):
  id: str
  title: str
  cardIds: list[str]


class BoardModel(BaseModel):
  columns: list[ColumnModel]
  cards: dict[str, CardModel]


class BoardResponse(BaseModel):
  board: BoardModel
  version: int
  updated_at: str


class UpdateBoardRequest(BaseModel):
  board: BoardModel
  expected_version: int | None = None


class AIConnectivityResponse(BaseModel):
  model: str
  prompt: str
  answer: str


class ConversationMessage(BaseModel):
  role: str
  content: str


class AIChatRequest(BaseModel):
  user_message: str
  conversation_history: list[ConversationMessage] = []


class AIChatStructuredOutput(BaseModel):
  assistant_message: str
  board_update: BoardModel | None = None


class AIChatResponse(BaseModel):
  model: str
  assistant_message: str
  board_updated: bool
  board: BoardModel
  version: int
  updated_at: str


def _sign_value(value: str) -> str:
  return hmac.new(
    SESSION_SECRET.encode("utf-8"), value.encode("utf-8"), hashlib.sha256
  ).hexdigest()


def _create_session_cookie(username: str) -> str:
  signature = _sign_value(username)
  return f"{username}.{signature}"


def _get_authenticated_user(cookie_value: str | None) -> str | None:
  if not cookie_value or "." not in cookie_value:
    return None

  username, signature = cookie_value.rsplit(".", 1)
  expected_signature = _sign_value(username)

  if not hmac.compare_digest(signature, expected_signature):
    return None

  if username != VALID_USERNAME:
    return None

  return username


def _require_authenticated_user(
  pm_session: str | None = Cookie(default=None),
) -> str:
  username = _get_authenticated_user(pm_session)
  if not username:
    raise HTTPException(status_code=401, detail="Not authenticated")
  return username


@app.on_event("startup")
def startup() -> None:
  db.init_db(DB_PATH)
  user_id = db.ensure_user(DB_PATH, VALID_USERNAME)
  db.ensure_board(DB_PATH, user_id)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/me")
def auth_me(pm_session: str | None = Cookie(default=None)) -> dict[str, str | bool | None]:
  username = _get_authenticated_user(pm_session)
  if not username:
    return {"authenticated": False, "user": None}
  return {"authenticated": True, "user": username}


@app.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response) -> dict[str, str | bool]:
  if payload.username != VALID_USERNAME or payload.password != VALID_PASSWORD:
    raise HTTPException(status_code=401, detail="Invalid credentials")

  session_cookie = _create_session_cookie(payload.username)
  response.set_cookie(
    key=SESSION_COOKIE_NAME,
    value=session_cookie,
    httponly=True,
    samesite="lax",
    secure=False,
    path="/",
  )
  return {"authenticated": True, "user": payload.username}


@app.post("/auth/logout")
def auth_logout(response: Response) -> dict[str, bool]:
  response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
  return {"authenticated": False}


@app.get("/api/board", response_model=BoardResponse)
def get_board(username: str = Depends(_require_authenticated_user)) -> dict[str, object]:
  user_id = db.ensure_user(DB_PATH, username)
  db.ensure_board(DB_PATH, user_id)
  snapshot = db.get_board_snapshot(DB_PATH, user_id)

  if not snapshot:
    raise HTTPException(status_code=500, detail="Board data is unavailable")

  return snapshot


@app.put("/api/board", response_model=BoardResponse)
def update_board(
  payload: UpdateBoardRequest,
  username: str = Depends(_require_authenticated_user),
) -> dict[str, object]:
  user_id = db.ensure_user(DB_PATH, username)
  db.ensure_board(DB_PATH, user_id)

  board_data = payload.board.model_dump(mode="json")

  try:
    write_result = db.save_board_snapshot(
      DB_PATH,
      user_id,
      board_data,
      expected_version=payload.expected_version,
    )
  except ValueError as exc:
    raise HTTPException(status_code=409, detail=str(exc)) from exc

  return {
    "board": board_data,
    "version": write_result["version"],
    "updated_at": write_result["updated_at"],
  }


@app.get("/api/ai/connectivity", response_model=AIConnectivityResponse)
def ai_connectivity_check(
  username: str = Depends(_require_authenticated_user),
) -> dict[str, str]:
  _ = username

  try:
    return ai.run_connectivity_check("2+2")
  except ai.AIConfigurationError as exc:
    raise HTTPException(status_code=503, detail=str(exc)) from exc
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f"AI connectivity failed: {exc}") from exc


@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
  payload: AIChatRequest,
  username: str = Depends(_require_authenticated_user),
) -> dict[str, object]:
  user_id = db.ensure_user(DB_PATH, username)
  db.ensure_board(DB_PATH, user_id)

  snapshot = db.get_board_snapshot(DB_PATH, user_id)
  if not snapshot:
    raise HTTPException(status_code=500, detail="Board data is unavailable")

  history_payload = [message.model_dump(mode="json") for message in payload.conversation_history]

  try:
    ai_result = ai.run_kanban_assistant(
      board=snapshot["board"],
      user_message=payload.user_message,
      conversation_history=history_payload,
    )
    structured = AIChatStructuredOutput.model_validate(ai_result)
  except ai.AIConfigurationError as exc:
    raise HTTPException(status_code=503, detail=str(exc)) from exc
  except (ai.AIResponseFormatError, ValidationError) as exc:
    raise HTTPException(status_code=502, detail=f"Invalid AI structured output: {exc}") from exc
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f"AI chat failed: {exc}") from exc

  board_payload = snapshot["board"]
  version = int(snapshot["version"])
  updated_at = str(snapshot["updated_at"])
  board_updated = False

  if structured.board_update is not None:
    board_payload = structured.board_update.model_dump(mode="json")
    try:
      write_result = db.save_board_snapshot(
        DB_PATH,
        user_id,
        board_payload,
        expected_version=version,
      )
    except ValueError as exc:
      raise HTTPException(status_code=409, detail=str(exc)) from exc

    version = int(write_result["version"])
    updated_at = str(write_result["updated_at"])
    board_updated = True

  return {
    "model": str(ai_result.get("model", ai.get_ai_model())),
    "assistant_message": structured.assistant_message,
    "board_updated": board_updated,
    "board": board_payload,
    "version": version,
    "updated_at": updated_at,
  }


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def root() -> str:
        return """
        <!doctype html>
        <html lang=\"en\">
          <head>
            <meta charset=\"utf-8\" />
            <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
            <title>PM MVP Backend</title>
          </head>
          <body>
            <h1>PM MVP backend is running</h1>
            <p>Frontend static assets were not found in backend/app/static.</p>
            <p>Try <a href=\"/health\">/health</a> for an API response.</p>
          </body>
        </html>
        """
