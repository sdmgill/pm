"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIChatSidebarProps = {
  messages: AIChatMessage[];
  onSend: (message: string) => Promise<void>;
  isSending: boolean;
  error: string | null;
};

export const AIChatSidebar = ({
  messages,
  onSend,
  isSending,
  error,
}: AIChatSidebarProps) => {
  const [draft, setDraft] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const sendDraft = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    setDraft("");
    await onSend(message);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendDraft();
  };

  const handleTextareaKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendDraft();
    }
  };

  return (
    <>
      <button
        className="fixed bottom-4 right-4 z-40 rounded-full border border-[var(--stroke)] bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] lg:hidden"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        AI Chat
      </button>

      <aside
        className={[
          "fixed right-0 top-0 z-30 h-screen w-full max-w-[380px] border-l border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full",
          "lg:sticky lg:top-[82px] lg:z-10 lg:mr-4 lg:mt-6 lg:h-[calc(100vh-110px)] lg:w-[300px] lg:max-w-none lg:flex-shrink-0 lg:translate-x-0 lg:rounded-[28px] lg:border lg:bg-white lg:shadow-[var(--shadow)]",
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          <header className="border-b border-[var(--stroke)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              AI Assistant
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
              Board Copilot
            </h2>
            <p className="mt-2 text-xs text-[var(--gray-text)]">
              Ask questions or request board updates. Changes are applied automatically when valid.
            </p>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" data-testid="ai-chat-messages">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={[
                  "rounded-2xl px-3 py-2 text-sm leading-6",
                  message.role === "assistant"
                    ? "mr-8 border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                    : "ml-8 bg-[var(--primary-blue)] text-white",
                ].join(" ")}
              >
                {message.content}
              </div>
            ))}
            {isSending ? (
              <p className="text-xs text-[var(--gray-text)]" data-testid="ai-chat-sending">
                Thinking...
              </p>
            ) : null}
          </div>

          <form className="border-t border-[var(--stroke)] p-4" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-chat-input">
              Chat input
            </label>
            <textarea
              id="ai-chat-input"
              className="h-24 w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm"
              placeholder="Try: rename backlog to Planning"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isSending}
            />
            {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
            <button
              className="mt-3 w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSending || draft.trim().length === 0}
              type="submit"
            >
              Send
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
