import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AuthMeResponse = {
  authenticated: boolean;
  user: string | null;
};

export type BoardSnapshot = {
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
  logout: () => request<{ authenticated: false }>("/auth/logout", { method: "POST" }),
  getBoard: () => request<BoardSnapshot>("/api/board", { method: "GET" }),
  saveBoard: (board: BoardData, expectedVersion: number) =>
    postJson<BoardSnapshot>(
      "/api/board",
      { board, expected_version: expectedVersion },
      "PUT"
    ),
  sendChat: (userMessage: string, history: ChatMessage[]) =>
    postJson<AIChatResponse>("/api/ai/chat", {
      user_message: userMessage,
      conversation_history: history,
    }),
};
