//! TSX parsing helper, shared by the conformance tests and the daemon's
//! `analyze` entry point.

use swc_core::common::{sync::Lrc, FileName, SourceMap};
use swc_core::ecma::ast::Module;
use swc_core::ecma::parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};

#[derive(Debug)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "parse error: {}", self.0)
    }
}

/// Parsed TSX, plus the `SourceMap` and the file's start offset so callers can
/// turn absolute spans into file-relative byte positions.
pub struct Parsed {
    pub module: Module,
    pub source_map: Lrc<SourceMap>,
    pub start_pos: u32,
}

/// Parse a TSX source string into a [`Module`].
pub fn parse_tsx(file: &str, src: &str) -> Result<Parsed, ParseError> {
    let source_map: Lrc<SourceMap> = Default::default();
    let fm = source_map.new_source_file(
        Lrc::new(FileName::Custom(file.to_string())),
        src.to_string(),
    );
    let start_pos = fm.start_pos.0;
    let lexer = Lexer::new(
        Syntax::Typescript(TsSyntax {
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        StringInput::from(&*fm),
        None,
    );
    let mut parser = Parser::new_from(lexer);
    let module = parser
        .parse_module()
        .map_err(|e| ParseError(format!("{:?}", e)))?;
    Ok(Parsed {
        module,
        source_map,
        start_pos,
    })
}
