import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card title and details", async () => {
    const onBoardChange = vi.fn();
    render(<KanbanBoard onBoardChange={onBoardChange} />);
    const card = screen.getByTestId("card-card-1");

    await userEvent.click(within(card).getByRole("button", { name: /^edit /i }));
    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited title");
    const detailsInput = within(card).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Edited details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByText("Edited title")).toBeInTheDocument();
    expect(within(card).getByText("Edited details")).toBeInTheDocument();
    const savedBoard = onBoardChange.mock.calls.at(-1)?.[0];
    expect(savedBoard.cards["card-1"]).toMatchObject({
      title: "Edited title",
      details: "Edited details",
    });
  });

  it("cancels a card edit without changes", async () => {
    const onBoardChange = vi.fn();
    render(<KanbanBoard onBoardChange={onBoardChange} />);
    const card = screen.getByTestId("card-card-1");
    const originalTitle = within(card).getByRole("heading").textContent;

    await userEvent.click(within(card).getByRole("button", { name: /^edit /i }));
    await userEvent.type(within(card).getByLabelText("Card title"), " changed");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(within(card).getByRole("heading")).toHaveTextContent(originalTitle ?? "");
    expect(onBoardChange).not.toHaveBeenCalled();
  });
});
