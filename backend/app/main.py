import hashlib
import hmac
import os
import time
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError, model_validator

from app import ai
from app import db

app = FastAPI(title="PM MVP Backend")
STATIC_DIR = Path(__file__).resolve().parent / "static"
DB_PATH = Path(os.getenv("DB_PATH", "/data/pm.db"))
SESSION_COOKIE_NAME = "pm_session"
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
VALID_USERNAME = "user"
VALID_PASSWORD = "password"
USERNAME_PATTERN = r"^[A-Za-z0-9_-]{3,32}$"


class LoginRequest(BaseModel):
  username: str
  password: str


class RegisterRequest(BaseModel):
  username: str = Field(pattern=USERNAME_PATTERN)
  password: str = Field(min_length=6, max_length=128)


class ChangePasswordRequest(BaseModel):
  current_password: str
  new_password: str = Field(min_length=6, max_length=128)


class DeleteAccountRequest(BaseModel):
  password: str


class BoardNameRequest(BaseModel):
  name: str = Field(min_length=1, max_length=80)


class BoardSummary(BaseModel):
  id: int
  name: str
  updated_at: str


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

  @model_validator(mode="after")
  def check_consistency(self) -> "BoardModel":
    column_ids = [column.id for column in self.columns]
    if len(set(column_ids)) != len(column_ids):
      raise ValueError("Column ids must be unique")

    for key, card in self.cards.items():
      if key != card.id:
        raise ValueError(f"Card key {key} does not match card id {card.id}")

    placed_card_ids = [card_id for column in self.columns for card_id in column.cardIds]
    if len(set(placed_card_ids)) != len(placed_card_ids):
      raise ValueError("Each card must appear in exactly one column")
    if set(placed_card_ids) != set(self.cards):
      raise ValueError("Column cardIds must reference exactly the cards in the board")

    return self


class BoardResponse(BaseModel):
  id: int
  name: str
  board: BoardModel
  version: int
  updated_at: str


class UpdateBoardRequest(BaseModel):
  board: BoardModel
  expected_version: int


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
  id: int
  name: str
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
  payload = f"{username}.{int(time.time())}"
  return f"{payload}.{_sign_value(payload)}"


def _get_authenticated_user(cookie_value: str | None) -> str | None:
  if not cookie_value:
    return None

  parts = cookie_value.split(".")
  if len(parts) != 3:
    return None

  username, issued_at, signature = parts
  if not hmac.compare_digest(signature, _sign_value(f"{username}.{issued_at}")):
    return None

  if not issued_at.isdigit() or time.time() - int(issued_at) > SESSION_MAX_AGE_SECONDS:
    return None

  if db.get_user_id(DB_PATH, username) is None:
    return None

  return username


def _require_authenticated_user(
  pm_session: str | None = Cookie(default=None),
) -> int:
  """Return the signed-in user's id, or 401."""
  username = _get_authenticated_user(pm_session)
  user_id = db.get_user_id(DB_PATH, username) if username else None
  if user_id is None:
    raise HTTPException(status_code=401, detail="Not authenticated")
  return user_id


def _require_fixed_columns(current_board: dict[str, object], next_board: BoardModel) -> None:
  current_ids = [column["id"] for column in current_board["columns"]]
  next_ids = [column.id for column in next_board.columns]
  if current_ids != next_ids:
    raise ValueError("Columns are fixed; only column titles can change")


def _set_session_cookie(response: Response, username: str) -> None:
  response.set_cookie(
    key=SESSION_COOKIE_NAME,
    value=_create_session_cookie(username),
    httponly=True,
    samesite="lax",
    secure=False,
    path="/",
    max_age=SESSION_MAX_AGE_SECONDS,
  )


def _load_snapshot(user_id: int, board_id: int | None = None) -> dict[str, object]:
  snapshot = db.get_board_snapshot(DB_PATH, user_id, board_id)
  if not snapshot:
    if board_id is None:
      db.ensure_board(DB_PATH, user_id)
      snapshot = db.get_board_snapshot(DB_PATH, user_id)
    if not snapshot:
      raise HTTPException(status_code=404, detail="Board not found")
  return snapshot


@app.on_event("startup")
def startup() -> None:
  if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET must be set")
  db.init_db(DB_PATH)
  user_id = db.ensure_user(DB_PATH, VALID_USERNAME, VALID_PASSWORD)
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


@app.post("/auth/register", status_code=201)
def auth_register(payload: RegisterRequest, response: Response) -> dict[str, str | bool]:
  try:
    user_id = db.create_user(DB_PATH, payload.username, payload.password)
  except ValueError as exc:
    raise HTTPException(status_code=409, detail=str(exc)) from exc

  db.ensure_board(DB_PATH, user_id)
  _set_session_cookie(response, payload.username)
  return {"authenticated": True, "user": payload.username}


@app.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response) -> dict[str, str | bool]:
  if db.verify_user(DB_PATH, payload.username, payload.password) is None:
    raise HTTPException(status_code=401, detail="Invalid credentials")

  _set_session_cookie(response, payload.username)
  return {"authenticated": True, "user": payload.username}


@app.post("/auth/logout")
def auth_logout(response: Response) -> dict[str, bool]:
  response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
  return {"authenticated": False}


@app.post("/auth/change-password")
def auth_change_password(
  payload: ChangePasswordRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, bool]:
  if not db.check_user_password(DB_PATH, user_id, payload.current_password):
    raise HTTPException(status_code=403, detail="Current password is incorrect")
  db.change_password(DB_PATH, user_id, payload.new_password)
  return {"changed": True}


@app.delete("/auth/account")
def auth_delete_account(
  payload: DeleteAccountRequest,
  response: Response,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, bool]:
  if not db.check_user_password(DB_PATH, user_id, payload.password):
    raise HTTPException(status_code=403, detail="Password is incorrect")
  db.delete_user(DB_PATH, user_id)
  response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
  return {"deleted": True}


def _save_board(
  user_id: int, board_id: int | None, payload: UpdateBoardRequest
) -> dict[str, object]:
  snapshot = _load_snapshot(user_id, board_id)

  try:
    _require_fixed_columns(snapshot["board"], payload.board)
  except ValueError as exc:
    raise HTTPException(status_code=422, detail=str(exc)) from exc

  board_data = payload.board.model_dump(mode="json")

  try:
    write_result = db.save_board_snapshot(
      DB_PATH,
      user_id,
      board_data,
      expected_version=payload.expected_version,
      board_id=int(snapshot["id"]),
    )
  except ValueError as exc:
    raise HTTPException(status_code=409, detail=str(exc)) from exc

  return {
    "id": snapshot["id"],
    "name": snapshot["name"],
    "board": board_data,
    "version": write_result["version"],
    "updated_at": write_result["updated_at"],
  }


def _ai_chat(user_id: int, board_id: int | None, payload: AIChatRequest) -> dict[str, object]:
  snapshot = _load_snapshot(user_id, board_id)
  history_payload = [message.model_dump(mode="json") for message in payload.conversation_history]

  try:
    ai_result = ai.run_kanban_assistant(
      board=snapshot["board"],
      user_message=payload.user_message,
      conversation_history=history_payload,
    )
    structured = AIChatStructuredOutput.model_validate(ai_result)
    if structured.board_update is not None:
      _require_fixed_columns(snapshot["board"], structured.board_update)
  except ai.AIConfigurationError as exc:
    raise HTTPException(status_code=503, detail=str(exc)) from exc
  except (ai.AIResponseFormatError, ValidationError, ValueError) as exc:
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
        board_id=int(snapshot["id"]),
      )
    except ValueError as exc:
      raise HTTPException(status_code=409, detail=str(exc)) from exc

    version = int(write_result["version"])
    updated_at = str(write_result["updated_at"])
    board_updated = True

  return {
    "id": snapshot["id"],
    "name": snapshot["name"],
    "model": str(ai_result.get("model", ai.get_ai_model())),
    "assistant_message": structured.assistant_message,
    "board_updated": board_updated,
    "board": board_payload,
    "version": version,
    "updated_at": updated_at,
  }


# Default-board endpoints (the user's oldest board), kept for the original single-board API.
@app.get("/api/board", response_model=BoardResponse)
def get_board(user_id: int = Depends(_require_authenticated_user)) -> dict[str, object]:
  return _load_snapshot(user_id)


@app.put("/api/board", response_model=BoardResponse)
def update_board(
  payload: UpdateBoardRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  return _save_board(user_id, None, payload)


@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
  payload: AIChatRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  return _ai_chat(user_id, None, payload)


# Multi-board endpoints.
@app.get("/api/boards", response_model=list[BoardSummary])
def list_boards(user_id: int = Depends(_require_authenticated_user)) -> list[dict[str, object]]:
  return db.list_boards(DB_PATH, user_id)


@app.post("/api/boards", response_model=BoardResponse, status_code=201)
def create_board(
  payload: BoardNameRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  board_id = db.create_board(DB_PATH, user_id, payload.name.strip())
  return _load_snapshot(user_id, board_id)


@app.get("/api/boards/{board_id}", response_model=BoardResponse)
def get_board_by_id(
  board_id: int, user_id: int = Depends(_require_authenticated_user)
) -> dict[str, object]:
  return _load_snapshot(user_id, board_id)


@app.put("/api/boards/{board_id}", response_model=BoardResponse)
def update_board_by_id(
  board_id: int,
  payload: UpdateBoardRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  return _save_board(user_id, board_id, payload)


@app.patch("/api/boards/{board_id}", response_model=BoardSummary)
def rename_board(
  board_id: int,
  payload: BoardNameRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  if not db.rename_board(DB_PATH, user_id, board_id, payload.name.strip()):
    raise HTTPException(status_code=404, detail="Board not found")
  return next(b for b in db.list_boards(DB_PATH, user_id) if b["id"] == board_id)


@app.delete("/api/boards/{board_id}")
def delete_board(
  board_id: int, user_id: int = Depends(_require_authenticated_user)
) -> dict[str, bool]:
  _load_snapshot(user_id, board_id)
  if len(db.list_boards(DB_PATH, user_id)) <= 1:
    raise HTTPException(status_code=409, detail="Cannot delete your only board")
  db.delete_board(DB_PATH, user_id, board_id)
  return {"deleted": True}


@app.post("/api/boards/{board_id}/ai/chat", response_model=AIChatResponse)
def ai_chat_by_id(
  board_id: int,
  payload: AIChatRequest,
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, object]:
  return _ai_chat(user_id, board_id, payload)


@app.get("/api/ai/connectivity", response_model=AIConnectivityResponse)
def ai_connectivity_check(
  user_id: int = Depends(_require_authenticated_user),
) -> dict[str, str]:
  _ = user_id

  try:
    return ai.run_connectivity_check("2+2")
  except ai.AIConfigurationError as exc:
    raise HTTPException(status_code=503, detail=str(exc)) from exc
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f"AI connectivity failed: {exc}") from exc


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
