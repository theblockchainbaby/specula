//! The source-map entry type — the `analyze` mode output, and the daemon's
//! authoritative model of every instrumented JSX element.

/// Whether a file is a client or server component, from `"use client"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum Env {
    Server,
    Client,
}

impl Env {
    /// The string written into the `data-spc-env` attribute.
    pub fn as_str(self) -> &'static str {
        match self {
            Env::Server => "server",
            Env::Client => "client",
        }
    }
}

/// Host element (`<div>`) vs. component element (`<Card>`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum ElementKind {
    Host,
    Component,
}

/// One instrumented JSX element. `path` is the structural identity defined in
/// `specs/identity.md`; `lo`/`hi` are byte offsets of the element.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct MapEntry {
    pub path: String,
    pub file: String,
    pub tag: String,
    pub kind: ElementKind,
    pub env: Env,
    /// Static text content, present only when the element is text-only.
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub text: Option<String>,
    /// The `className` value, present only when it is a static string literal.
    #[cfg_attr(
        feature = "serde",
        serde(rename = "className", skip_serializing_if = "Option::is_none")
    )]
    pub class_name: Option<String>,
    /// The `src` value, present only when it is a static string literal.
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub src: Option<String>,
    pub lo: u32,
    pub hi: u32,
}
