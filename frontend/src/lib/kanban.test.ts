import {
  isCelebrationCooldownElapsed,
  moveCard,
  resolveMoveColumnIds,
  shouldCelebrateDoneMove,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("resolveMoveColumnIds", () => {
  const columns: Column[] = [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-done", title: "Done", cardIds: ["card-2"] },
  ];

  it("returns source and target columns for card drop", () => {
    const result = resolveMoveColumnIds(columns, "card-1", "card-2");
    expect(result).toEqual({ fromColumnId: "col-backlog", toColumnId: "col-done" });
  });

  it("resolves target when dropping directly on a column", () => {
    const result = resolveMoveColumnIds(columns, "card-1", "col-done");
    expect(result).toEqual({ fromColumnId: "col-backlog", toColumnId: "col-done" });
  });
});

describe("shouldCelebrateDoneMove", () => {
  it("celebrates when moving into Done from another column", () => {
    expect(shouldCelebrateDoneMove("col-review", "col-done")).toBe(true);
  });

  it("does not celebrate when moving inside Done", () => {
    expect(shouldCelebrateDoneMove("col-done", "col-done")).toBe(false);
  });
});

describe("isCelebrationCooldownElapsed", () => {
  it("returns false when cooldown window is still active", () => {
    expect(isCelebrationCooldownElapsed(1000, 2600, 2000)).toBe(false);
  });

  it("returns true when cooldown window elapsed", () => {
    expect(isCelebrationCooldownElapsed(1000, 3200, 2000)).toBe(true);
  });
});
