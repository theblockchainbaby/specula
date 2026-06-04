//! Tests for the span-based edit planner — `edit-text`, `set-class`,
//! `replace-asset`.
//!
//! Each test asserts the *exact* output: a Specula edit must change only its
//! own bytes and leave the rest of the file — indentation, line breaks, style —
//! untouched. That minimal-diff property is the point of span-based editing.

use specula_core::{
    locate, parse_tsx, plan_attr_edit, plan_delete, plan_duplicate, plan_move, plan_text_edit,
    plan_toggle_conditional, plan_unwrap, plan_wrap, Splice,
};

/// Apply a planned splice to the source string.
fn apply(src: &str, splice: Option<Splice>) -> Option<String> {
    let splice = splice?;
    let mut out = src.to_string();
    out.replace_range(
        splice.start as usize..splice.end as usize,
        &splice.replacement,
    );
    Some(out)
}

fn edit_text(src: &str, target: &str, new_text: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let splice =
        plan_text_edit(&mut parsed.module, "page.tsx", parsed.start_pos, target, new_text);
    apply(src, splice)
}

fn set_attr(src: &str, target: &str, name: &str, value: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let splice = plan_attr_edit(
        &mut parsed.module,
        "page.tsx",
        parsed.start_pos,
        target,
        name,
        value,
    );
    apply(src, splice)
}

#[test]
fn edit_text_replaces_only_the_text_node() {
    let src = "export function E() {\n  return <h1>Old</h1>;\n}\n";
    assert_eq!(
        edit_text(src, "page.tsx#E/h1:0", "New").as_deref(),
        Some("export function E() {\n  return <h1>New</h1>;\n}\n"),
    );
}

#[test]
fn edit_text_returns_none_for_an_unknown_path() {
    let src = "export function E() {\n  return <h1>Old</h1>;\n}\n";
    assert_eq!(edit_text(src, "page.tsx#E/h2:0", "New"), None);
}

#[test]
fn edit_text_refuses_a_mixed_element() {
    // The <p> has a text run *and* an element child — `edit-text` is ambiguous.
    let src = "export function E() {\n  return <p>Hi <b>x</b></p>;\n}\n";
    assert_eq!(edit_text(src, "page.tsx#E/p:0", "New"), None);
}

#[test]
fn set_class_replaces_only_the_class_literal() {
    let src = "export function E() {\n  return <h1 className=\"old\">Hi</h1>;\n}\n";
    assert_eq!(
        set_attr(src, "page.tsx#E/h1:0", "className", "new big").as_deref(),
        Some("export function E() {\n  return <h1 className=\"new big\">Hi</h1>;\n}\n"),
    );
}

#[test]
fn set_class_inserts_an_absent_attribute() {
    let src = "export function E() {\n  return <h1>Hi</h1>;\n}\n";
    assert_eq!(
        set_attr(src, "page.tsx#E/h1:0", "className", "added").as_deref(),
        Some("export function E() {\n  return <h1 className=\"added\">Hi</h1>;\n}\n"),
    );
}

#[test]
fn set_attr_refuses_an_expression_valued_attribute() {
    let src = "export function E({ cls }) {\n  return <h1 className={cls}>Hi</h1>;\n}\n";
    assert_eq!(set_attr(src, "page.tsx#E/h1:0", "className", "x"), None);
}

#[test]
fn replace_asset_sets_only_the_src() {
    let src = "export function E() {\n  return <img src=\"/old.png\" />;\n}\n";
    assert_eq!(
        set_attr(src, "page.tsx#E/img:0", "src", "/new.png").as_deref(),
        Some("export function E() {\n  return <img src=\"/new.png\" />;\n}\n"),
    );
}

// --- escaping --------------------------------------------------------------

#[test]
fn edit_text_escapes_jsx_special_characters() {
    let src = "export function E() {\n  return <h1>x</h1>;\n}\n";
    let out = edit_text(src, "page.tsx#E/h1:0", "A < B {z}").expect("edited");
    assert_eq!(
        out,
        "export function E() {\n  return <h1>A &lt; B &#123;z&#125;</h1>;\n}\n",
    );
    // The escaped result must still parse — a raw `<` would have broken it.
    assert!(parse_tsx("page.tsx", &out).is_ok());
}

#[test]
fn set_attr_escapes_ampersands_in_the_value() {
    let src = "export function E() {\n  return <img src=\"/old\" />;\n}\n";
    assert_eq!(
        set_attr(src, "page.tsx#E/img:0", "src", "/p?a=1&b=2").as_deref(),
        Some("export function E() {\n  return <img src=\"/p?a=1&amp;b=2\" />;\n}\n"),
    );
}

// --- structural verbs ------------------------------------------------------

const TREE: &str =
    "export function E() {\n  return <main>\n    <h1>a</h1>\n    <p>b</p>\n  </main>;\n}\n";

fn delete(src: &str, target: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let span = locate(&mut parsed.module, "page.tsx", parsed.start_pos, target)?;
    apply(src, Some(plan_delete(src, span)))
}

fn duplicate(src: &str, target: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let span = locate(&mut parsed.module, "page.tsx", parsed.start_pos, target)?;
    apply(src, Some(plan_duplicate(src, span)))
}

fn wrap(src: &str, target: &str, tag: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let span = locate(&mut parsed.module, "page.tsx", parsed.start_pos, target)?;
    apply(src, Some(plan_wrap(src, span, tag)))
}

fn swap(src: &str, a: &str, b: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let start = parsed.start_pos;
    let span_a = locate(&mut parsed.module, "page.tsx", start, a)?;
    let span_b = locate(&mut parsed.module, "page.tsx", start, b)?;
    apply(src, Some(plan_move(src, span_a, span_b)))
}

fn unwrap(src: &str, target: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let span = locate(&mut parsed.module, "page.tsx", parsed.start_pos, target)?;
    apply(src, Some(plan_unwrap(src, span)))
}

fn toggle_conditional(src: &str, target: &str) -> Option<String> {
    let mut parsed = parse_tsx("page.tsx", src).expect("fixture should parse");
    let span = locate(&mut parsed.module, "page.tsx", parsed.start_pos, target)?;
    apply(src, plan_toggle_conditional(src, span))
}

#[test]
fn delete_removes_the_element_and_its_line() {
    assert_eq!(
        delete(TREE, "page.tsx#E/main:0/h1:0").as_deref(),
        Some("export function E() {\n  return <main>\n    <p>b</p>\n  </main>;\n}\n"),
    );
}

#[test]
fn delete_returns_none_for_an_unknown_path() {
    assert_eq!(delete(TREE, "page.tsx#E/main:0/h9:0"), None);
}

#[test]
fn duplicate_inserts_an_indented_copy() {
    assert_eq!(
        duplicate(TREE, "page.tsx#E/main:0/h1:0").as_deref(),
        Some(
            "export function E() {\n  return <main>\n    <h1>a</h1>\n    <h1>a</h1>\n    <p>b</p>\n  </main>;\n}\n",
        ),
    );
}

#[test]
fn wrap_encloses_the_element_on_its_own_lines() {
    let src = "export function E() {\n  return <h1>x</h1>;\n}\n";
    assert_eq!(
        wrap(src, "page.tsx#E/h1:0", "div").as_deref(),
        Some("export function E() {\n  return <div>\n    <h1>x</h1>\n  </div>;\n}\n"),
    );
}

#[test]
fn move_swaps_two_adjacent_siblings() {
    assert_eq!(
        swap(TREE, "page.tsx#E/main:0/h1:0", "page.tsx#E/main:0/p:0").as_deref(),
        Some("export function E() {\n  return <main>\n    <p>b</p>\n    <h1>a</h1>\n  </main>;\n}\n"),
    );
}

#[test]
fn toggle_conditional_adds_a_bang_to_a_simple_identifier_test() {
    let src =
        "export function E() {\n  return <main>{show && <h1>x</h1>}</main>;\n}\n";
    assert_eq!(
        toggle_conditional(src, "page.tsx#E/main:0/h1:0").as_deref(),
        Some("export function E() {\n  return <main>{!show && <h1>x</h1>}</main>;\n}\n"),
    );
}

#[test]
fn toggle_conditional_removes_a_bang_from_a_negated_test() {
    let src =
        "export function E() {\n  return <main>{!show && <h1>x</h1>}</main>;\n}\n";
    assert_eq!(
        toggle_conditional(src, "page.tsx#E/main:0/h1:0").as_deref(),
        Some("export function E() {\n  return <main>{show && <h1>x</h1>}</main>;\n}\n"),
    );
}

#[test]
fn toggle_conditional_handles_member_expression_tests() {
    let src =
        "export function E() {\n  return <main>{user.isLoggedIn && <h1>x</h1>}</main>;\n}\n";
    assert_eq!(
        toggle_conditional(src, "page.tsx#E/main:0/h1:0").as_deref(),
        Some("export function E() {\n  return <main>{!user.isLoggedIn && <h1>x</h1>}</main>;\n}\n"),
    );
}

#[test]
fn toggle_conditional_returns_none_when_element_is_not_in_a_conditional() {
    // No `{… && <h1/>}` wrapping the element — the element is rendered
    // unconditionally, so there is nothing to toggle.
    let src = "export function E() {\n  return <main><h1>x</h1></main>;\n}\n";
    assert_eq!(toggle_conditional(src, "page.tsx#E/main:0/h1:0"), None);
}

#[test]
fn unwrap_removes_the_wrapping_element_round_trip() {
    // The exact output of plan_wrap on `<h1>x</h1>` — unwrap must invert it
    // byte-for-byte so wrap→unwrap is a no-op.
    let src = "export function E() {\n  return <div>\n    <h1>x</h1>\n  </div>;\n}\n";
    assert_eq!(
        unwrap(src, "page.tsx#E/div:0").as_deref(),
        Some("export function E() {\n  return <h1>x</h1>;\n}\n"),
    );
}

#[test]
fn unwrap_returns_none_for_an_unknown_path() {
    let src = "export function E() {\n  return <div>\n    <h1>x</h1>\n  </div>;\n}\n";
    assert_eq!(unwrap(src, "page.tsx#E/section:0"), None);
}
