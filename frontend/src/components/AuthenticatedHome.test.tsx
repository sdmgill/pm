import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthenticatedHome } from "@/components/AuthenticatedHome";
import { initialData } from "@/lib/kanban";

const originalFetch = global.fetch;
const emptyBoard = {
  columns: initialData.columns.map((column) => ({ ...column, cardIds: [] })),
  cards: {},
};
const boardList = [{ id: 1, name: "My Board", updated_at: "2026-09-30T00:00:00" }];
const boardResponse = {
  id: 1,
  name: "My Board",
  board: initialData,
  version: 1,
  updated_at: "2026-09-30T00:00:00",
};

const mockFetch = (responses: Array<{ status: number; body: unknown }>) => {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.status < 400,
      status: response.status,
      json: async () => response.body,
    } as Response);
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe("AuthenticatedHome", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows login form when not authenticated", async () => {
    mockFetch([{ status: 200, body: { authenticated: false, user: null } }]);

    render(<AuthenticatedHome />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("logs in with valid credentials and renders board", async () => {
    mockFetch([
      { status: 200, body: { authenticated: false, user: null } },
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /log out/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
  });

  it("logs out to login screen", async () => {
    const fetchMock = mockFetch([
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
      { status: 200, body: { authenticated: false } },
    ]);

    render(<AuthenticatedHome />);

    const logoutButton = await screen.findByRole("button", { name: /log out/i });
    await userEvent.click(logoutButton);

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation error on rejected credentials", async () => {
    mockFetch([
      { status: 200, body: { authenticated: false, user: null } },
      { status: 401, body: { detail: "Invalid credentials" } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
  });

  it("registers a new account and shows the board", async () => {
    const fetchMock = mockFetch([
      { status: 200, body: { authenticated: false, user: null } },
      { status: 201, body: { authenticated: true, user: "alice" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/signed in as alice/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/auth/register",
      expect.objectContaining({
        body: JSON.stringify({ username: "alice", password: "secret1" }),
      })
    );
  });

  it("explains a taken username", async () => {
    mockFetch([
      { status: 200, body: { authenticated: false, user: null } },
      { status: 409, body: { detail: "Username already taken" } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });

  it("creates a board and switches to it", async () => {
    const fetchMock = mockFetch([
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
      {
        status: 201,
        body: { ...boardResponse, id: 2, name: "Roadmap", board: emptyBoard },
      },
      { status: 200, body: { ...boardResponse, id: 2, name: "Roadmap", board: emptyBoard } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /kanban studio/i });
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("option", { name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Board" })).toHaveValue("2");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/boards/2",
        expect.objectContaining({ method: "GET" })
      )
    );
  });

  it("renames the active board", async () => {
    mockFetch([
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
      { status: 200, body: { id: 1, name: "Planning", updated_at: "2026-09-30T00:00:00" } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /kanban studio/i });
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Planning");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("option", { name: "Planning" })).toBeInTheDocument();
  });

  it("deletes a board after confirmation and falls back to the remaining one", async () => {
    const twoBoards = [...boardList, { id: 2, name: "Second", updated_at: "2026-09-30T00:00:00" }];
    mockFetch([
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: twoBoards },
      { status: 200, body: boardResponse },
      { status: 200, body: { deleted: true } },
      { status: 200, body: [twoBoards[1]] },
      { status: 200, body: { ...boardResponse, id: 2, name: "Second" } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /kanban studio/i });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "My Board" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("combobox", { name: "Board" })).toHaveValue("2");
  });

  it("disables delete when only one board exists", async () => {
    mockFetch([
      { status: 200, body: { authenticated: true, user: "user" } },
      { status: 200, body: boardList },
      { status: 200, body: boardResponse },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /kanban studio/i });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
