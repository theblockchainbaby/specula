//! Conformance fixtures for the path algorithm — see `specs/identity.md`.
//!
//! Each test parses a `.tsx` fixture, runs the pass in `Analyze` mode, and
//! asserts the exact structural paths (and, where relevant, kind / env) it
//! produces. This suite is the contract the SWC plugin and the daemon both
//! must satisfy.

use specula_core::{parse_tsx, process, ElementKind, Env, MapEntry, Mode};

/// Analyze a fixture, returning every map entry.
fn analyze(file: &str, src: &str) -> Vec<MapEntry> {
    let mut parsed = parse_tsx(file, src).expect("fixture should parse");
    process(&mut parsed.module, file, Mode::Analyze)
}

/// The fixture's element paths, sorted for stable comparison.
fn sorted_paths(entries: &[MapEntry]) -> Vec<String> {
    let mut paths: Vec<String> = entries.iter().map(|e| e.path.clone()).collect();
    paths.sort();
    paths
}

/// The single entry whose path ends with `suffix`.
fn entry<'a>(entries: &'a [MapEntry], suffix: &str) -> &'a MapEntry {
    let mut hits = entries.iter().filter(|e| e.path.ends_with(suffix));
    let found = hits
        .next()
        .unwrap_or_else(|| panic!("no entry ending in `{suffix}`"));
    assert!(hits.next().is_none(), "`{suffix}` matched more than one entry");
    found
}

#[test]
fn basic_nesting_and_same_name_indexing() {
    let entries = analyze("basic.tsx", include_str!("fixtures/basic.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec![
            "basic.tsx#HomePage/main:0",
            "basic.tsx#HomePage/main:0/section:0",
            "basic.tsx#HomePage/main:0/section:0/h1:0",
            "basic.tsx#HomePage/main:0/section:1",
            "basic.tsx#HomePage/main:0/section:1/h1:0",
        ]
    );
}

#[test]
fn fragments_are_transparent() {
    // The `<span>` inside `<>...</>` is `span:1` — it continues the parent's
    // counter as if the fragment were not there.
    let entries = analyze("fragments.tsx", include_str!("fixtures/fragments.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec![
            "fragments.tsx#Panel/div:0",
            "fragments.tsx#Panel/div:0/span:0",
            "fragments.tsx#Panel/div:0/span:1",
            "fragments.tsx#Panel/div:0/span:2",
        ]
    );
}

#[test]
fn host_and_component_elements_are_distinguished() {
    let entries = analyze("kinds.tsx", include_str!("fixtures/kinds.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec![
            "kinds.tsx#Grid/section:0",
            "kinds.tsx#Grid/section:0/Card:0",
            "kinds.tsx#Grid/section:0/div:0",
        ]
    );
    assert_eq!(entry(&entries, "/section:0").kind, ElementKind::Host);
    assert_eq!(entry(&entries, "/Card:0").kind, ElementKind::Component);
    assert_eq!(entry(&entries, "/div:0").kind, ElementKind::Host);
}

#[test]
fn mapped_elements_get_one_path() {
    // One `<li>` in source — one path — even though it renders N DOM nodes.
    let entries = analyze("map.tsx", include_str!("fixtures/map.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec!["map.tsx#List/ul:0", "map.tsx#List/ul:0/li:0"]
    );
}

#[test]
fn conditional_branches_share_the_parent_counter() {
    // `&&` and both ternary arms are children of `<header>` and index together.
    let entries = analyze("conditional.tsx", include_str!("fixtures/conditional.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec![
            "conditional.tsx#Banner/header:0",
            "conditional.tsx#Banner/header:0/em:0",
            "conditional.tsx#Banner/header:0/em:1",
            "conditional.tsx#Banner/header:0/strong:0",
        ]
    );
}

#[test]
fn static_keys_replace_the_index_and_still_advance_the_counter() {
    // Two keyed `<a>` then an unkeyed one: keyed elements use `@key`, and they
    // still advance the counter, so the unkeyed `<a>` is `a:2`.
    let entries = analyze("keys.tsx", include_str!("fixtures/keys.tsx"));
    assert_eq!(
        sorted_paths(&entries),
        vec![
            "keys.tsx#Nav/nav:0",
            "keys.tsx#Nav/nav:0/a:2",
            "keys.tsx#Nav/nav:0/a@about",
            "keys.tsx#Nav/nav:0/a@home",
        ]
    );
}

#[test]
fn use_client_directive_marks_every_element_client() {
    let entries = analyze("env.tsx", include_str!("fixtures/env.tsx"));
    assert_eq!(sorted_paths(&entries), vec!["env.tsx#Counter/button:0"]);
    assert!(
        entries.iter().all(|e| e.env == Env::Client),
        "every element in a \"use client\" file is client-side"
    );
}

#[test]
fn server_is_the_default_env() {
    let entries = analyze("basic.tsx", include_str!("fixtures/basic.tsx"));
    assert!(entries.iter().all(|e| e.env == Env::Server));
}

#[test]
fn transform_injects_a_data_spc_attribute_for_every_path() {
    let mut parsed = parse_tsx("basic.tsx", include_str!("fixtures/basic.tsx")).unwrap();
    let entries = process(&mut parsed.module, "basic.tsx", Mode::Transform);
    let output = specula_core::emit(&parsed.module, parsed.source_map.clone());

    for e in &entries {
        assert!(
            output.contains(&format!("data-spc=\"{}\"", e.path)),
            "missing `data-spc` for {} in emitted output:\n{output}",
            e.path
        );
    }
    assert!(output.contains("data-spc-env=\"server\""));
}

#[test]
fn analyze_mode_leaves_the_module_untouched() {
    let mut parsed = parse_tsx("basic.tsx", include_str!("fixtures/basic.tsx")).unwrap();
    process(&mut parsed.module, "basic.tsx", Mode::Analyze);
    let output = specula_core::emit(&parsed.module, parsed.source_map.clone());
    assert!(
        !output.contains("data-spc"),
        "Analyze mode must not mutate the module"
    );
}

#[test]
fn extracts_editable_text_classname_and_src() {
    let entries = analyze(
        "e.tsx",
        "export function E(){return <main><h1 className=\"text-xl font-bold\">Title</h1><img src=\"/hero.png\" /></main>;}",
    );

    let h1 = entry(&entries, "/h1:0");
    assert_eq!(h1.text.as_deref(), Some("Title"));
    assert_eq!(h1.class_name.as_deref(), Some("text-xl font-bold"));

    assert_eq!(entry(&entries, "/img:0").src.as_deref(), Some("/hero.png"));

    // <main> wraps elements, so it is neither text-only nor classed.
    let main = entry(&entries, "/main:0");
    assert_eq!(main.text, None);
    assert_eq!(main.class_name, None);
}
