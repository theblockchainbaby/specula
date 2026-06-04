//! Specula instrumentation core.
//!
//! One path algorithm, two modes:
//! - [`Mode::Transform`] — inject `data-spc` / `data-spc-env` attributes (bundler).
//! - [`Mode::Analyze`]   — emit the source map (daemon).
//!
//! See `specs/identity.md` for the path grammar this implements.

mod emit;
mod map;
mod parse;
mod path;
mod structural;

pub use emit::emit;
pub use map::{ElementKind, Env, MapEntry};
pub use parse::{parse_tsx, ParseError, Parsed};
pub use path::{ElementSpan, Splice};
pub use structural::{plan_delete, plan_duplicate, plan_move, plan_unwrap, plan_wrap};

pub use swc_core::ecma::ast::Module;

/// Which mode the instrumentation pass runs in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Inject `data-spc` / `data-spc-env` attributes; mutates the module.
    Transform,
    /// Collect the source map only; leaves the module untouched.
    Analyze,
}

/// Run the Specula instrumentation pass over a parsed module.
///
/// In [`Mode::Transform`] the module is mutated in place; in [`Mode::Analyze`]
/// it is left untouched. Both modes return the map.
pub fn process(module: &mut Module, file: &str, mode: Mode) -> Vec<MapEntry> {
    path::run(module, file, mode)
}

/// Plan an `edit-text`: the [`Splice`] that replaces the text of the element at
/// `target_path`, or `None` if it is not a text-only element. `start_pos` is
/// the file's start byte offset, from [`Parsed`].
pub fn plan_text_edit(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target_path: &str,
    new_text: &str,
) -> Option<Splice> {
    path::run_text_edit(module, file, start_pos, target_path, new_text)
}

/// Plan a `set-class` / `replace-asset`: the [`Splice`] that sets the string
/// attribute `attr_name` (e.g. `className`, `src`) on the element at
/// `target_path`. Splicing it preserves the rest of the file byte-for-byte.
pub fn plan_attr_edit(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target_path: &str,
    attr_name: &str,
    value: &str,
) -> Option<Splice> {
    path::run_attr_edit(module, file, start_pos, target_path, attr_name, value)
}

/// Locate the element at `target_path`: its file-relative byte [`ElementSpan`],
/// or `None` if not found. The structural verbs (`plan_delete`, `plan_wrap`, …)
/// build splices from located spans.
pub fn locate(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target_path: &str,
) -> Option<ElementSpan> {
    path::run_locate(module, file, start_pos, target_path)
}
