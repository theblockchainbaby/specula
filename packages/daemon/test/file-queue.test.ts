import { test } from "node:test";
import assert from "node:assert/strict";
import { FileQueue } from "../src/file-queue.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("same-file work runs strictly in queue order", async () => {
  const queue = new FileQueue();
  const order: number[] = [];
  const first = queue.run("page.tsx", async () => {
    await delay(20);
    order.push(1);
  });
  const second = queue.run("page.tsx", async () => {
    await delay(1);
    order.push(2);
  });
  await Promise.all([first, second]);
  // The second task is faster but still waits for the first.
  assert.deepEqual(order, [1, 2]);
});

test("a rejection does not break later work on the same file", async () => {
  const queue = new FileQueue();
  const failed = queue.run("page.tsx", async () => {
    throw new Error("boom");
  });
  await assert.rejects(failed, /boom/);
  const after = await queue.run("page.tsx", async () => "ok");
  assert.equal(after, "ok");
});

test("different files are not serialized against each other", async () => {
  const queue = new FileQueue();
  const order: string[] = [];
  const slow = queue.run("a.tsx", async () => {
    await delay(20);
    order.push("a");
  });
  const fast = queue.run("b.tsx", async () => {
    await delay(1);
    order.push("b");
  });
  await Promise.all([slow, fast]);
  // b finished first — it was not blocked by a's work on a different file.
  assert.deepEqual(order, ["b", "a"]);
});
