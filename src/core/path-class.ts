import { isTestPath, type TestPathProfile } from "./test-paths.ts";

/** What kind of file a repo-relative path is, for gates that only care about production code. */
export type PathClass = "source" | "test" | "docs" | "config" | "generated" | "other";

const SOURCE_EXT =
  /\.(?:[cm]?[jt]sx?|py|rb|rs|go|java|kt|kts|scala|cs|ex|exs|php|swift|c|cc|cpp|h|hpp|sh|lua|clj|hs|ml)$/;
const DOCS_EXT = /\.(?:md|mdx|rst|txt|adoc)$/i;
const DOCS_NAME = /^(?:LICENSE|LICENCE|CHANGELOG|NOTICE|AUTHORS|CONTRIBUTING)(?:\..*)?$/i;
const CONFIG_EXT = /\.(?:json|jsonc|toml|ya?ml|ini|cfg|conf|env|properties)$/i;
const CONFIG_NAME = /^(?:Dockerfile|Makefile|justfile|Rakefile|Gemfile|Procfile)$/i;
const GENERATED_DIR =
  /(?:^|\/)(?:node_modules|dist|target|build|coverage|__generated__|generated|\.next|vendor)\//;
const GENERATED_FILE =
  /(?:\.generated\.|\.gen\.|\.min\.[cm]?js$|\.pb\.go$|\.snap$|(?:^|\/)(?:package-lock\.json|Cargo\.lock|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$|\.lock$)/;

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Classifies a repo-relative path by convention; tests win over docs/config so test data stays guarded. */
export function classifyPath(input: string, profile?: TestPathProfile): PathClass {
  const path = input.replace(/^\.\//, "");
  const name = basename(path);
  if (GENERATED_DIR.test(path) || GENERATED_FILE.test(path)) return "generated";
  if (isTestPath(path, profile) && SOURCE_EXT.test(path)) return "test";
  if (DOCS_EXT.test(name) || DOCS_NAME.test(name) || /^docs\//.test(path)) return "docs";
  if (
    CONFIG_EXT.test(name) ||
    CONFIG_NAME.test(name) ||
    name.startsWith(".") ||
    /^\.github\//.test(path)
  ) {
    return "config";
  }
  if (SOURCE_EXT.test(path)) return "source";
  return isTestPath(path, profile) ? "test" : "other";
}
