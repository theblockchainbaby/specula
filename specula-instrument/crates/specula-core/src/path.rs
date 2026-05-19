//! The path algorithm — see `specs/identity.md`.
//!
//! A single `&mut` recursive descent computes the structural path of every JSX
//! element. In `Analyze` mode it only records map entries; in `Transform` mode
//! it also injects `data-spc` / `data-spc-env` attributes. One algorithm — the
//! plugin and the daemon can never disagree.

use std::collections::HashMap;

use swc_core::common::{Spanned, DUMMY_SP};
use swc_core::ecma::atoms::Wtf8Atom;
use swc_core::ecma::ast::{
    ArrowExpr, BinaryOp, BlockStmtOrExpr, CallExpr, Callee, Decl, DefaultDecl, Expr,
    Function, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElement,
    JSXElementChild, JSXElementName, JSXExpr, JSXMemberExpr, JSXObject, JSXOpeningElement,
    Lit, MemberProp, Module, ModuleDecl, ModuleItem, Pat, Stmt, Str,
};

use crate::{ElementKind, Env, MapEntry, Mode};

pub fn run(module: &mut Module, file: &str, mode: Mode) -> Vec<MapEntry> {
    run_inner(module, file, mode, None, 0).0
}

/// Plan an `edit-text` on the element at `target`: the byte [`Splice`] that
/// replaces just its text node, or `None` if it is not found or not text-only.
pub fn run_text_edit(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target: &str,
    new_text: &str,
) -> Option<Splice> {
    run_inner(
        module,
        file,
        Mode::Analyze,
        Some(PendingEdit::Text {
            target: target.to_string(),
            new_text: new_text.to_string(),
        }),
        start_pos,
    )
    .1
}

/// Plan a `set-class` / `replace-asset` on the element at `target`: the byte
/// [`Splice`] that sets the string attribute `name` — replacing a string
/// literal, or inserting an absent attribute — or `None` if it is not found or
/// the attribute is expression-valued.
pub fn run_attr_edit(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target: &str,
    name: &str,
    value: &str,
) -> Option<Splice> {
    run_inner(
        module,
        file,
        Mode::Analyze,
        Some(PendingEdit::Attr {
            target: target.to_string(),
            name: name.to_string(),
            value: value.to_string(),
        }),
        start_pos,
    )
    .1
}

/// Locate the element at `target`: its file-relative byte span, or `None` if
/// it is not found. The structural verbs build splices from located spans.
pub fn run_locate(
    module: &mut Module,
    file: &str,
    start_pos: u32,
    target: &str,
) -> Option<ElementSpan> {
    run_inner(
        module,
        file,
        Mode::Analyze,
        Some(PendingEdit::Locate {
            target: target.to_string(),
        }),
        start_pos,
    )
    .2
}

fn run_inner(
    module: &mut Module,
    file: &str,
    mode: Mode,
    edit: Option<PendingEdit>,
    start_pos: u32,
) -> (Vec<MapEntry>, Option<Splice>, Option<ElementSpan>) {
    let env = detect_env(module);
    let mut walker = Walker {
        file,
        mode,
        env,
        entries: Vec::new(),
        edit,
        start_pos,
        splice: None,
        located: None,
    };
    walker.walk_module(module);
    (walker.entries, walker.splice, walker.located)
}

/// A byte-range replacement in the original source — the plan for one edit.
/// Splicing it preserves every byte outside `start..end`, so an edit produces
/// a minimal diff instead of a reformatted file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Splice {
    /// File-relative byte offset where the replacement starts.
    pub start: u32,
    /// File-relative byte offset where the replacement ends.
    pub end: u32,
    /// Text to put in place of `start..end`.
    pub replacement: String,
}

/// A located element's file-relative byte span — covers `<tag …>…</tag>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ElementSpan {
    pub lo: u32,
    pub hi: u32,
}

/// A pending edit, located against the matching element during the walk.
enum PendingEdit {
    Text {
        target: String,
        new_text: String,
    },
    Attr {
        target: String,
        name: String,
        value: String,
    },
    Locate {
        target: String,
    },
}

impl PendingEdit {
    fn target(&self) -> &str {
        match self {
            PendingEdit::Text { target, .. }
            | PendingEdit::Attr { target, .. }
            | PendingEdit::Locate { target } => target,
        }
    }
}

/// Per-parent counter of same-name siblings (drives the `:index` discriminator).
struct Counters(HashMap<String, usize>);

impl Counters {
    fn new() -> Self {
        Counters(HashMap::new())
    }

    /// Next index for `name`, advancing the counter.
    fn next(&mut self, name: &str) -> usize {
        let slot = self.0.entry(name.to_string()).or_insert(0);
        let value = *slot;
        *slot += 1;
        value
    }
}

struct Walker<'a> {
    file: &'a str,
    mode: Mode,
    env: Env,
    entries: Vec<MapEntry>,
    edit: Option<PendingEdit>,
    /// The file's start byte offset, for turning spans into file offsets.
    start_pos: u32,
    /// The planned splice, set when the walk reaches a Text/Attr target.
    splice: Option<Splice>,
    /// The located span, set when the walk reaches a Locate target.
    located: Option<ElementSpan>,
}

impl<'a> Walker<'a> {
    // --- owner discovery --------------------------------------------------

    fn walk_module(&mut self, module: &mut Module) {
        for item in &mut module.body {
            match item {
                ModuleItem::Stmt(stmt) => self.walk_stmt(stmt),
                ModuleItem::ModuleDecl(decl) => self.walk_module_decl(decl),
            }
        }
    }

    fn walk_module_decl(&mut self, decl: &mut ModuleDecl) {
        match decl {
            ModuleDecl::ExportDecl(export) => self.walk_decl(&mut export.decl),
            ModuleDecl::ExportDefaultDecl(export) => {
                if let DefaultDecl::Fn(fn_expr) = &mut export.decl {
                    let name = fn_expr
                        .ident
                        .as_ref()
                        .map(|id| id.sym.to_string())
                        .unwrap_or_else(|| "$default".to_string());
                    self.walk_function(&mut fn_expr.function, &name);
                }
            }
            ModuleDecl::ExportDefaultExpr(export) => {
                self.walk_owner_expr(&mut export.expr, "$default");
            }
            _ => {}
        }
    }

    fn walk_stmt(&mut self, stmt: &mut Stmt) {
        if let Stmt::Decl(decl) = stmt {
            self.walk_decl(decl);
        }
    }

    fn walk_decl(&mut self, decl: &mut Decl) {
        match decl {
            Decl::Fn(fn_decl) => {
                let name = fn_decl.ident.sym.to_string();
                self.walk_function(&mut fn_decl.function, &name);
            }
            Decl::Var(var_decl) => {
                for declarator in &mut var_decl.decls {
                    if let Pat::Ident(binding) = &declarator.name {
                        let name = binding.id.sym.to_string();
                        if let Some(init) = &mut declarator.init {
                            self.walk_owner_expr(init, &name);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// The initializer of a `const`, or a default-exported expression.
    fn walk_owner_expr(&mut self, expr: &mut Expr, name: &str) {
        match expr {
            Expr::Arrow(arrow) => self.walk_arrow(arrow, name),
            Expr::Fn(fn_expr) => self.walk_function(&mut fn_expr.function, name),
            Expr::Paren(paren) => self.walk_owner_expr(&mut paren.expr, name),
            Expr::JSXElement(_) | Expr::JSXFragment(_) => {
                let owner_path = format!("{}#{}", self.file, name);
                self.process_jsx_expr(expr, &owner_path, &mut Counters::new());
            }
            _ => {}
        }
    }

    fn walk_function(&mut self, function: &mut Function, name: &str) {
        if let Some(body) = &mut function.body {
            let owner_path = format!("{}#{}", self.file, name);
            self.walk_body_stmts(&mut body.stmts, &owner_path, &mut Counters::new());
        }
    }

    fn walk_arrow(&mut self, arrow: &mut ArrowExpr, name: &str) {
        let owner_path = format!("{}#{}", self.file, name);
        match &mut *arrow.body {
            BlockStmtOrExpr::BlockStmt(block) => {
                self.walk_body_stmts(&mut block.stmts, &owner_path, &mut Counters::new());
            }
            BlockStmtOrExpr::Expr(expr) => {
                self.process_jsx_expr(expr, &owner_path, &mut Counters::new());
            }
        }
    }

    /// Walk a component body: process `return` JSX under `owner_path`, and
    /// descend into nested declarations as their own owners. Recurses through
    /// control flow but stops at function boundaries.
    fn walk_body_stmts(&mut self, stmts: &mut [Stmt], owner_path: &str, counters: &mut Counters) {
        for stmt in stmts {
            match stmt {
                Stmt::Return(ret) => {
                    if let Some(arg) = &mut ret.arg {
                        self.process_jsx_expr(arg, owner_path, counters);
                    }
                }
                Stmt::If(if_stmt) => {
                    self.walk_body_stmts(
                        std::slice::from_mut(&mut if_stmt.cons),
                        owner_path,
                        counters,
                    );
                    if let Some(alt) = &mut if_stmt.alt {
                        self.walk_body_stmts(std::slice::from_mut(alt), owner_path, counters);
                    }
                }
                Stmt::Block(block) => {
                    self.walk_body_stmts(&mut block.stmts, owner_path, counters);
                }
                Stmt::Decl(decl) => self.walk_decl(decl),
                _ => {}
            }
        }
    }

    // --- JSX path computation --------------------------------------------

    /// Descend an expression, processing any JSX it directly produces as a
    /// child of `parent_path`.
    fn process_jsx_expr(&mut self, expr: &mut Expr, parent_path: &str, counters: &mut Counters) {
        match expr {
            Expr::JSXElement(element) => self.process_element(element, parent_path, counters),
            Expr::JSXFragment(fragment) => {
                self.process_children(&mut fragment.children, parent_path, counters);
            }
            Expr::Paren(paren) => self.process_jsx_expr(&mut paren.expr, parent_path, counters),
            Expr::Cond(cond) => {
                self.process_jsx_expr(&mut cond.cons, parent_path, counters);
                self.process_jsx_expr(&mut cond.alt, parent_path, counters);
            }
            Expr::Bin(bin) if matches!(bin.op, BinaryOp::LogicalAnd | BinaryOp::LogicalOr) => {
                self.process_jsx_expr(&mut bin.left, parent_path, counters);
                self.process_jsx_expr(&mut bin.right, parent_path, counters);
            }
            Expr::Call(call) if is_map_call(call) => {
                for arg in &mut call.args {
                    self.process_callback_arg(&mut arg.expr, parent_path, counters);
                }
            }
            _ => {}
        }
    }

    /// The callback passed to `.map()` — descend into its returned JSX.
    fn process_callback_arg(
        &mut self,
        expr: &mut Expr,
        parent_path: &str,
        counters: &mut Counters,
    ) {
        match expr {
            Expr::Arrow(arrow) => match &mut *arrow.body {
                BlockStmtOrExpr::Expr(body) => {
                    self.process_jsx_expr(body, parent_path, counters)
                }
                BlockStmtOrExpr::BlockStmt(block) => {
                    self.process_returns(&mut block.stmts, parent_path, counters)
                }
            },
            Expr::Fn(fn_expr) => {
                if let Some(body) = &mut fn_expr.function.body {
                    self.process_returns(&mut body.stmts, parent_path, counters);
                }
            }
            Expr::Paren(paren) => {
                self.process_callback_arg(&mut paren.expr, parent_path, counters)
            }
            _ => {}
        }
    }

    fn process_returns(&mut self, stmts: &mut [Stmt], parent_path: &str, counters: &mut Counters) {
        for stmt in stmts {
            if let Stmt::Return(ret) = stmt {
                if let Some(arg) = &mut ret.arg {
                    self.process_jsx_expr(arg, parent_path, counters);
                }
            }
        }
    }

    /// Process the element children of a JSX element or fragment. Fragments are
    /// transparent — their children join the parent's child list.
    fn process_children(
        &mut self,
        children: &mut [JSXElementChild],
        parent_path: &str,
        counters: &mut Counters,
    ) {
        for child in children {
            match child {
                JSXElementChild::JSXElement(element) => {
                    self.process_element(element, parent_path, counters)
                }
                JSXElementChild::JSXFragment(fragment) => {
                    self.process_children(&mut fragment.children, parent_path, counters)
                }
                JSXElementChild::JSXExprContainer(container) => {
                    if let JSXExpr::Expr(expr) = &mut container.expr {
                        self.process_jsx_expr(expr, parent_path, counters);
                    }
                }
                _ => {}
            }
        }
    }

    /// Assign a path to one element, record it (and inject, if transforming),
    /// then recurse into its children with a fresh counter.
    fn process_element(
        &mut self,
        element: &mut JSXElement,
        parent_path: &str,
        counters: &mut Counters,
    ) {
        let (tag, kind) = element_name_and_kind(&element.opening.name);
        let segment = match static_str_attr(&element.opening.attrs, "key") {
            Some(key) => {
                // A keyed element still advances the counter, so adding or
                // removing a `key` only re-keys that one element.
                let _ = counters.next(&tag);
                format!("{}@{}", tag, encode_key(&key))
            }
            None => format!("{}:{}", tag, counters.next(&tag)),
        };
        let path = format!("{}/{}", parent_path, segment);

        self.entries.push(MapEntry {
            path: path.clone(),
            file: self.file.to_string(),
            tag,
            kind,
            env: self.env,
            text: text_only_content(element),
            class_name: static_str_attr(&element.opening.attrs, "className"),
            src: static_str_attr(&element.opening.attrs, "src"),
            lo: element.span.lo.0,
            hi: element.span.hi.0,
        });

        if self.mode == Mode::Transform {
            inject_attrs(&mut element.opening, &path, self.env);
        }

        if let Some(edit) = &self.edit {
            if edit.target() == path {
                match edit {
                    PendingEdit::Text { new_text, .. } => {
                        self.splice = plan_text_splice(element, self.start_pos, new_text);
                    }
                    PendingEdit::Attr { name, value, .. } => {
                        self.splice = plan_attr_splice(element, self.start_pos, name, value);
                    }
                    PendingEdit::Locate { .. } => {
                        self.located = Some(ElementSpan {
                            lo: element.span.lo.0 - self.start_pos,
                            hi: element.span.hi.0 - self.start_pos,
                        });
                    }
                }
            }
        }

        self.process_children(&mut element.children, &path, &mut Counters::new());
    }
}

// --- module-level helpers -------------------------------------------------

/// A `"use client"` directive in the prologue makes every element client-side.
fn detect_env(module: &Module) -> Env {
    for item in &module.body {
        match item {
            ModuleItem::Stmt(Stmt::Expr(expr_stmt)) => {
                if let Expr::Lit(Lit::Str(string)) = &*expr_stmt.expr {
                    if wtf8_to_string(&string.value) == "use client" {
                        return Env::Client;
                    }
                    continue; // another directive (e.g. "use strict") — keep scanning
                }
                break;
            }
            _ => break,
        }
    }
    Env::Server
}

fn element_name_and_kind(name: &JSXElementName) -> (String, ElementKind) {
    match name {
        JSXElementName::Ident(ident) => {
            let text = ident.sym.to_string();
            let kind = if text.chars().next().is_some_and(|c| c.is_uppercase()) {
                ElementKind::Component
            } else {
                ElementKind::Host
            };
            (text, kind)
        }
        JSXElementName::JSXMemberExpr(member) => {
            (jsx_member_to_string(member), ElementKind::Component)
        }
        JSXElementName::JSXNamespacedName(ns) => (
            format!("{}-{}", ns.ns.sym, ns.name.sym),
            ElementKind::Host,
        ),
    }
}

fn jsx_member_to_string(member: &JSXMemberExpr) -> String {
    let object = match &member.obj {
        JSXObject::Ident(ident) => ident.sym.to_string(),
        JSXObject::JSXMemberExpr(inner) => jsx_member_to_string(inner),
    };
    format!("{}.{}", object, member.prop.sym)
}

/// The value of a static string-literal attribute named `name` (e.g. `key`,
/// `className`, `src`). Expression-valued attributes yield `None`.
fn static_str_attr(attrs: &[JSXAttrOrSpread], name: &str) -> Option<String> {
    for attr in attrs {
        if let JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(attr_name),
            value: Some(JSXAttrValue::Str(string)),
            ..
        }) = attr
        {
            if attr_name.sym.as_str() == name {
                return Some(wtf8_to_string(&string.value));
            }
        }
    }
    None
}

/// The text content of a text-only element — one whose sole child is a
/// `JSXText`. Mixed and dynamic elements yield `None`.
fn text_only_content(element: &JSXElement) -> Option<String> {
    if element.children.len() != 1 {
        return None;
    }
    match &element.children[0] {
        JSXElementChild::JSXText(text) => Some(text.value.to_string()),
        _ => None,
    }
}

/// Lossily render a WTF-8 atom as a `String` (Specula paths are UTF-8).
fn wtf8_to_string(atom: &Wtf8Atom) -> String {
    atom.to_atom_lossy().to_string()
}

/// Percent-encode anything outside `[A-Za-z0-9._-]` so a key is path-safe.
fn encode_key(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    for byte in key.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'_' | b'-' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn is_map_call(call: &CallExpr) -> bool {
    if let Callee::Expr(callee) = &call.callee {
        if let Expr::Member(member) = &**callee {
            if let MemberProp::Ident(prop) = &member.prop {
                return prop.sym.as_str() == "map";
            }
        }
    }
    false
}

/// Plan the splice that replaces a text-only element's text node. Returns
/// `None` for a mixed element, where `edit-text` would be ambiguous.
fn plan_text_splice(element: &JSXElement, start_pos: u32, new_text: &str) -> Option<Splice> {
    if element.children.len() != 1 {
        return None;
    }
    match &element.children[0] {
        JSXElementChild::JSXText(text) => Some(Splice {
            start: text.span.lo.0 - start_pos,
            end: text.span.hi.0 - start_pos,
            replacement: escape_jsx_text(new_text),
        }),
        _ => None,
    }
}

/// Plan the splice that sets the string attribute `name` on `element` —
/// replacing a string-literal value, or inserting the attribute right after
/// the tag name. Returns `None` for an expression-valued attribute, which
/// cannot be set without guessing.
fn plan_attr_splice(
    element: &JSXElement,
    start_pos: u32,
    name: &str,
    value: &str,
) -> Option<Splice> {
    for attr in &element.opening.attrs {
        if let JSXAttrOrSpread::JSXAttr(jsx_attr) = attr {
            if let JSXAttrName::Ident(attr_name) = &jsx_attr.name {
                if attr_name.sym.as_str() == name {
                    return match &jsx_attr.value {
                        Some(JSXAttrValue::Str(string)) => Some(Splice {
                            start: string.span.lo.0 - start_pos,
                            end: string.span.hi.0 - start_pos,
                            replacement: format!("\"{}\"", escape_attr(value)),
                        }),
                        None => Some(Splice {
                            start: jsx_attr.span.lo.0 - start_pos,
                            end: jsx_attr.span.hi.0 - start_pos,
                            replacement: format!("{}=\"{}\"", name, escape_attr(value)),
                        }),
                        _ => None,
                    };
                }
            }
        }
    }
    // The attribute is absent — insert it right after the tag name.
    let after_name = element.opening.name.span().hi.0 - start_pos;
    Some(Splice {
        start: after_name,
        end: after_name,
        replacement: format!(" {}=\"{}\"", name, escape_attr(value)),
    })
}

/// Escape a value for use inside a double-quoted JSX attribute. `&` is escaped
/// first so an introduced entity is not double-escaped.
fn escape_attr(value: &str) -> String {
    value.replace('&', "&amp;").replace('"', "&quot;")
}

/// Escape text for a JSX text node — a raw `<` or `{` would otherwise be parsed
/// as markup, breaking the file. `&` is escaped first.
fn escape_jsx_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('{', "&#123;")
        .replace('}', "&#125;")
}

/// A string-literal JSX attribute value.
fn str_attr_value(value: &str) -> JSXAttrValue {
    JSXAttrValue::Str(Str {
        span: DUMMY_SP,
        value: Wtf8Atom::new(value),
        raw: None,
    })
}

fn inject_attrs(opening: &mut JSXOpeningElement, path: &str, env: Env) {
    opening.attrs.push(make_attr("data-spc", path));
    opening.attrs.push(make_attr("data-spc-env", env.as_str()));
}

fn make_attr(name: &str, value: &str) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName {
            span: DUMMY_SP,
            sym: name.into(),
        }),
        value: Some(str_attr_value(value)),
    })
}
