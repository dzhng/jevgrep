import { basename, extname } from "node:path";
import ignore from "ignore";

/** Filename categories narrow search scope; they do not enable decoding binary formats. */
export const fileTypes = [
  "code",
  "config",
  "docs",
  "data",
  "audio",
  "video",
  "archives",
  "logs",
  "temp",
  "unknown",
] as const;
export type FileType = (typeof fileTypes)[number];
export class FileTypeError extends Error {}

export function isFileType(value: unknown): value is FileType {
  return typeof value === "string" && fileTypes.includes(value as FileType);
}

export function parseFileTypes(values: readonly string[]): FileType[] {
  const types = values.flatMap((value) => value.split(",").map((part) => part.trim()));
  if (types.some((type) => !isFileType(type)))
    throw new FileTypeError(
      `Unknown or empty file category. Choose from: ${fileTypes.join(", ")}.`,
    );
  return [...new Set(types as FileType[])].sort();
}

// Ambiguous formats have one default category; repository overrides take precedence.
const extensions: Partial<Record<FileType, string>> = {
  code: "c h cc hh cpp hpp cxx hxx cs fs fsx vb java kt kts scala clj cljs cljc edn groovy go rs py pyw pyi pyx rb php pl pm r R jl lua sh bash zsh fish ps1 psm1 bat cmd js jsx mjs cjs ts tsx mts cts vue svelte astro html htm css scss sass less sql swift m mm dart ex exs erl hrl hs lhs ml mli elm f f90 f95 for pas asm s v vhd vhdl zig nim sol tf tfvars proto graphql gql cmake",
  config: "yaml yml toml ini cfg conf config properties env editorconfig",
  docs: "md mdx markdown rst txt adoc asciidoc tex org pod",
  data: "json jsonl ndjson csv tsv xml arff parquet arrow feather avro orc h5 hdf5 hdf npy npz mat pkl pickle sqlite sqlite3 db sqlitedb ipynb geojson kml gpx pstats",
  audio: "mp3 wav flac aac ogg oga opus m4a aiff aif wma mid midi",
  video: "mp4 m4v mkv mov avi webm mpg mpeg m2ts vob flv wmv 3gp",
  archives: "zip gz bz2 xz zst zstd tar tgz tbz tbz2 txz 7z rar jar war whl deb rpm iso dmg cab",
  logs: "log out err trace",
  temp: "tmp temp bak swp swo orig rej",
};
const extensionTypes = new Map<string, FileType>(
  Object.entries(extensions).flatMap(([type, names]) =>
    names.split(" ").map((name) => [`.${name.toLowerCase()}`, type as FileType] as const),
  ),
);
const codeNames = new Set([
  "makefile",
  "gnumakefile",
  "dockerfile",
  "containerfile",
  "rakefile",
  "gemfile",
  "justfile",
  "jenkinsfile",
  "vagrantfile",
  "build",
  "workspace",
  "cmakelists.txt",
]);
const configNames = new Set([
  ".editorconfig",
  ".env",
  ".gitignore",
  ".ignore",
  ".gitattributes",
  ".dockerignore",
  ".npmrc",
  ".babelrc",
  ".eslintrc",
  ".prettierrc",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "cargo.lock",
  "tsconfig.json",
  "jsconfig.json",
  "composer.json",
  "deno.json",
  "deno.jsonc",
]);

export function classifyFile(path: string): FileType {
  const name = basename(path).toLowerCase();
  if (name.endsWith("~") || /^#.*#$/.test(name)) return "temp";
  if (/\.log(?:\.\d+)?(?:\.(?:gz|bz2|xz|zst))?$/.test(name)) return "logs";
  if (codeNames.has(name) || name.startsWith("dockerfile.")) return "code";
  if (configNames.has(name) || name.startsWith(".env.") || /^tsconfig\..*\.json$/.test(name))
    return "config";
  return extensionTypes.get(extname(name)) ?? "unknown";
}

/** A root-local JSON map of root-relative gitignore patterns to categories; last match wins. */
export function typeClassifier(source?: string): (path: string) => FileType {
  if (source === undefined) return classifyFile;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new FileTypeError(
      ".jevgrep-types.json must be a JSON object mapping patterns to file categories.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FileTypeError(
      ".jevgrep-types.json must be a JSON object mapping patterns to file categories.",
    );
  const rules = Object.entries(value).map(([pattern, type]) => {
    if (
      !pattern.trim() ||
      /^[!#]/.test(pattern) ||
      /[\r\n]/.test(pattern) ||
      /(?:^|[^\\])(?:\\\\)*\\$/.test(pattern) ||
      !isFileType(type)
    )
      throw new FileTypeError(".jevgrep-types.json contains an invalid pattern or file category.");
    return { matcher: ignore().add(pattern), type };
  });
  return (path) => {
    for (let i = rules.length - 1; i >= 0; i--)
      if (rules[i]!.matcher.ignores(path)) return rules[i]!.type;
    return classifyFile(path);
  };
}
