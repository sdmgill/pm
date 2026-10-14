# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Business requirements, technical decisions, color scheme and coding standards live in `AGENTS.md` (imported below). Per-area guides are in `frontend/AGENTS.md`, `backend/AGENTS.md` and `scripts/AGENTS.md`. The phased build plan and checklist is `docs/PLAN.md`; the SQLite schema is documented in `docs/DATABASE.md`. Read PLAN.md before starting new work.

@AGENTS.md

## Commands

Run the full app (Docker, serves on http://localhost:8000; requires `.env` copied from `.env.example`):

- Start: `scripts/start.ps1` (Windows), `scripts/start.sh` (Mac/Linux) -- wraps `docker compose up --build -d`
- Stop: `scripts/stop.ps1` / `scripts/stop.sh`

Backend (from `backend/`, uses `uv`):

- All tests: `uv run pytest`
- Single test: `uv run pytest tests/test_board_api.py::test_get_board_requires_auth`
- Real OpenAI smoke test (needs `OPENAI_API_KEY`): set `RUN_OPENAI_SMOKE=1` then run `uv run pytest tests/test_ai_connectivity.py`
- Dev server: `uv run uvicorn app.main:app --reload` (set `DB_PATH` to a local file; the default `/data/pm.db` is the container volume path)

Frontend (from `frontend/`):

- `npm run lint`, `npm run build`
- Unit tests (Vitest, jsdom): `npm run test:unit`; single file: `npx vitest run src/lib/kanban.test.ts`
- E2E (Playwright): `npm run test:e2e`; single test: `npx playwright test -g "<test name>"`

## Architecture

Single container: the Next.js app is built as a static export (`output: "export"` in `next.config.ts`) and the Dockerfile copies `frontend/out` into `backend/app/static`, which FastAPI serves at `/`. There is no Next.js server at runtime, so the frontend can only use client-side code and calls the backend with same-origin relative URLs (`/auth/*`, `/api/*`).

Backend (`backend/app/`):

- `main.py` -- all routes, Pydantic request/response models, and auth. Auth is a fake fixed login (`user`/`password`) issuing an HMAC-signed, expiring httpOnly `pm_session` cookie; `SESSION_SECRET` is required (startup fails without it). Board/AI routes depend on `_require_authenticated_user`. On startup it initializes the DB and ensures the demo user and its board exist.
- `BoardModel` enforces board consistency (every `cardIds` entry exists in `cards`, each card in exactly one column, keys match ids), and `_require_fixed_columns` rejects any change to the column id list. Both apply to `PUT /api/board` (422) and AI updates (502).
- `db.py` -- raw `sqlite3`. Each user has exactly one board stored as a JSON snapshot with an integer `version`; `save_board_snapshot` does optimistic concurrency atomically (`UPDATE ... WHERE version = ?`) with a required `expected_version` (mismatch raises `ValueError`, mapped to HTTP 409).
- `ai.py` -- OpenAI Responses API client (`OPENAI_API_KEY`, `AI_MODEL`). `run_kanban_assistant` sends the current board JSON, chat history and user message using a strict JSON-schema structured output `{assistant_message, board_update}`, where `board_update` is a full replacement board or null. The AI contract represents `cards` as an array (strict mode cannot express maps); `_board_to_ai`/`_board_from_ai` convert to and from the stored map shape. `/api/ai/chat` validates this against the same Pydantic board models before saving; invalid AI output must never mutate the board.

Frontend (`frontend/src/`):

- `lib/kanban.ts` -- the `BoardData` shape (`columns[]` with ordered `cardIds`, plus a `cards` map by id) and move logic. This shape must stay in sync with `BoardModel` in `backend/app/main.py` and with what the AI is told to return.
- `lib/api.ts` -- all `fetch` calls, typed; non-2xx responses throw `ApiError` with the status.
- `hooks/useBoardSync.ts` -- owns the board and its server `version`. Saves are sent one at a time; edits made while a save is in flight are coalesced and sent with the version the previous save returned. A 409 reloads the server board.
- `components/AuthenticatedHome.tsx` -- session check, login/logout and AI chat state; composes `LoginForm`, `KanbanBoard` and `AIChatSidebar`.
- E2E tests run against `next dev` with the backend faked via `page.route()` in `tests/fakeBackend.ts`, which enforces `expected_version` and delays saves so overlapping saves surface as conflicts.

Backend tests use FastAPI `TestClient` and isolate the DB by monkeypatching `main.DB_PATH` to a `tmp_path` file; AI calls are mocked by default.
