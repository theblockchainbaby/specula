//! Emit a module back to source. Used by the conformance tests to inspect
//! `Transform`-mode output the way the bundler's codegen eventually will.

use swc_core::common::sync::Lrc;
use swc_core::common::SourceMap;
use swc_core::ecma::ast::Module;
use swc_core::ecma::codegen::{text_writer::JsWriter, Config, Emitter};

/// Render a module to a TSX string.
pub fn emit(module: &Module, source_map: Lrc<SourceMap>) -> String {
    let mut buf = Vec::new();
    {
        let writer = JsWriter::new(source_map.clone(), "\n", &mut buf, None);
        let mut emitter = Emitter {
            cfg: Config::default(),
            cm: source_map,
            comments: None,
            wr: writer,
        };
        emitter.emit_module(module).expect("emit module");
    }
    String::from_utf8(buf).expect("emitted source is utf-8")
}
