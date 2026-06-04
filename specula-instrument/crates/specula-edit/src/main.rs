//! `specula-edit` — applies a Tier-A edit to TSX source.
//!
//! Reads a JSON request on stdin, plans the edit with `specula-core`, and
//! splices it into the *original* source — every byte outside the edit is
//! preserved, so the result is a minimal diff, not a reformatted file. Writes a
//! JSON response on stdout. Verbs: `edit-text`, `set-class`, `replace-asset`.
//!
//! Usage: `specula-edit <logical-file-name>` with the request on stdin.
//!
//! A refused edit (target not found / not editable) is a valid answer:
//! `{ "ok": false, "reason": ... }` with exit code 0. A hard error (bad JSON,
//! unparseable source, unknown verb) also prints `{ "ok": false, ... }` but
//! exits non-zero.

use std::io::{self, Read, Write};
use std::process::ExitCode;

use serde::{Deserialize, Serialize};
use specula_core::{
    locate, parse_tsx, plan_attr_edit, plan_delete, plan_duplicate, plan_move, plan_text_edit,
    plan_unwrap, plan_wrap, Splice,
};

#[derive(Deserialize)]
struct EditRequest {
    /// The file's current source.
    source: String,
    /// The edit verb: `edit-text`, `set-class`, or `replace-asset`.
    verb: String,
    /// Structural path of the target element.
    path: String,
    /// The new value — the text, the final class string, or the `src`.
    value: String,
}

#[derive(Serialize)]
struct EditResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

fn main() -> ExitCode {
    let file = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "unknown.tsx".to_string());

    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return hard_error("failed to read stdin");
    }

    let request: EditRequest = match serde_json::from_str(&input) {
        Ok(request) => request,
        Err(err) => return hard_error(&format!("invalid request json: {err}")),
    };

    match plan(&file, &request) {
        Err(reason) => hard_error(&reason),
        Ok(None) => respond(
            EditResponse {
                ok: false,
                source: None,
                reason: Some("target not found or not editable".to_string()),
            },
            ExitCode::SUCCESS,
        ),
        Ok(Some(splice)) => {
            // Guard the splice before applying it — a bad offset would panic
            // `replace_range`. Offsets come from AST spans, so this should
            // never fire, but a corrupt edit must fail cleanly, not crash.
            let (start, end) = (splice.start as usize, splice.end as usize);
            let original = &request.source;
            if start > end
                || end > original.len()
                || !original.is_char_boundary(start)
                || !original.is_char_boundary(end)
            {
                return hard_error("planned splice is out of bounds — refused");
            }
            let mut edited = original.clone();
            edited.replace_range(start..end, &splice.replacement);
            respond(
                EditResponse {
                    ok: true,
                    source: Some(edited),
                    reason: None,
                },
                ExitCode::SUCCESS,
            )
        }
    }
}

/// Plan the edit. `Err` is a hard error (unknown verb, unparseable source);
/// `Ok(None)` is a refused edit (target not found or not editable).
///
/// `path` is the target element; `value` is the new text (`edit-text`), the
/// final class string (`set-class`), the `src` (`replace-asset`), the wrapper
/// tag (`wrap`), or the sibling path to swap with (`move`).
fn plan(file: &str, request: &EditRequest) -> Result<Option<Splice>, String> {
    let mut parsed = parse_tsx(file, &request.source).map_err(|err| err.to_string())?;
    let start = parsed.start_pos;
    let module = &mut parsed.module;
    let src = request.source.as_str();
    let path = &request.path;
    let value = &request.value;

    let splice = match request.verb.as_str() {
        "edit-text" => plan_text_edit(module, file, start, path, value),
        "set-class" => plan_attr_edit(module, file, start, path, "className", value),
        "replace-asset" => plan_attr_edit(module, file, start, path, "src", value),
        "delete" => locate(module, file, start, path).map(|span| plan_delete(src, span)),
        "duplicate" => {
            locate(module, file, start, path).map(|span| plan_duplicate(src, span))
        }
        "wrap" => locate(module, file, start, path).map(|span| plan_wrap(src, span, value)),
        "unwrap" => locate(module, file, start, path).map(|span| plan_unwrap(src, span)),
        "move" => {
            match (
                locate(module, file, start, path),
                locate(module, file, start, value),
            ) {
                (Some(a), Some(b)) => Some(plan_move(src, a, b)),
                _ => None,
            }
        }
        other => return Err(format!("unsupported verb: {other}")),
    };
    Ok(splice)
}

fn respond(response: EditResponse, code: ExitCode) -> ExitCode {
    match serde_json::to_string(&response) {
        Ok(json) if writeln!(io::stdout(), "{json}").is_ok() => code,
        _ => ExitCode::FAILURE,
    }
}

fn hard_error(reason: &str) -> ExitCode {
    respond(
        EditResponse {
            ok: false,
            source: None,
            reason: Some(reason.to_string()),
        },
        ExitCode::FAILURE,
    )
}
