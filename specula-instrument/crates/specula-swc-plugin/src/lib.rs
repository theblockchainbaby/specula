//! Specula SWC plugin — `transform` mode entry point.
//!
//! Thin wrapper: all path logic lives in `specula-core`, so the plugin and the
//! daemon can never compute paths from separate code.

use specula_core::{process, Mode};
use swc_core::ecma::ast::Program;
use swc_core::plugin::metadata::{
    TransformPluginMetadataContextKind, TransformPluginProgramMetadata,
};
use swc_core::plugin::plugin_transform;

/// SWC plugin entry point — instruments every JSX element with `data-spc` /
/// `data-spc-env` attributes.
///
/// `Filename` from the plugin context is the full absolute path under Webpack
/// (the v1 runtime). The `data-spc` id is the *canonical Specula path*, which
/// is project-relative — an absolute path would leak the author's home
/// directory into shipped HTML and would not match across machines. The plugin
/// strips the project `root` (passed as plugin config) to produce that
/// relative form; the daemon keys its source map by the same relative path.
///
/// With no `root` configured the filename passes through unchanged — that is
/// the isolation-test path, where there is no project to be relative to.
#[plugin_transform]
pub fn specula_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let filename = metadata
        .get_context(&TransformPluginMetadataContextKind::Filename)
        .unwrap_or_else(|| "unknown.tsx".to_string());
    let file = project_relative(&filename, config_root(&metadata).as_deref());

    if let Program::Module(module) = &mut program {
        process(module, &file, Mode::Transform);
    }
    program
}

/// Read the `root` string from the plugin's JSON config, if configured.
///
/// The config arrives as a JSON string (`{"root":"/abs/path/to/project"}`).
/// Anything malformed — absent config, non-JSON, no `root` key — yields
/// `None`, and the filename is then emitted unchanged rather than the plugin
/// failing the build.
fn config_root(metadata: &TransformPluginProgramMetadata) -> Option<String> {
    let config = metadata.get_transform_plugin_config()?;
    let value: serde_json::Value = serde_json::from_str(&config).ok()?;
    value.get("root")?.as_str().map(str::to_string)
}

/// Make `filename` project-relative by stripping the `root` prefix.
///
/// The prefix is matched with a trailing separator so `…/apps/play` can never
/// be mistaken for the directory `…/apps/playground`. If the file is not under
/// `root` (or no `root` was given) the filename is returned unchanged.
fn project_relative(filename: &str, root: Option<&str>) -> String {
    let Some(root) = root else {
        return filename.to_string();
    };
    let prefix = format!("{}/", root.trim_end_matches('/'));
    match filename.strip_prefix(&prefix) {
        Some(relative) => relative.to_string(),
        None => filename.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::project_relative;

    #[test]
    fn strips_the_project_root() {
        assert_eq!(
            project_relative("/Users/me/proj/app/page.tsx", Some("/Users/me/proj")),
            "app/page.tsx",
        );
    }

    #[test]
    fn tolerates_a_trailing_slash_on_root() {
        assert_eq!(
            project_relative("/Users/me/proj/app/page.tsx", Some("/Users/me/proj/")),
            "app/page.tsx",
        );
    }

    #[test]
    fn requires_a_separator_boundary() {
        // `/Users/me/proj` must not match the sibling `/Users/me/project`.
        assert_eq!(
            project_relative("/Users/me/project/app/page.tsx", Some("/Users/me/proj")),
            "/Users/me/project/app/page.tsx",
        );
    }

    #[test]
    fn passes_through_when_no_root() {
        assert_eq!(
            project_relative("/Users/me/proj/app/page.tsx", None),
            "/Users/me/proj/app/page.tsx",
        );
    }
}
