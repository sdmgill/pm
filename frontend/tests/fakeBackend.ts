import type { Page, Route } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";

// In-page fake of the FastAPI backend. Board saves enforce expected_version like the
// real API and are delayed, so overlapping saves surface as 409 conflicts.
export type FakeBoard = {
  id: number;
  name: string;
  board: BoardData;
  version: number;
};

export type FakeBackendState = {
  authenticated: boolean;
  boards: FakeBoard[];
  // The first board, kept as direct fields for the original single-board tests.
  board: BoardData;
  version: number;
  conflicts: number;
  chatReply: { message: string; board: BoardData | null };
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export const installFakeBackend = async (
  page: Page,
  { authenticated = true, saveDelayMs = 150 } = {}
) => {
  const first: FakeBoard = {
    id: 1,
    name: "My Board",
    board: structuredClone(initialData),
    version: 1,
  };
  const state: FakeBackendState = {
    authenticated,
    boards: [first],
    conflicts: 0,
    chatReply: { message: "No changes needed.", board: null },
    get board() {
      return first.board;
    },
    get version() {
      return first.version;
    },
  };
  const users = new Map([["user", "password"]]);
  let nextBoardId = 2;

  const snapshot = (b: FakeBoard) => ({
    id: b.id,
    name: b.name,
    board: b.board,
    version: b.version,
    updated_at: "2026-10-13T00:00:00",
  });
  const findBoard = (url: string) =>
    state.boards.find((b) => b.id === Number(url.split("/api/boards/")[1].split("/")[0]));

  await page.route("**/auth/me", (route) =>
    json(route, { authenticated: state.authenticated, user: state.authenticated ? "user" : null })
  );

  await page.route("**/auth/login", (route) => {
    const { username, password } = route.request().postDataJSON();
    if (users.get(username) !== password) {
      return json(route, { detail: "Invalid credentials" }, 401);
    }
    state.authenticated = true;
    return json(route, { authenticated: true, user: username });
  });

  await page.route("**/auth/register", (route) => {
    const { username, password } = route.request().postDataJSON();
    if (users.has(username)) {
      return json(route, { detail: "Username already taken" }, 409);
    }
    users.set(username, password);
    state.authenticated = true;
    return json(route, { authenticated: true, user: username }, 201);
  });

  await page.route("**/auth/logout", (route) => {
    state.authenticated = false;
    return json(route, { authenticated: false });
  });

  await page.route(/\/api\/boards$/, async (route) => {
    if (route.request().method() === "GET") {
      return json(
        route,
        state.boards.map((b) => ({ id: b.id, name: b.name, updated_at: "2026-10-13T00:00:00" }))
      );
    }
    const { name } = route.request().postDataJSON();
    const created: FakeBoard = {
      id: nextBoardId++,
      name,
      board: {
        columns: initialData.columns.map((column) => ({ ...column, cardIds: [] })),
        cards: {},
      },
      version: 1,
    };
    state.boards.push(created);
    return json(route, snapshot(created), 201);
  });

  await page.route(/\/api\/boards\/\d+$/, async (route) => {
    const target = findBoard(route.request().url());
    if (!target) {
      return json(route, { detail: "Board not found" }, 404);
    }
    const method = route.request().method();

    if (method === "GET") {
      return json(route, snapshot(target));
    }
    if (method === "PATCH") {
      target.name = route.request().postDataJSON().name;
      return json(route, { id: target.id, name: target.name, updated_at: "2026-10-13T00:00:00" });
    }
    if (method === "DELETE") {
      state.boards.splice(state.boards.indexOf(target), 1);
      return json(route, { deleted: true });
    }

    const { board, expected_version } = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
    if (expected_version !== target.version) {
      state.conflicts += 1;
      return json(route, { detail: "Version mismatch" }, 409);
    }
    target.board = board;
    target.version += 1;
    return json(route, snapshot(target));
  });

  await page.route(/\/api\/boards\/\d+\/ai\/chat$/, (route) => {
    const target = findBoard(route.request().url());
    if (!target) {
      return json(route, { detail: "Board not found" }, 404);
    }
    const { message, board } = state.chatReply;
    if (board) {
      target.board = board;
      target.version += 1;
    }
    return json(route, {
      model: "fake-model",
      assistant_message: message,
      board_updated: Boolean(board),
      ...snapshot(target),
    });
  });

  return state;
};
