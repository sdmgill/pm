import { useEffect, useState } from "react";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { useBoardSync } from "@/hooks/useBoardSync";
import { api, type ChatMessage } from "@/lib/api";

const initialChatMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi, I can explain your board or update it when you ask. Example: rename backlog to Planning.",
  },
];

// One board with its own sync state and AI chat. Rendered with key={boardId} so that
// switching boards starts from a clean slate and never saves into the wrong board.
export const BoardWorkspace = ({ boardId }: { boardId: number }) => {
  const boardSync = useBoardSync(boardId);
  const { reload, applySnapshot } = boardSync;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatSending, setIsChatSending] = useState(false);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSendChat = async (message: string) => {
    setChatError(null);
    setIsChatSending(true);
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);

    try {
      const payload = await api.sendChat(boardId, message, chatMessages);
      applySnapshot(payload);

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

  const { board, isLoading, isSaving, error } = boardSync;

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-6 pt-2">
        {isLoading ? <p className="text-xs text-[var(--gray-text)]">Loading board...</p> : null}
        {isSaving ? <p className="text-xs text-[var(--gray-text)]">Saving changes...</p> : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
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
