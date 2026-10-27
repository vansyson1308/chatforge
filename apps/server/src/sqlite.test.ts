import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("runs an in-memory SQLite query using Node", () => {
  const database = new DatabaseSync(":memory:");
  try {
    expect(database.prepare("SELECT 1 + 1 AS result").get()?.result).toBe(2);
  } finally {
    database.close();
  }
});
