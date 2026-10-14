import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AuthMeResponse = {
  authenticated: boolean;
  user: string | null;
};

export type BoardSummary = {
  id: number;
  name: string;
  updated_at: string;
};

export type BoardSnapshot = {
  id: number;
  name: string;
  board: BoardData;
  version: number;
  updated_at: string;
};

export type AIChatResponse = BoardSnapshot & {
  model: string;
  assistant_message: string;
  board_updated: boolean;
};

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed with status ${status}`);
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return (await response.json()) as T;
};

const postJson = <T>(path: string, body: unknown, method = "POST") =>
  request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  me: () => request<AuthMeResponse>("/auth/me", { method: "GET" }),
  login: (username: string, password: string) =>
    postJson<AuthMeResponse>("/auth/login", { username, password }),
  register: (username: string, password: string) =>
    postJson<AuthMeResponse>("/auth/register", { username, password }),
  logout: () => request<{ authenticated: false }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    postJson<{ changed: true }>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  deleteAccount: (password: string) =>
    postJson<{ deleted: true }>("/auth/account", { password }, "DELETE"),
  listBoards: () => request<BoardSummary[]>("/api/boards", { method: "GET" }),
  createBoard: (name: string) => postJson<BoardSnapshot>("/api/boards", { name }),
  renameBoard: (boardId: number, name: string) =>
    postJson<BoardSummary>(`/api/boards/${boardId}`, { name }, "PATCH"),
  deleteBoard: (boardId: number) =>
    request<{ deleted: true }>(`/api/boards/${boardId}`, { method: "DELETE" }),
  getBoard: (boardId: number) =>
    request<BoardSnapshot>(`/api/boards/${boardId}`, { method: "GET" }),
  saveBoard: (boardId: number, board: BoardData, expectedVersion: number) =>
    postJson<BoardSnapshot>(
      `/api/boards/${boardId}`,
      { board, expected_version: expectedVersion },
      "PUT"
    ),
  sendChat: (boardId: number, userMessage: string, history: ChatMessage[]) =>
    postJson<AIChatResponse>(`/api/boards/${boardId}/ai/chat`, {
      user_message: userMessage,
      conversation_history: history,
    }),
};
