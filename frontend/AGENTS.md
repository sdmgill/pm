# Frontend Guide

## Overview

The frontend is a NextJS app (App Router) built as a static export (`output: "export"`) and served by the FastAPI backend at `/`. There is no NextJS server at runtime; all code is client-side and talks to the backend with same-origin relative URLs.

- Entry page renders `AuthenticatedHome`, which handles login, board loading/saving and AI chat.
- Board state is loaded from and persisted to the backend (`/api/board`).
- Drag and drop is implemented with `@dnd-kit`.

## Key files

- `src/app/page.tsx`: app entry route, renders `AuthenticatedHome`.
- `src/components/AuthenticatedHome.tsx`: auth state, login/logout, board load and save, AI chat requests. All `fetch` calls live here.
- `src/components/KanbanBoard.tsx`: board UI, drag/drop handlers, Done celebration (pulse + confetti, cooldown, reduced-motion fallback).
- `src/components/KanbanColumn.tsx`: per-column UI and interactions.
- `src/components/KanbanCard.tsx`: card rendering and delete action.
- `src/components/NewCardForm.tsx`: add-card interaction.
- `src/components/KanbanCardPreview.tsx`: drag-overlay preview.
- `src/components/AIChatSidebar.tsx`: chat sidebar UI (presentational; state lives in `AuthenticatedHome`).
- `src/lib/kanban.ts`: board types, initial data, move logic, celebration trigger rules, ID utility.

## Current behavior

- Login with fixed credentials (`user` / `password`); session is an httpOnly cookie set by the backend.
- Fixed 5-column board with editable column titles.
- Cards can be created, deleted and moved within and across columns.
- Every board change is saved with `PUT /api/board` using the last known `version`; a 409 conflict reloads the latest board.
- AI chat sends the user message and session chat history to `/api/ai/chat`; a returned board update is applied immediately.
- Moving a card into Done from another column triggers a brief celebration.

## Local demo mode

`NEXT_PUBLIC_USE_LOCAL_DEMO_AUTH=1` makes the app skip backend auth and keep board/chat changes in local state. Playwright sets this so e2e tests run against `next dev` without the backend.

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
- Avoid introducing global state libraries for MVP; local state in `AuthenticatedHome` is sufficient.
- Keep API calls in `AuthenticatedHome` rather than scattering fetch calls through components.
- Preserve strong typing from `src/lib/kanban.ts`; the `BoardData` shape must match `BoardModel` in `backend/app/main.py`.
