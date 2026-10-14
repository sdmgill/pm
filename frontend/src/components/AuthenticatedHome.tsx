"use client";

import { useEffect, useState } from "react";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { useBoardSync } from "@/hooks/useBoardSync";
import { api, ApiError, type ChatMessage } from "@/lib/api";

const initialChatMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi, I can explain your board or update it when you ask. Example: rename backlog to Planning.",
  },
];

export const AuthenticatedHome = () => {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatSending, setIsChatSending] = useState(false);
  const boardSync = useBoardSync();
  const { reload: reloadBoard } = boardSync;

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await api.me();
        setIsAuthenticated(session.authenticated);
      } catch {
        setAuthError("Unable to connect to authentication service.");
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void reloadBoard();
    }
  }, [isAuthenticated, reloadBoard]);

  const handleLogin = async (username: string, password: string) => {
    setAuthError(null);
    try {
      await api.login(username, password);
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(
        error instanceof ApiError && error.status === 401
          ? "Invalid username or password."
          : "Unable to sign in right now."
      );
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout network errors and still clear UI state for safety.
    }

    setIsAuthenticated(false);
    setAuthError(null);
    boardSync.reset();
    setChatMessages(initialChatMessages);
    setChatError(null);
    setIsChatSending(false);
  };

  const handleSendChat = async (message: string) => {
    setChatError(null);
    setIsChatSending(true);
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);

    try {
      const payload = await api.sendChat(message, chatMessages);
      boardSync.applySnapshot(payload);

      const updateSuffix = payload.board_updated
        ? " I applied the board update automatically."
        : "";
      setChatMessages([
        ...nextMessages,
        { role: "assistant", content: `${payload.assistant_message}${updateSuffix}` },
      ]);
    } catch {
      setChatError("AI request failed. Please try again.");
    } finally {
      setIsChatSending(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[640px] items-center justify-center px-6">
        <p className="text-sm text-[var(--gray-text)]">Checking session...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} error={authError} />;
  }

  const { board, isLoading, isSaving, error: boardError } = boardSync;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--stroke)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--navy-dark)]">Signed in as user</p>
            {isLoading ? (
              <p className="text-xs text-[var(--gray-text)]">Loading board...</p>
            ) : null}
            {isSaving ? (
              <p className="text-xs text-[var(--gray-text)]">Saving changes...</p>
            ) : null}
            {boardError ? <p className="text-xs text-red-700">{boardError}</p> : null}
          </div>
          <button
            className="rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)]"
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </div>
      </header>
      {!board ? (
        <main className="mx-auto flex min-h-[60vh] max-w-[640px] items-center justify-center px-6">
          <p className="text-sm text-[var(--gray-text)]">Loading board...</p>
        </main>
      ) : (
        <div className="lg:flex lg:items-start lg:gap-4">
          <div className="min-w-0 flex-1">
            <KanbanBoard board={board} onBoardChange={boardSync.updateBoard} />
          </div>
          <AIChatSidebar
            messages={chatMessages}
            onSend={handleSendChat}
            isSending={isChatSending}
            error={chatError}
          />
        </div>
      )}
    </>
  );
};
