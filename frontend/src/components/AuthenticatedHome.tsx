"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { BoardWorkspace } from "@/components/BoardWorkspace";
import { LoginForm } from "@/components/LoginForm";
import { api, ApiError, type BoardSummary } from "@/lib/api";

export const AuthenticatedHome = () => {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [user, setUser] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await api.me();
        setUser(session.authenticated ? session.user : null);
      } catch {
        setAuthError("Unable to connect to authentication service.");
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const loadBoards = useCallback(async () => {
    try {
      const list = await api.listBoards();
      setBoards(list);
      setActiveBoardId((current) =>
        list.some((board) => board.id === current) ? current : (list[0]?.id ?? null)
      );
    } catch {
      setBoardsError("Unable to load your boards right now.");
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadBoards();
    }
  }, [user, loadBoards]);

  const authenticate = async (
    action: (username: string, password: string) => Promise<{ user: string | null }>,
    username: string,
    password: string,
    failureMessage: (error: unknown) => string
  ) => {
    setAuthError(null);
    try {
      const session = await action(username, password);
      setUser(session.user);
    } catch (error) {
      setAuthError(failureMessage(error));
    }
  };

  const handleLogin = (username: string, password: string) =>
    authenticate(api.login, username, password, (error) =>
      error instanceof ApiError && error.status === 401
        ? "Invalid username or password."
        : "Unable to sign in right now."
    );

  const handleRegister = (username: string, password: string) =>
    authenticate(api.register, username, password, (error) => {
      if (error instanceof ApiError && error.status === 409) {
        return "That username is already taken.";
      }
      if (error instanceof ApiError && error.status === 422) {
        return "Username must be 3-32 letters, numbers, - or _, and password at least 6 characters.";
      }
      return "Unable to create the account right now.";
    });

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout network errors and still clear UI state for safety.
    }

    setUser(null);
    setAuthError(null);
    setBoards([]);
    setActiveBoardId(null);
    setBoardsError(null);
  };

  const runBoardAction = async (action: () => Promise<void>) => {
    setBoardsError(null);
    try {
      await action();
    } catch {
      setBoardsError("Board action failed. Please try again.");
    }
  };

  const handleCreateBoard = (name: string) =>
    runBoardAction(async () => {
      const created = await api.createBoard(name);
      setBoards((current) => [
        ...current,
        { id: created.id, name: created.name, updated_at: created.updated_at },
      ]);
      setActiveBoardId(created.id);
    });

  const handleRenameBoard = (name: string) =>
    runBoardAction(async () => {
      if (activeBoardId === null) {
        return;
      }
      const renamed = await api.renameBoard(activeBoardId, name);
      setBoards((current) =>
        current.map((board) => (board.id === renamed.id ? renamed : board))
      );
    });

  const handleDeleteBoard = () =>
    runBoardAction(async () => {
      if (activeBoardId === null) {
        return;
      }
      await api.deleteBoard(activeBoardId);
      await loadBoards();
    });

  if (isCheckingSession) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[640px] items-center justify-center px-6">
        <p className="text-sm text-[var(--gray-text)]">Checking session...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} onRegister={handleRegister} error={authError} />;
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--stroke)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--navy-dark)]">Signed in as {user}</p>
            {boardsError ? <p className="text-xs text-red-700">{boardsError}</p> : null}
          </div>
          {activeBoardId !== null ? (
            <BoardSwitcher
              boards={boards}
              activeBoardId={activeBoardId}
              onSelect={setActiveBoardId}
              onCreate={handleCreateBoard}
              onRename={handleRenameBoard}
              onDelete={handleDeleteBoard}
            />
          ) : null}
          <button
            className="rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)]"
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </div>
      </header>
      {activeBoardId === null ? (
        <main className="mx-auto flex min-h-[60vh] max-w-[640px] items-center justify-center px-6">
          <p className="text-sm text-[var(--gray-text)]">Loading board...</p>
        </main>
      ) : (
        <BoardWorkspace key={activeBoardId} boardId={activeBoardId} />
      )}
    </>
  );
};
