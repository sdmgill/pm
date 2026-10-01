# Project Plan and Execution Checklist

This plan is implementation-first and optimized for MVP speed, correctness, and low rework.

## Global decisions (locked)

- AI provider scope for MVP: OpenAI only.
- Model configuration: `AI_MODEL` env var, default `gpt-5.3-codex` for local development.
- Container strategy: multi-stage build, one final runtime image.
- Auth strategy for MVP: server-validated, httpOnly signed cookie session.
- Data strategy for MVP: one board JSON snapshot per user in SQLite.
- API style for MVP: board-level endpoints first (`GET` board, `PUT` board).
- AI safety behavior: strict schema validation; invalid AI output never mutates board.
- AI test strategy: mocked responses by default, optional real-key smoke test behind env flag.

## Part 1: Plan

### Checklist

- [x] Define all parts from scaffold through AI chat.
- [x] Lock architecture and delivery decisions for MVP.
- [x] Add `frontend/AGENTS.md` describing existing frontend structure and conventions.
- [x] Get user approval on plan decisions.

### Tests

- Manual review of this document with user sign-off.

### Success criteria

- Plan is specific enough that each part can be implemented without ambiguous scope.

## Part 2: Scaffolding

### Checklist

- [x] Create backend FastAPI app scaffold in `backend/`.
- [x] Add `/health` API endpoint.
- [x] Add root route serving a temporary static hello-world page.
- [x] Add Python dependency management with `uv` in container build.
- [x] Add root Dockerfile multi-stage build.
- [x] Add compose config for local run.
- [x] Add start and stop scripts for Mac, Linux, and Windows in `scripts/`.

### Tests

- Build image successfully.
- Start container and verify root route returns hello-world HTML.
- Verify `/health` returns JSON success payload.

### Success criteria

- `scripts/start-*` launches app locally in container.
- `scripts/stop-*` stops and removes running app container(s).

## Part 3: Add in Frontend

### Checklist

- [x] Build existing NextJS frontend as static assets.
- [x] Serve built frontend at `/` via FastAPI.
- [x] Preserve API routes under `/api/*` (or configured backend prefix).
- [x] Ensure frontend assets are copied into final container image.

### Tests

- Run frontend unit tests and e2e smoke tests.
- Start container and verify Kanban UI appears at `/`.

### Success criteria

- Frontend renders from backend-served static build inside container.

## Part 4: Fake user sign in experience

### Checklist

- [x] Add `/auth/login` and `/auth/logout` backend routes.
- [x] Validate fixed credentials (`user` / `password`).
- [x] Set and clear signed httpOnly session cookie.
- [x] Gate board APIs behind authenticated session.
- [x] Add frontend login page/flow and logout action.

### Tests

- Backend tests for login success/failure and cookie behavior.
- Frontend tests for redirect/login/logout flow.

### Success criteria

- Unauthenticated user cannot access board data APIs.
- Authenticated user can access board and can log out.

## Part 5: Database modeling

### Checklist

- [x] Create SQLite DB initialization on startup if missing.
- [x] Create `users` table (future-proof multi-user).
- [x] Create `boards` table with JSON payload per user.
- [x] Include `updated_at` and integer `version` fields for safe updates.
- [x] Document schema and rationale in `docs/`.

### Tests

- DB init test for empty startup.
- CRUD tests for read/write board snapshot.

### Success criteria

- Board persists across restarts for each user.

## Part 6: Backend API

### Checklist

- [x] Implement `GET` board endpoint.
- [x] Implement `PUT` board endpoint.
- [x] Validate request/response schemas.
- [x] Enforce auth/session checks.

### Tests

- Unit tests for handlers and service layer.
- Integration tests against SQLite test database.

### Success criteria

- API supports full board read/replace round-trip reliably.

## Part 7: Frontend + Backend integration

### Checklist

- [x] Replace frontend local-only state bootstrapping with API load.
- [x] Persist board edits via backend API.
- [x] Add loading/error states for API calls.

### Tests

- Integration tests for edit and refresh persistence.
- E2E flow validating data survives reload.

### Success criteria

- User interactions update persisted board state in backend DB.

## Part 8: AI connectivity

### Checklist

- [x] Add backend AI client using OpenAI API and env-based model selection.
- [x] Require `OPENAI_API_KEY`; read `AI_MODEL` with local default `gpt-5.3-codex`.
- [x] Implement AI connectivity endpoint/service for a simple prompt.

### Tests

- Mocked unit test for AI client request/response.
- Optional smoke test (`RUN_OPENAI_SMOKE=1`) verifying `2+2` response path with real key.

### Success criteria

- Backend can complete an AI call and return parsed text safely.

## Part 9: AI + Kanban structured outputs

### Checklist

- [x] Define strict JSON schema for AI response payload.
- [x] Send board JSON + user message + chat history to AI.
- [x] Validate response strictly before applying any board updates.
- [x] Apply board update only when schema-valid and semantically safe.

### Tests

- Tests for valid structured output updating board.
- Tests for invalid output being rejected with no board mutation.

### Success criteria

- AI can respond conversationally and optionally produce valid board updates.

## Part 10: AI chat sidebar UI

### Checklist

- [x] Add sidebar chat UI in frontend.
- [x] Show conversation history per current session.
- [x] Submit prompts to backend AI endpoint.
- [x] Auto-apply validated board updates and refresh board state.

### Tests

- Component tests for chat render/send/error states.
- E2E test for chat-triggered board update flow.

### Success criteria

- User can chat with AI and see board refresh when valid updates are returned.

## Part 11: Done celebration animation

### Checklist

- [x] Trigger celebration when a card is moved into Done from a non-Done column.
- [x] Add a brief pulse effect on the Done column and newly completed card.
- [x] Add a short confetti burst tied to the drop action.
- [x] Keep animation duration brief and non-blocking for board interactions.
- [x] Add a cooldown so rapid multi-card moves do not spam confetti.
- [x] Respect reduced-motion preferences with a minimal non-motion fallback.

### Tests

- Unit tests for trigger rules: fires on non-Done -> Done, does not fire for Done -> Done.
- Component tests for pulse/confetti visibility and automatic cleanup.
- E2E test moving a card to Done and asserting celebration marker appears.
- E2E check that rapid repeated moves are throttled by cooldown.

### Success criteria

- Moving a card into Done produces a clear but brief pulse + confetti celebration.
- Celebration does not block drag/drop or card editing interactions.
- Reduced-motion users receive a subtle fallback without motion-heavy effects.