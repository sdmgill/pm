import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthenticatedHome } from "@/components/AuthenticatedHome";
import { initialData } from "@/lib/kanban";

const originalFetch = global.fetch;
const boardResponse = {
  board: initialData,
  version: 1,
  updated_at: "2026-09-30T00:00:00",
};

const mockFetch = (responses: Array<{ ok: boolean; body: unknown }>) => {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
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
    mockFetch([{ ok: true, body: { authenticated: false, user: null } }]);

    render(<AuthenticatedHome />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("logs in with valid credentials and renders board", async () => {
    mockFetch([
      { ok: true, body: { authenticated: false, user: null } },
      { ok: true, body: { authenticated: true, user: "user" } },
      { ok: true, body: boardResponse },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
  });

  it("logs out to login screen", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { authenticated: true, user: "user" } },
      { ok: true, body: boardResponse },
      { ok: true, body: { authenticated: false } },
    ]);

    render(<AuthenticatedHome />);

    const logoutButton = await screen.findByRole("button", { name: /log out/i });
    await userEvent.click(logoutButton);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation error on rejected credentials", async () => {
    mockFetch([
      { ok: true, body: { authenticated: false, user: null } },
      { ok: false, body: { detail: "Invalid credentials" } },
    ]);

    render(<AuthenticatedHome />);

    await screen.findByRole("heading", { name: /sign in/i });
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
  });
});
