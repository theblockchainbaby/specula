//! Structural verbs — `delete` / `duplicate` / `wrap` / `move`.
//!
//! Each plans a byte [`Splice`] from a located element span (`locate`) and the
//! original source. Like every Specula edit, the result is a minimal diff:
//! only the affected region changes.

use crate::path::{ElementSpan, Splice};

/// The whitespace run (spaces and tabs) immediately before `offset`.
fn leading_indent(source: &str, offset: usize) -> &str {
    let bytes = source.as_bytes();
    let mut start = offset;
    while start > 0 && matches!(bytes[start - 1], b' ' | b'\t') {
        start -= 1;
    }
    &source[start..offset]
}

/// The indentation of the line containing `offset` — the whitespace run from
/// the start of that line.
fn line_indent(source: &str, offset: usize) -> &str {
    let bytes = source.as_bytes();
    let mut line_start = offset;
    while line_start > 0 && bytes[line_start - 1] != b'\n' {
        line_start -= 1;
    }
    let mut end = line_start;
    while end < offset && matches!(bytes[end], b' ' | b'\t') {
        end += 1;
    }
    &source[line_start..end]
}

/// Plan a `delete`: remove the element along with its leading indentation and
/// newline, so the surrounding code closes up cleanly.
pub fn plan_delete(source: &str, span: ElementSpan) -> Splice {
    let bytes = source.as_bytes();
    let mut start = span.lo as usize;
    while start > 0 && matches!(bytes[start - 1], b' ' | b'\t') {
        start -= 1;
    }
    if start > 0 && bytes[start - 1] == b'\n' {
        start -= 1;
    }
    Splice {
        start: start as u32,
        end: span.hi,
        replacement: String::new(),
    }
}

/// Plan a `duplicate`: insert a copy of the element on the next line, indented
/// to match.
pub fn plan_duplicate(source: &str, span: ElementSpan) -> Splice {
    let element = &source[span.lo as usize..span.hi as usize];
    let indent = leading_indent(source, span.lo as usize);
    Splice {
        start: span.hi,
        end: span.hi,
        replacement: format!("\n{indent}{element}"),
    }
}

/// Plan a `wrap`: enclose the element in a `<tag>…</tag>`, laid out on its own
/// lines and indented to match the element's line.
pub fn plan_wrap(source: &str, span: ElementSpan, tag: &str) -> Splice {
    let element = &source[span.lo as usize..span.hi as usize];
    let indent = line_indent(source, span.lo as usize);
    Splice {
        start: span.lo,
        end: span.hi,
        replacement: format!("<{tag}>\n{indent}  {element}\n{indent}</{tag}>"),
    }
}

/// Plan a `move`: swap two adjacent sibling elements, preserving the text
/// between them in place.
pub fn plan_move(source: &str, a: ElementSpan, b: ElementSpan) -> Splice {
    let (first, second) = if a.lo <= b.lo { (a, b) } else { (b, a) };
    let first_src = &source[first.lo as usize..first.hi as usize];
    let between = &source[first.hi as usize..second.lo as usize];
    let second_src = &source[second.lo as usize..second.hi as usize];
    Splice {
        start: first.lo,
        end: second.hi,
        replacement: format!("{second_src}{between}{first_src}"),
    }
}

/// The byte offset, within `element`, of the first `>` that ends the opening
/// JSX tag. Skips over expression containers `{…}` (which may legally contain
/// `>` inside JSX) by tracking brace depth.
fn opening_tag_end(element: &str) -> usize {
    let bytes = element.as_bytes();
    let mut i = 0;
    let mut brace_depth: i32 = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => brace_depth += 1,
            b'}' => brace_depth -= 1,
            b'>' if brace_depth == 0 => return i + 1,
            _ => {}
        }
        i += 1;
    }
    bytes.len()
}

/// Plan an `unwrap`: the inverse of `plan_wrap`. Replace a wrapping element
/// with its inner content, keeping the children in place. wrap→unwrap is a
/// round-trip no-op for single-child wrappers.
pub fn plan_unwrap(source: &str, span: ElementSpan) -> Splice {
    let element = &source[span.lo as usize..span.hi as usize];
    let open_end = opening_tag_end(element);
    let close_start = element.rfind("</").unwrap_or(element.len());
    let inner = if open_end <= close_start {
        &element[open_end..close_start]
    } else {
        ""
    };
    Splice {
        start: span.lo,
        end: span.hi,
        replacement: inner.trim().to_string(),
    }
}
