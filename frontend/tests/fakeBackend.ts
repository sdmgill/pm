import type { Page, Route } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";

// In-page fake of the FastAPI backend. Board saves enforce expected_version like the
// real API and are delayed, so overlapping saves surface as 409 conflicts.
export type FakeBackendState = {
  authenticated: boolean;
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
  const state: FakeBackendState = {
    authenticated,
    board: structuredClone(initialData),
    version: 1,
    conflicts: 0,
    chatReply: { message: "No changes needed.", board: null },
  };

  const snapshot = () => ({
    board: state.board,
    version: state.version,
    updated_at: "2026-10-13T00:00:00",
  });

  await page.route("**/auth/me", (route) =>
    json(route, { authenticated: state.authenticated, user: state.authenticated ? "user" : null })
  );

  await page.route("**/auth/login", (route) => {
    const { username, password } = route.request().postDataJSON();
    if (username !== "user" || password !== "password") {
      return json(route, { detail: "Invalid credentials" }, 401);
    }
    state.authenticated = true;
    return json(route, { authenticated: true, user: "user" });
  });

  await page.route("**/auth/logout", (route) => {
    state.authenticated = false;
    return json(route, { authenticated: false });
  });

  await page.route("**/api/board", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, snapshot());
    }

    const { board, expected_version } = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
    if (expected_version !== state.version) {
      state.conflicts += 1;
      return json(route, { detail: "Version mismatch" }, 409);
    }
    state.board = board;
    state.version += 1;
    return json(route, snapshot());
  });

  await page.route("**/api/ai/chat", (route) => {
    const { message, board } = state.chatReply;
    if (board) {
      state.board = board;
      state.version += 1;
    }
    return json(route, {
      model: "fake-model",
      assistant_message: message,
      board_updated: Boolean(board),
      ...snapshot(),
    });
  });

  return state;
};
