import { expect, test } from "@playwright/test";
import { installFakeBackend } from "./fakeBackend";

test("signs in and out", async ({ page }) => {
  const backend = await installFakeBackend(page, { authenticated: false });
  await page.goto("/");

  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  expect(backend.authenticated).toBe(true);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  expect(backend.authenticated).toBe(false);
});

test("rejects invalid credentials", async ({ page }) => {
  await installFakeBackend(page, { authenticated: false });
  await page.goto("/");

  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("loads the kanban board", async ({ page }) => {
  await installFakeBackend(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column and saves it", async ({ page }) => {
  const backend = await installFakeBackend(page);
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();

  await expect
    .poll(() => Object.values(backend.board.cards).map((card) => card.title))
    .toContain("Playwright card");
});

test("moves a card between columns and saves it", async ({ page }) => {
  const backend = await installFakeBackend(page);
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  await targetColumn.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const targetBox = await targetColumn.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 14 });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();

  await expect
    .poll(() => backend.board.columns.find((column) => column.id === "col-discovery")?.cardIds)
    .toContain("card-1");
});

test("saves rapid column title typing without conflicts", async ({ page }) => {
  const backend = await installFakeBackend(page);
  await page.goto("/");
  const titleInput = page.getByTestId("column-col-backlog").getByLabel("Column title");

  await titleInput.fill("");
  await titleInput.pressSequentially("Planning Phase", { delay: 20 });

  await expect.poll(() => backend.board.columns[0].title).toBe("Planning Phase");
  await expect(page.getByText(/saving changes/i)).toHaveCount(0);
  await expect(titleInput).toHaveValue("Planning Phase");
  await expect(page.getByText(/changed in another session/i)).toHaveCount(0);
  expect(backend.conflicts).toBe(0);
});

test("edits a card and keeps the change after reload", async ({ page }) => {
  const backend = await installFakeBackend(page);
  await page.goto("/");
  const card = page.getByTestId("card-card-2");

  await card.getByRole("button", { name: /^edit /i }).click();
  await card.getByLabel("Card title").fill("Edited in e2e");
  await card.getByLabel("Card details").fill("New details");
  await card.getByRole("button", { name: /save/i }).click();

  await expect.poll(() => backend.board.cards["card-2"].title).toBe("Edited in e2e");

  await page.reload();
  const reloadedCard = page.getByTestId("card-card-2");
  await expect(reloadedCard.getByText("Edited in e2e")).toBeVisible();
  await expect(reloadedCard.getByText("New details")).toBeVisible();
});

test("applies AI chat board update", async ({ page }) => {
  const backend = await installFakeBackend(page);
  backend.chatReply = {
    message: "Renamed Backlog to Planning.",
    board: {
      ...backend.board,
      columns: backend.board.columns.map((column) =>
        column.id === "col-backlog" ? { ...column, title: "Planning" } : column
      ),
    },
  };
  await page.goto("/");

  await page.getByLabel("Chat input").fill("rename backlog to Planning");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText(/Renamed Backlog to Planning\./)).toBeVisible();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Planning");
});

test("celebrates when a card moves into Done", async ({ page }) => {
  await installFakeBackend(page);
  await page.goto("/");

  const card = page.getByTestId("card-card-6");
  const doneColumn = page.getByTestId("column-col-done");
  await expect(doneColumn).toBeInViewport();
  const cardBox = await card.boundingBox();
  const doneColumnBox = await doneColumn.boundingBox();
  if (!cardBox || !doneColumnBox) {
    throw new Error("Unable to resolve celebration drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(doneColumnBox.x + doneColumnBox.width / 2, doneColumnBox.y + 120, {
    steps: 14,
  });
  await page.mouse.up();

  await expect(doneColumn.getByTestId("card-card-6")).toBeVisible();
  await expect(doneColumn).toHaveAttribute("data-celebrating", "true");
  await expect(page.getByTestId("done-confetti")).toBeVisible();
});

test("does not celebrate when reordering inside Done", async ({ page }) => {
  await installFakeBackend(page);
  await page.goto("/");

  const doneColumn = page.getByTestId("column-col-done");
  const firstDoneCard = page.getByTestId("card-card-7");
  const secondDoneCard = page.getByTestId("card-card-8");
  await firstDoneCard.dragTo(secondDoneCard);

  await expect(doneColumn).toHaveAttribute("data-celebrating", "false");
  await expect(page.getByTestId("done-confetti")).toHaveCount(0);
});

test("board wraps columns instead of scrolling horizontally", async ({ page }) => {
  for (const width of [900, 1400]) {
    await page.setViewportSize({ width, height: 800 });
    await installFakeBackend(page);
    await page.goto("/");

    await expect(page.getByTestId("column-col-done")).toBeVisible();
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(noOverflow).toBe(true);

    const boxes = await page
      .locator('[data-testid^="column-"]')
      .evaluateAll((els) =>
        els.map((el) => {
          const { left, right } = el.getBoundingClientRect();
          return { left, right };
        })
      );
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
  }
});

test("registers a new account", async ({ page }) => {
  const backend = await installFakeBackend(page, { authenticated: false });
  await page.goto("/");

  await page.getByRole("button", { name: /create one/i }).click();
  await page.getByLabel("Username").fill("newuser");
  await page.getByLabel("Password").fill("secret1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Signed in as newuser")).toBeVisible();
  expect(backend.authenticated).toBe(true);
});

test("creates a second board, keeps cards separate, and renames and deletes it", async ({
  page,
}) => {
  const backend = await installFakeBackend(page);
  await page.goto("/");
  await expect(page.getByTestId("card-card-1")).toBeVisible();

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Roadmap");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("combobox", { name: "Board" })).toHaveValue("2");
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Roadmap card");
  await firstColumn.getByPlaceholder("Details").fill("Only on board two.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect
    .poll(() => Object.values(backend.boards[1].board.cards).map((card) => card.title))
    .toContain("Roadmap card");

  await page.getByRole("combobox", { name: "Board" }).selectOption("1");
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("Roadmap card")).toHaveCount(0);
  expect(Object.keys(backend.boards[0].board.cards)).not.toContain("Roadmap card");

  await page.getByRole("combobox", { name: "Board" }).selectOption("2");
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Board name").fill("Launch plan");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("option", { name: "Launch plan" })).toBeAttached();
  expect(backend.boards[1].name).toBe("Launch plan");

  await page.locator("header").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: /confirm delete/i }).click();
  await expect(page.getByRole("combobox", { name: "Board" })).toHaveValue("1");
  expect(backend.boards).toHaveLength(1);
});
