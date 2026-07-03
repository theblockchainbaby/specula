import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateToken, persistSession } from "../src/session.js";

test("generateToken produces a unique 256-bit hex token", () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("persistSession writes a readable session file with token and port", () => {
  const root = mkdtempSync(join(tmpdir(), "specula-session-"));
  try {
    const token = generateToken();
    const file = persistSession(root, token, 4123);
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      token: string;
      port: number;
    };
    assert.equal(parsed.token, token);
    assert.equal(parsed.port, 4123);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("persistSession writes the session file owner-only (0600)", () => {
  const root = mkdtempSync(join(tmpdir(), "specula-session-"));
  try {
    const file = persistSession(root, generateToken(), 4123);
    assert.equal(statSync(file).mode & 0o777, 0o600);

    // Re-persisting over a file left loose by an earlier version tightens it.
    chmodSync(file, 0o644);
    persistSession(root, generateToken(), 4124);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
