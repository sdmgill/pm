import { expect, test } from "@playwright/test";

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  await card.dragTo(targetColumn);
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("applies AI chat board update", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Chat input").fill("rename backlog to Planning");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("Updated backlog title to Planning.")).toBeVisible();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Planning");
});

test("celebrates when a card moves into Done", async ({ page }) => {
  await page.goto("/");

  const card = page.getByTestId("card-card-6");
  const doneColumn = page.getByTestId("column-col-done");
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
  await page.goto("/");

  const doneColumn = page.getByTestId("column-col-done");
  const firstDoneCard = page.getByTestId("card-card-7");
  const secondDoneCard = page.getByTestId("card-card-8");
  await firstDoneCard.dragTo(secondDoneCard);

  await expect(doneColumn).toHaveAttribute("data-celebrating", "false");
  await expect(page.getByTestId("done-confetti")).toHaveCount(0);
});
