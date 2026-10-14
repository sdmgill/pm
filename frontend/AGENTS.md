# Frontend Guide

## Overview

The frontend is a NextJS app (App Router) built as a static export (`output: "export"`) and served by the FastAPI backend at `/`. There is no NextJS server at runtime; all code is client-side and talks to the backend with same-origin relative URLs.

- Entry page renders `AuthenticatedHome`, which handles the session, login/logout and AI chat.
- Board state is loaded from and persisted to the backend (`/api/board`).
- Drag and drop is implemented with `@dnd-kit`.

## Key files

- `src/app/page.tsx`: app entry route, renders `AuthenticatedHome`.
- `src/components/AuthenticatedHome.tsx`: session state, login/logout, AI chat state; composes the page.
- `src/components/LoginForm.tsx`: sign-in form.
- `src/hooks/useBoardSync.ts`: board state, server version, single-in-flight save queue, 409 reload.
- `src/lib/api.ts`: typed fetch functions for all backend endpoints; throws `ApiError` on non-2xx.
- `src/components/KanbanBoard.tsx`: board UI, drag/drop handlers, Done celebration (pulse + confetti, cooldown, reduced-motion fallback).
- `src/components/KanbanColumn.tsx`: per-column UI and interactions.
- `src/components/KanbanCard.tsx`: card rendering, inline edit (title/details) and delete. Dragging is disabled while editing.
- `src/components/NewCardForm.tsx`: add-card interaction.
- `src/components/KanbanCardPreview.tsx`: drag-overlay preview.
- `src/components/AIChatSidebar.tsx`: chat sidebar UI (presentational; state lives in `AuthenticatedHome`).
- `src/lib/kanban.ts`: board types, initial data, move logic, celebration trigger rules, ID utility.

## Current behavior

- Login with fixed credentials (`user` / `password`); session is an httpOnly cookie set by the backend.
- Fixed 5-column board with editable column titles.
- Cards can be created, edited, deleted and moved within and across columns.
- Every board change is saved with `PUT /api/board`. Only one save is in flight at a time; later edits are coalesced and sent with the version returned by the previous save. A 409 conflict reloads the latest board.
- AI chat sends the user message and session chat history to `/api/ai/chat`; a returned board update is applied immediately.
- Moving a card into Done from another column triggers a brief celebration.

## E2E backend fake

Playwright runs against `next dev`. `tests/fakeBackend.ts` fakes every backend endpoint with `page.route()`, enforces `expected_version` like the real API, and delays saves so overlapping saves would surface as 409s. Tests assert on the fake's state to check what was persisted.

## Frontend scripts

From `frontend/package.json`:

- `npm run dev`: start local NextJS dev server.
- `npm run build`: production static export to `out/`.
- `npm run lint`: lint via ESLint.
- `npm run test:unit`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright tests.
- `npm run test:all`: run unit + e2e.

## Testing setup

- Unit tests are colocated with code (`*.test.ts`, `*.test.tsx`).
- E2E tests are under `tests/`.
- Test utilities are under `src/test/`.

## Implementation constraints

- Keep existing component structure and visual language intact unless a task requires change.
- Avoid introducing global state libraries for MVP; `AuthenticatedHome` plus `useBoardSync` are sufficient.
- Keep all fetch calls in `src/lib/api.ts`.
- Do not add test-only branches to production components; fake the backend in tests instead.
- Preserve strong typing from `src/lib/kanban.ts`; the `BoardData` shape must match `BoardModel` in `backend/app/main.py`.
