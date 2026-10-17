/**
 * Content-level secret detection for file snapshots.
 *
 * Name-based filtering (`.env`, fixed names, key suffixes) cannot catch keys
 * stored in ordinary config files, so `readSnapshot` also scans content for
 * values that look like credentials. Two independent signals:
 *
 * - Signal A: an assignment-shaped line (`KEY=value`, `key: value`,
 *   `"key": "value"`, `const key = "value"`) whose key name looks
 *   credential-ish AND whose value looks like a real secret (long,
 *   high-entropy, non-placeholder).
 * - Signal B: a known provider key prefix (with a word-boundary guard) followed
 *   by enough key material, or a Slack webhook URL — distinctive enough to flag
 *   without assignment context.
 *
 * Deliberate trade-offs (documented, not accidental):
 * - Whole file is excluded rather than redacted: preserves the snapshot
 *   `contentHash = sha256(raw bytes)` contract and matches the existing
 *   `private_key` exclusion semantics.
 * - Length >= 16 and entropy >= 3.5 bits/char: tuned so
 *   `password: "SuperSecret123!@#"` (17 chars, ~3.57 bits) is caught while
 *   `password123` is not. UUID-shaped values (~3.4 bits) are knowingly missed;
 *   raising the bar would trade fewer false positives for more leaks — the
 *   wrong direction for this filter.
 * - bcrypt/argon2 password hashes are flagged too: not directly usable, but
 *   offline-crackable, so conservative exclusion is acceptable.
 * - An assignment whose value opens a quote that never closes is treated as
 *   suspicious (fail-closed) rather than ignored.
 * - `;` does NOT start an inline comment: it would truncate multi-statement
 *   source lines (`const a = "x"; const apiKey = "…"`) and cause misses.
 */

/** Distinctive provider prefixes; each must be followed by >= 16 key chars to flag. */
const KNOWN_PREFIXES = [
  "sk-live-",
  "sk_test_",
  "sk_live_",
  "sk-ant-",
  "npm_",
  "pypi-",
  "hf_",
  "dop_v1_",
  "sq0csp-",
  "sq0atp-",
  "ya29.",
  "SG.",
  "sk-",
  "ghp_",
  "gho_",
  "ghu_",
  "ghs_",
  "github_pat_",
  "xoxb-",
  "xoxp-",
  "xoxa-",
  "xoxr-",
  "AKIA",
  "ASIA",
  "AIza",
  "tvly-",
  "dsk-",
  "rk_live_",
  "whsec_",
] as const;

const TOKEN_TAIL = "[A-Za-z0-9_\\-]{16,}";

/**
 * Precompiled prefix matchers, longest prefix first so `sk-live-` wins over
 * `sk-` at the same position. The lookbehind keeps `sk-` from firing inside a
 * longer word (`disk-…` must not match).
 */
const KNOWN_PREFIX_PATTERNS = [...KNOWN_PREFIXES]
  .sort((a, b) => b.length - a.length)
  .map(
    (prefix) =>
      new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(prefix)}(${TOKEN_TAIL})`, "g"),
  );

/** Slack webhook URLs carry the secret in the path, not in a token prefix. */
const SLACK_WEBHOOK_PATTERN = /hooks\.slack\.com\/services\/[A-Za-z0-9_\-/]{24,}/;

/**
 * Key names that suggest the assigned value is a credential.
 * Bare `token`/`pwd`/`credential` are too noisy alone (`getToken()`,
 * tokenizers); only compound forms (`auth_token`, `bearer_token`) count.
 */
const KEY_NAME_PATTERN =
  /(?:^|[^a-z0-9])(?:api[_-]?key|client[_-]?secret|passwd|password|private[_-]?key|secret|auth[_-]?token|access[_-]?token|api[_-]?token|bearer[_-]?token)(?:[^a-z]|$)/i;

/** Assignment shapes across .env / YAML / JSON / TOML / INI and source files, with optional quotes and declaration keywords. */
const ASSIGNMENT_PATTERN =
  /^\s*(?:(?:const|let|var|export|default|public|private|protected|static|readonly|final)\s+)*["']?([^"'=\s:]+)["']?\s*[:=]\s*([\s\S]+?)\s*$/;

const PLACEHOLDER_PATTERN =
  /^(?:your|example|test|fake|dummy|sample|changeme|placeholder|redacted|masked|todo|fixme|none|null|undefined|nil|tbd)[\w-]*$|^x+$|^<.*>$|^\*+$|^\$\{[^}]*\}$|^\{\{[^}]*\}\}$/i;

const MIN_SECRET_LENGTH = 16;
const MIN_SECRET_ENTROPY = 3.5;
const LONG_TOKEN_RUN = /[A-Za-z0-9_\-+=/]{32,}/;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shannonEntropy(value: string): number {
  const frequencies = new Map<string, number>();
  for (const char of value) frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/** True when the tail of a prefix-matched token looks like redacted/example material. */
function isPlaceholderTail(tail: string): boolean {
  const lower = tail.toLowerCase();
  return (
    /xxx|example|placeholder|redacted|masked/.test(lower) || new Set(lower).size === 1
  );
}

/** Returns the matched secret token, or undefined when no known prefix fires. */
function findSecretToken(line: string): string | undefined {
  // A placeholder match suppresses shorter-prefix matches at the same position
  // (e.g. `sk-` must not re-fire inside an already-redacted `sk-live-XXXX`).
  const placeholderAt = new Set<number>();
  for (const pattern of KNOWN_PREFIX_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      if (!placeholderAt.has(match.index)) {
        if (match[1] !== undefined && !isPlaceholderTail(match[1])) return match[0];
        placeholderAt.add(match.index);
      }
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return undefined;
}

function cleanValue(raw: string): string {
  const value = raw.trim().replace(/[,;]$/, "").trim();
  const quote = value[0];
  if (value.length < 2 || (quote !== '"' && quote !== "'" && quote !== "`")) return value;
  for (let i = 1; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === quote) return value.slice(1, i).trim();
  }
  return value;
}

function isPlaceholder(value: string): boolean {
  return value.length === 0 || PLACEHOLDER_PATTERN.test(value);
}

/** True when a value opens a quote that is never closed (fail-closed: suspicious). */
function hasUnclosedQuote(raw: string): boolean {
  const text = raw.trim();
  const quote = text[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return false;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return false;
  }
  return true;
}

function looksLikeSecretValue(value: string): boolean {
  if (value.length < MIN_SECRET_LENGTH || isPlaceholder(value)) return false;
  if (findSecretToken(value) !== undefined) return true;
  if (LONG_TOKEN_RUN.test(value)) return true;
  return shannonEntropy(value) >= MIN_SECRET_ENTROPY;
}

/**
 * Join physical lines into logical lines, tracking quote state across lines so
 * multi-line quoted values (e.g. PEM blocks in `KEY="…"`) stay one unit.
 * Quote-aware comment handling: `#` and `//` start a comment only outside
 * quotes, so `#` inside a value (`pass#word`) and `//` in URLs (`https://…`)
 * are preserved. `//` after `:` is not a comment (URL schemes).
 */
function logicalLines(source: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const physical of source.split("\n")) {
    let stripped = "";
    let i = 0;
    while (i < physical.length) {
      const char = physical[i]!;
      if (quote !== null) {
        if (char === "\\" && i + 1 < physical.length) {
          stripped += char + physical[i + 1];
          i += 2;
          continue;
        }
        if (char === quote) quote = null;
        stripped += char;
        i++;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
        stripped += char;
        i++;
      } else if (char === "#") {
        break;
      } else if (char === "/" && physical[i + 1] === "/" && physical[i - 1] !== ":") {
        break;
      } else {
        stripped += char;
        i++;
      }
    }
    current += (current.length > 0 ? "\n" : "") + stripped;
    if (quote === null) {
      lines.push(current);
      current = "";
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** True when the source contains at least one line that looks like a stored secret. */
export function containsLikelySecret(source: string): boolean {
  for (const line of logicalLines(source)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    if (findSecretToken(trimmed) !== undefined) return true;
    if (SLACK_WEBHOOK_PATTERN.test(trimmed)) return true;
    const assignment = ASSIGNMENT_PATTERN.exec(trimmed);
    if (
      assignment?.[1] !== undefined &&
      assignment[2] !== undefined &&
      KEY_NAME_PATTERN.test(assignment[1])
    ) {
      const rawValue = assignment[2];
      if (hasUnclosedQuote(rawValue)) return true;
      if (looksLikeSecretValue(cleanValue(rawValue))) return true;
    }
  }
  return false;
}
