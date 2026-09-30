# Frontend Guide (Existing Code)

## Overview

The frontend is a NextJS app (App Router) that currently runs as a client-side Kanban demo.

- Entry page renders `KanbanBoard` from `src/components/KanbanBoard.tsx`.
- Board data is in-memory using `initialData` from `src/lib/kanban.ts`.
- Drag and drop is implemented with `@dnd-kit`.
- There is no backend integration yet in this frontend code.

## Key files

- `src/app/page.tsx`: app entry route, renders the board.
- `src/components/KanbanBoard.tsx`: primary board state + drag/drop handlers.
- `src/components/KanbanColumn.tsx`: per-column UI and interactions.
- `src/components/KanbanCard.tsx`: card rendering and delete action.
- `src/components/NewCardForm.tsx`: add-card interaction.
- `src/components/KanbanCardPreview.tsx`: drag-overlay preview.
- `src/lib/kanban.ts`: board types, initial data, move logic, ID utility.

## Current behavior

- Fixed 5-column board with editable column titles.
- Cards can be moved within and across columns.
- Cards can be created and deleted.
- All changes are local (React state) and reset on refresh.

## Frontend scripts

From `frontend/package.json`:

- `npm run dev`: start local NextJS dev server.
- `npm run build`: production build.
- `npm run start`: run built app.
- `npm run lint`: lint via ESLint.
- `npm run test:unit`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright tests.
- `npm run test:all`: run unit + e2e.

## Testing setup

- Unit tests are colocated with code (`*.test.ts`, `*.test.tsx`).
- E2E tests are under `tests/`.
- Test utilities are under `src/test/`.

## Implementation constraints for upcoming work

- Keep existing component structure and visual language intact unless a task requires change.
- Avoid introducing global state libraries for MVP; current local-first structure is sufficient.
- When backend integration starts, add a small API layer rather than scattering fetch calls through components.
- Preserve strong typing from `src/lib/kanban.ts` and evolve types in place.
