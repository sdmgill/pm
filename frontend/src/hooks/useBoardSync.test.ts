import { act, renderHook, waitFor } from "@testing-library/react";
import { useBoardSync } from "@/hooks/useBoardSync";
import { initialData, type BoardData } from "@/lib/kanban";

const originalFetch = global.fetch;

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const snapshot = (board: BoardData, version: number) => ({
  id: 1,
  name: "My Board",
  board,
  version,
  updated_at: "2026-10-13T00:00:00",
});

const withTitle = (title: string): BoardData => ({
  ...initialData,
  columns: initialData.columns.map((column, index) =>
    index === 0 ? { ...column, title } : column
  ),
});

const requestBody = (fetchMock: ReturnType<typeof vi.fn>, callIndex: number) =>
  JSON.parse((fetchMock.mock.calls[callIndex][1] as RequestInit).body as string);

describe("useBoardSync", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends one save at a time and coalesces edits made while saving", async () => {
    let resolveFirstSave: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(snapshot(initialData, 1)))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFirstSave = resolve)))
      .mockResolvedValueOnce(jsonResponse(snapshot(withTitle("Pla"), 3)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useBoardSync(1));
    await act(() => result.current.reload());

    act(() => {
      result.current.updateBoard(withTitle("P"));
      result.current.updateBoard(withTitle("Pl"));
      result.current.updateBoard(withTitle("Pla"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 1).expected_version).toBe(1);

    await act(async () => {
      resolveFirstSave(jsonResponse(snapshot(withTitle("P"), 2)));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(requestBody(fetchMock, 2).expected_version).toBe(2);
    expect(requestBody(fetchMock, 2).board.columns[0].title).toBe("Pla");
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.board?.columns[0].title).toBe("Pla");
    expect(result.current.error).toBeNull();
  });

  it("reloads the server board on a version conflict", async () => {
    const serverBoard = withTitle("Changed elsewhere");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(snapshot(initialData, 1)))
      .mockResolvedValueOnce(jsonResponse({ detail: "Version mismatch" }, 409))
      .mockResolvedValueOnce(jsonResponse(snapshot(serverBoard, 5)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useBoardSync(1));
    await act(() => result.current.reload());

    act(() => {
      result.current.updateBoard(withTitle("Mine"));
    });

    await waitFor(() => expect(result.current.board).toEqual(serverBoard));
    expect(result.current.error).toMatch(/changed in another session/i);
  });

  it("keeps the local board and reports an error when a save fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(snapshot(initialData, 1)))
      .mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useBoardSync(1));
    await act(() => result.current.reload());

    act(() => {
      result.current.updateBoard(withTitle("Mine"));
    });

    await waitFor(() => expect(result.current.error).toMatch(/unable to save/i));
    expect(result.current.board?.columns[0].title).toBe("Mine");
  });
});
