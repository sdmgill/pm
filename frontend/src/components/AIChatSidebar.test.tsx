import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar, type AIChatMessage } from "@/components/AIChatSidebar";

const messages: AIChatMessage[] = [
  { role: "assistant", content: "Hello" },
  { role: "user", content: "Rename backlog" },
];

describe("AIChatSidebar", () => {
  it("renders existing messages", () => {
    render(
      <AIChatSidebar
        messages={messages}
        onSend={async () => undefined}
        isSending={false}
        error={null}
      />
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Rename backlog")).toBeInTheDocument();
  });

  it("submits chat input", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <AIChatSidebar
        messages={messages}
        onSend={onSend}
        isSending={false}
        error={null}
      />
    );

    await userEvent.type(screen.getByLabelText(/chat input/i), "Rename backlog to Planning");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("Rename backlog to Planning");
  });

  it("submits on Enter", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <AIChatSidebar
        messages={messages}
        onSend={onSend}
        isSending={false}
        error={null}
      />
    );

    const input = screen.getByLabelText(/chat input/i);
    await userEvent.type(input, "Rename backlog to Ideas");
    await userEvent.type(input, "{enter}");

    expect(onSend).toHaveBeenCalledWith("Rename backlog to Ideas");
  });

  it("keeps newline on Shift+Enter", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <AIChatSidebar
        messages={messages}
        onSend={onSend}
        isSending={false}
        error={null}
      />
    );

    const input = screen.getByLabelText(/chat input/i);
    await userEvent.type(input, "Line one");
    await userEvent.type(input, "{shift>}{enter}{/shift}");

    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("Line one\n");
  });
});
