#!/usr/bin/env node
/**
 * `specula` — the Specula command-line entry point.
 *
 * A thin argument parser; each command lives in its own module under `src/`.
 */

import { dev } from "../src/dev.mjs";

const USAGE = `specula — visual editing for a Next.js codebase

Usage:
  specula dev [project]    Start the Specula daemon and \`next dev\` for a
                           project (defaults to the current directory), with
                           the editing overlay auto-injected.

Docs: README.md · docs/how-it-works.md · docs/known-limitations.md`;

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "dev":
    await dev(rest);
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(USAGE);
    break;
  default:
    console.error(`specula: unknown command '${command}'\n`);
    console.error(USAGE);
    process.exit(1);
}
