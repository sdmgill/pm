# Code Review

Date: 2026-10-13. Scope: whole repo at commit `ffebe40` (backend, frontend, tests, Docker, scripts).

Baseline: all tests pass (backend 19 passed / 1 skipped, OpenAI smoke test passed, frontend unit 20/20, Playwright 6/6, lint clean). The findings below are issues the current tests do not catch.

Severity: **High** = user-visible bug or data loss; **Medium** = correctness/robustness gap or spec deviation; **Low** = cleanup, consistency, hygiene.

## Remediation status (2026-10-13)

All High and Medium items (1-9, 18) are fixed. Low items (10-17, 19) are open.

| # | Fix | Verified by |
|---|-----|-------------|
| 1 | `useBoardSync` sends one save at a time, coalesces later edits, uses the version from the last response, and no longer overwrites local state with the PUT response | `useBoardSync.test.ts`; e2e "saves rapid column title typing without conflicts" (fails on the old code: saved title was `"n"`) |
| 2 | `BoardModel` consistency validator; `_require_fixed_columns` on PUT (422) and AI updates (502) | New tests in `test_board_api.py` and `test_ai_chat.py` |
| 3 | Root `.dockerignore` | Build context dropped from 586 MB to 3 kB |
| 4 | `expected_version` required; single `UPDATE ... WHERE version = ?` | `test_put_board_requires_expected_version`, `test_put_board_rejects_stale_version_after_save` |
| 5 | Strict `json_schema` structured output passed to OpenAI; cards as an array in the AI contract, converted back server-side | `test_ai_assistant.py`; live AI chat call against the running container |
| 6 | Inline card editing (title/details) | `KanbanBoard.test.tsx`; e2e "edits a card and keeps the change after reload" |
| 7 | `SESSION_SECRET` required at startup; cookie carries a signed issue time and expires after 7 days (`max_age` set) | New tests in `test_auth.py` |
| 8 | `backend/uv.lock` committed; Dockerfile uses `uv sync --frozen --no-dev` | Docker build |
| 9 | Demo-mode branches removed; e2e uses a `page.route()` fake backend (`tests/fakeBackend.ts`) that enforces versions | Playwright suite (10 tests) |
| 18 | `AuthenticatedHome` split into `lib/api.ts`, `hooks/useBoardSync.ts`, `LoginForm.tsx` | Unit and e2e suites |

## Summary of actions

| # | Severity | Area | Action |
|---|----------|------|--------|
| 1 | High | Frontend | Serialize/debounce board saves so rapid edits do not 409 and get reverted |
| 2 | High | Backend | Semantically validate boards (AI and PUT) so dangling card IDs cannot crash the UI |
| 3 | High | Infra | Add `.dockerignore` so host `node_modules`/`.venv` are not copied into the image |
| 4 | Medium | Backend | Make the versioned write atomic (`UPDATE ... WHERE version = ?`) and require `expected_version` |
| 5 | Medium | Backend | Use the OpenAI structured-output schema (currently dead code) or delete it |
| 6 | Medium | Frontend | Add card editing (title/details), a stated business requirement |
| 7 | Medium | Backend | Require a real `SESSION_SECRET` outside tests |
| 8 | Medium | Infra | Commit `backend/uv.lock` and build with `uv sync --frozen` |
| 9 | Medium | Tests | Move local demo logic out of the production component; add e2e coverage against the real backend |
| 10 | Low | Backend | Close SQLite connections; stop calling `ensure_user`/`ensure_board` on every request |
| 11 | Low | Backend | Replace deprecated `@app.on_event("startup")` with a lifespan handler |
| 12 | Low | Backend | Normalize `main.py` to 4-space indentation |
| 13 | Low | Backend | Constrain `ConversationMessage.role` and limit message/history size |
| 14 | Low | Backend | Move `pytest` to a dev dependency group |
| 15 | Low | Frontend | Remove the unused local-board fallback and pointless `useMemo` in `KanbanBoard` |
| 16 | Low | Repo | Untrack `frontend/test-results/`; share backend test fixtures via `conftest.py` |
| 17 | Low | Frontend | Minor UX: hardcoded "Signed in as user", AI-chat 409 shown as generic failure |
| 18 | Medium | Frontend | Split `AuthenticatedHome.tsx` into login form, board-sync hook and API module |
| 19 | Low | Backend | Light split of `main.py`: board models and auth into their own modules |

## High

### 1. Rapid board edits trigger version conflicts and revert the user's input

`frontend/src/components/AuthenticatedHome.tsx:160-199`, `frontend/src/components/KanbanColumn.tsx:53`

Column rename calls `onRename` on every keystroke, and `handleBoardChange` fires a `PUT /api/board` per change using `boardVersionRef.current` as `expected_version`. The ref is only updated when a response returns, so a second keystroke typed before the first response sends the same stale version. The server returns 409, the client shows "Board changed in another session" and calls `loadBoard()`, which replaces the board with the server copy and discards the newer keystrokes. Separately, a slow earlier response can call `applyBoardSnapshot` after a newer local edit and overwrite it with older board state.

The same happens with any two edits in quick succession (for example, two fast drags).

Action:
- Keep one save in flight at a time: queue the latest pending board and send it when the current request completes (latest-wins), always using the version from the last successful response.
- Do not overwrite local `board` with the PUT response body; only update the version.
- Optionally debounce column-title saves (for example, save on blur or after ~400 ms idle).
- Add a unit test that fires two changes before the first fetch resolves and asserts no 409/reload.

### 2. Boards are only shape-validated; inconsistent boards crash the UI

`backend/app/main.py:28-42`, `backend/app/main.py:251-265`, `frontend/src/components/KanbanBoard.tsx:289`

`BoardModel` checks types but not consistency. A board (from the AI or a PUT) can have `cardIds` that reference missing cards, a `cards` key that differs from the card's `id`, a card in two columns, duplicate column IDs, or added/removed/renamed-ID columns. PLAN.md Part 9 requires updates to be "schema-valid and semantically safe"; only the first half is implemented.

Concrete failure: if the AI returns a column whose `cardIds` include an ID not present in `cards`, it is saved, and `KanbanBoard` passes `undefined` to `KanbanCard`, which throws on `card.id`. With no error boundary the whole page goes blank on every load until the DB is fixed by hand.

The business requirement is "fixed columns that can be renamed", but nothing stops the AI from deleting or re-IDing columns, which would also silently break the Done celebration (`DONE_COLUMN_ID = "col-done"`).

Action:
- Add a Pydantic `model_validator` on `BoardModel` enforcing: every `cardIds` entry exists in `cards`; each card appears in exactly one column; `cards` keys equal `card.id`; no orphan cards; column IDs unique.
- In `/api/ai/chat` (and `PUT`), reject updates whose column ID set/order differs from the stored board.
- Add backend tests for each rejected case, asserting the board version is unchanged.

### 3. Docker build copies host `node_modules` and `.venv` into the image

`Dockerfile:8-9`, `Dockerfile:20`, no `.dockerignore`

The build context is ~586 MB. `COPY frontend ./` runs after `npm ci` and copies the host's (Windows) `node_modules` over the Linux-installed one; `COPY backend ./` copies any host `.venv`. Builds currently succeed because COPY merges rather than replaces, but platform-specific binaries can be overwritten, and builds are slow.

Action: add a root `.dockerignore`:

```
**/node_modules
**/.venv
**/__pycache__
**/.pytest_cache
frontend/.next
frontend/out
frontend/test-results
.git
.env
validation-cookies.txt
```

## Medium

### 4. Optimistic locking is optional and not atomic

`backend/app/main.py:53`, `backend/app/db.py:152-187`

- `expected_version` defaults to `None`, and a `None` skips the version check, so any client can overwrite blindly.
- `save_board_snapshot` reads the version, compares in Python, then updates. Two concurrent requests can both read version N and both succeed, the second silently overwriting the first.

Action: require `expected_version: int`, and do the check in SQL: `UPDATE boards SET ... , version = version + 1 WHERE user_id = ? AND version = ?`; if `rowcount == 0`, raise the conflict. This also removes the extra SELECTs.

### 5. Structured-output schema is defined but never used

`backend/app/ai.py:55-106`, `backend/app/ai.py:154-161`

`_structured_output_schema()` is never called. The Responses API call relies on prompt instructions alone, so the model can return prose, fenced JSON, or extra keys, each producing a 502. PLAN.md says "Define strict JSON schema for AI response payload".

Action: pass the schema via `text={"format": {"type": "json_schema", "name": "kanban_response", "schema": ..., "strict": True}}`. Strict mode does not support free-form `additionalProperties` maps, so represent `cards` as an array of card objects in the AI contract and convert back to the map server-side. If that is not wanted, delete the dead function.

### 6. Cards cannot be edited

`frontend/src/components/KanbanCard.tsx`

AGENTS.md requires that cards "can be moved with drag and drop, and edited". The UI only supports add, delete and move; the title and details of an existing card can only be changed through the AI.

Action: add inline edit (for example, click title/details to edit, save on blur/Enter) wired through a `handleEditCard` in `KanbanBoard`, with unit and e2e tests.

### 7. Session cookie can be forged with the default secret

`backend/app/main.py:18`, `backend/app/main.py:86-110`, `compose.yaml`, `.env.example`

`SESSION_SECRET` falls back to the hardcoded `"local-dev-session-secret"`, and neither `.env.example` nor compose sets it, so every deployment uses the public default. The token is `username.HMAC(username)`, deterministic and non-expiring; logout only clears the browser cookie, so a copied cookie works forever.

Acceptable for a local MVP, but cheap to tighten.

Action: add `SESSION_SECRET` to `.env.example`, fail startup if it is unset (tests can set it), and set `max_age` on the cookie. Embedding an issued-at timestamp in the signed value would let the server enforce expiry.

### 8. Python dependencies are not locked

`backend/pyproject.toml`, `Dockerfile:20`

There is no `uv.lock`, so `uv sync` resolves to whatever is newest at build time (the last build pulled `openai 3.29.0` against a `>=1.109.1` floor, and `pytest 9.1.1`). A breaking upstream release can break the image with no code change.

Action: run `uv lock`, commit `backend/uv.lock`, and use `uv sync --frozen --no-dev` in the Dockerfile.

### 9. Production component contains test-only demo logic; e2e never exercises the backend

`frontend/src/components/AuthenticatedHome.tsx:28`, `:69-74`, `:91-93`, `:163-166`, `:208-239`, `frontend/playwright.config.ts`

`NEXT_PUBLIC_USE_LOCAL_DEMO_AUTH` adds branches throughout `AuthenticatedHome`, including a regex-based fake AI ("rename backlog to X"). This is test scaffolding shipped in the production bundle, and it means the Playwright suite never touches auth, persistence, version conflicts, or the real chat endpoint. Bug 1 above would be caught by an e2e test against the real backend.

Action: remove the demo branches. Either run Playwright against the Docker app (`baseURL: http://localhost:8000`, log in as part of the test) or mock the API in Playwright with `page.route()`. Mock `/api/ai/chat` responses in e2e rather than embedding a fake AI in the app.

### 18. `AuthenticatedHome.tsx` does too much

`frontend/src/components/AuthenticatedHome.tsx` (387 lines)

One component owns the session check, login/logout, the login form markup, board load/save with version tracking and conflict handling, AI chat state and requests, and all the demo-mode branches. Every `fetch` lives here. This is where item 1 lives, and the save logic is hard to test in isolation because it is tangled with auth and chat state.

Action:
- `src/lib/api.ts`: thin typed functions for `/auth/*`, `/api/board` and `/api/ai/chat` (response types move here).
- `src/hooks/useBoardSync.ts`: owns `board`, the version, loading/saving/error state and the single-in-flight save queue from item 1. Expose `board`, `updateBoard`, `applySnapshot`, `reload` and status flags. Unit-test it directly.
- `src/components/LoginForm.tsx`: the sign-in form markup and its local state.
- `AuthenticatedHome` keeps session state and chat state and composes the pieces.
- Do this together with items 1 and 9; removing the demo branches (item 9) alone removes ~50 lines.

## Low

### 10. SQLite connection handling

`backend/app/db.py:63-68`, all `with connect_db(...)` uses; `backend/app/main.py:167-168`, `:182-183`, `:223-224`

`with sqlite3.connect(...)` only commits/rolls back; it does not close the connection, so each call leaks a connection until garbage collection. Each request also opens three or more connections because `ensure_user` and `ensure_board` run on every board/chat request even though startup already guarantees both.

Action: use `contextlib.closing(connect_db(...))` (or a small context manager that commits and closes). Resolve the user ID once (for example, in the auth dependency) and drop the per-request `ensure_*` calls.

### 11. Deprecated startup hook

`backend/app/main.py:122`

FastAPI warns `on_event is deprecated`. Action: move startup logic into a `lifespan` async context manager passed to `FastAPI(lifespan=...)`.

### 12. Mixed indentation in `main.py`

`backend/app/main.py`

Most of the file uses 2-space indentation; `health()` and the static-mount block use 4 spaces; `db.py` and `ai.py` use 4. Action: reformat `main.py` to 4 spaces (for example, with `ruff format`), and consider adding `ruff` for lint/format.

### 13. Unbounded and loosely typed chat input

`backend/app/main.py:62-69`, `backend/app/ai.py:132-149`

`ConversationMessage.role` is any string, and history is flattened into `role: content` text, so a client can inject fake `system:` lines. There is no limit on message length or history size, so a long session grows the prompt (and cost) without bound.

Action: type `role` as `Literal["user", "assistant"]`, pass history as real message items in the `input` list rather than flattened text, and cap history (for example, the last 20 messages) and message length with `Field(max_length=...)`.

### 14. `pytest` is a runtime dependency

`backend/pyproject.toml:10`

Action: move it to `[dependency-groups] dev`. The Docker image already uses `--no-dev`; backend tests would then run locally with `uv run pytest` (or in CI) rather than inside the production image. Update `backend/AGENTS.md` accordingly.

### 15. Dead code in `KanbanBoard`

`frontend/src/components/KanbanBoard.tsx:65-86`, `:94`

`board` and `onBoardChange` are optional with an `initialData`-backed `localBoard` fallback, left over from the pre-backend demo; the only caller always passes both. `cardsById` is a `useMemo` that returns the same reference it reads. Action: make the props required, remove `localBoard`/`updateBoard` indirection and the memo. Adjust `KanbanBoard.test.tsx` to pass a board.

### 16. Repo and test hygiene

- `frontend/test-results/.last-run.json` is committed. Add `/test-results/` and `/playwright-report/` to `frontend/.gitignore` and `git rm --cached` it.
- The `client` fixture and `login` helper are copy-pasted across `backend/tests/test_ai_chat.py`, `test_board_api.py`, and others. Move them to `backend/tests/conftest.py`.
- Default board data is duplicated in `backend/app/db.py` (`DEFAULT_BOARD_DATA`) and `frontend/src/lib/kanban.ts` (`initialData`). Once the demo mode is removed (item 9), `initialData` is only needed by tests and can move to test fixtures.
- No frontend tests cover the save path (`PUT`, 409 reload, save error). Add them alongside the fix for item 1.

### 17. Minor UX

- `AuthenticatedHome.tsx:348` hardcodes "Signed in as user"; use the `user` value from `/auth/me` or the login response.
- If the user edits the board while an AI request is in flight, the AI's write gets a 409 and the chat shows the generic "AI request failed". Show a specific message and reload the board on 409.
- Drag and drop has only a `PointerSensor`; add dnd-kit's `KeyboardSensor` for keyboard accessibility.

### 19. `main.py` mixes models, auth and routes

`backend/app/main.py` (~300 lines)

At its current size the file is readable, but it holds 12 Pydantic models, cookie signing and the auth dependency, and all routes. Items 2, 11 and 13 all add to it. The board models are the shared data contract used by `PUT /api/board`, `/api/ai/chat` and the AI schema, and are easier to find and test on their own.

Action (keep it light; no routers/services layering):
- `app/models.py`: `CardModel`, `ColumnModel`, `BoardModel` (with the item 2 validator) and the request/response models.
- `app/auth.py`: `SESSION_SECRET`, credentials, `_sign_value`, `_create_session_cookie`, `_get_authenticated_user`, `_require_authenticated_user`.
- `main.py`: app creation, lifespan, routes, static mount.
- Tests that monkeypatch `main.DB_PATH` keep working; update any that reference `main.VALID_USERNAME` to the new module.

## Suggested order

1. Items 1 and 2 (user-visible bugs), each with tests. Do item 18 as part of the item 1 fix, and item 19 as part of the item 2 fix.
2. Items 3, 8, 14 (build reproducibility; small, mechanical).
3. Items 4, 5, 7 (backend robustness).
4. Item 9, then item 6 with real-backend e2e coverage.
5. Low-severity cleanups.
