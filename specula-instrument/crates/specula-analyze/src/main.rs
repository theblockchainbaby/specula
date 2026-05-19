//! `specula-analyze` — the daemon's analyze-mode binding.
//!
//! Reads TSX source on stdin, runs `specula-core` in `Analyze` mode, and prints
//! the source map as JSON on stdout. The daemon spawns this binary, so the
//! daemon and the SWC plugin share exactly one path algorithm — see
//! `specs/identity.md`.
//!
//! Usage: `specula-analyze <logical-file-name> < source.tsx`

use std::io::{self, Read, Write};
use std::process::ExitCode;

use specula_core::{parse_tsx, process, Mode};

fn main() -> ExitCode {
    let file = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "unknown.tsx".to_string());

    let mut source = String::new();
    if let Err(err) = io::stdin().read_to_string(&mut source) {
        eprintln!("specula-analyze: failed to read stdin: {err}");
        return ExitCode::FAILURE;
    }

    let mut parsed = match parse_tsx(&file, &source) {
        Ok(parsed) => parsed,
        Err(err) => {
            eprintln!("specula-analyze: {err}");
            return ExitCode::FAILURE;
        }
    };

    let entries = process(&mut parsed.module, &file, Mode::Analyze);
    let json = match serde_json::to_string(&entries) {
        Ok(json) => json,
        Err(err) => {
            eprintln!("specula-analyze: serialize failed: {err}");
            return ExitCode::FAILURE;
        }
    };

    if writeln!(io::stdout(), "{json}").is_err() {
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
