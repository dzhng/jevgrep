import { expect, test } from "bun:test";
import { containsLikelySecret } from "../src/secrets";

// All key-like values below are synthetic and invalid; they only exercise the
// detector's shape heuristics. Realistic shapes are deliberate: the detector
// must fire on the shapes from dzhng/jevgrep#51.
const FAKE_OPENAI = "sk-K7q2Mv9xT4pL8nR3wY6bD1fH5jG0cS9aE2dZ7xU4v";
const FAKE_STRIPE = "sk_live_9fH2kL7mQ4vT8wX3yZ6bN1pA5sD0gJcE";
const FAKE_GITHUB = "ghp_aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zAbC5d";
const FAKE_TAVILY = "tvly-DEV-4fK8qN2mT6vX9yZ3bD7hJ1pL5sW8aC0eG";
const FAKE_PASSWORD = "xQ9#vL2$mK8@nB4!pT6&wZ3*";

test("flags the four secret shapes from jevgrep#51", () => {
  // settings.json: an env block with OPENAI_API_KEY
  expect(
    containsLikelySecret(`{\n  "env": {\n    "OPENAI_API_KEY": "${FAKE_OPENAI}"\n  }\n}`),
  ).toBe(true);
  // keys.env: STRIPE_SECRET_KEY
  expect(containsLikelySecret(`STRIPE_SECRET_KEY=${FAKE_STRIPE}\n`)).toBe(true);
  // config.toml: api_key
  expect(containsLikelySecret(`[service]\napi_key = "${FAKE_GITHUB}"\n`)).toBe(true);
  // keys.json: bare key array (no key-like name; caught by known prefix)
  expect(containsLikelySecret(`{\n  "keys": ["${FAKE_TAVILY}"]\n}`)).toBe(true);
});

test("flags yaml-style secrets and bearer tokens", () => {
  expect(containsLikelySecret(`database:\n  password: "${FAKE_PASSWORD}"\n`)).toBe(true);
  expect(
    containsLikelySecret(`headers:\n  authorization: Bearer ${FAKE_GITHUB}\n`),
  ).toBe(true);
});

test("ignores placeholders, short and low-entropy values", () => {
  expect(containsLikelySecret(`OPENAI_API_KEY=YOUR_API_KEY_HERE\n`)).toBe(false);
  expect(containsLikelySecret(`OPENAI_API_KEY=\n`)).toBe(false);
  expect(containsLikelySecret(`api_key = "abc123"\n`)).toBe(false);
  expect(containsLikelySecret(`"password": "password123"\n`)).toBe(false);
  expect(containsLikelySecret(`api_key = "changeme"\n`)).toBe(false);
  expect(containsLikelySecret(`secret: "***"\n`)).toBe(false);
});

test("ignores ordinary code that merely mentions key-like words", () => {
  expect(
    containsLikelySecret(`const token = getToken();\nfunction authenticate(token) {\n  return token;\n}\n`),
  ).toBe(false);
  expect(
    containsLikelySecret(`// Set your api_key in the config file before running.\n`),
  ).toBe(false);
  expect(
    containsLikelySecret(`# The password field is required by the login form.\n`),
  ).toBe(false);
  expect(
    containsLikelySecret(
      `export function loadSettings() {\n  return readFileSync("settings.json", "utf8");\n}\n`,
    ),
  ).toBe(false);
});

test("regression: review blockers #1-#3", () => {
  // #1: `sk-` inside a longer word must not flag (`disk-` contains `sk-`).
  expect(containsLikelySecret(`backup: disk-abcdef1234567890ABCDEF\n`)).toBe(false);
  // #1 control: a real `sk-` token still flags.
  expect(
    containsLikelySecret(`key: "sk-abcdef1234567890ABCDEF"\n`),
  ).toBe(true);
  // #2: multi-line quoted values are joined before detection.
  expect(
    containsLikelySecret(
      'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n' +
        "MIIBOgIBAAJBAK7i3vF5pL8nW3yB6dF1hJ5kA0cE2gZ\n" +
        '-----END RSA PRIVATE KEY-----"\n',
    ),
  ).toBe(true);
  // #2 conservative: an assignment whose quote never closes is suspicious.
  expect(containsLikelySecret(`API_KEY="abcdef1234567890abcdef\n`)).toBe(true);
  // #3: environment-variable / template placeholders are not secrets.
  expect(containsLikelySecret(`API_KEY=${"${SOME_VERY_LONG_VARIABLE_NAME_HERE}"}\n`)).toBe(false);
  expect(containsLikelySecret(`api_key: "{{MY_SECRET_VALUE_HERE}}"\n`)).toBe(false);
  expect(containsLikelySecret(`password = "REDACTED"\n`)).toBe(false);
  // #3 control: redacted doc examples with a real prefix shape stay unflagged.
  expect(containsLikelySecret(`# e.g. sk-live-XXXXXXXXXXXXXXXX\n`)).toBe(false);
});

test("regression: review majors #4-#7", () => {
  // #4: more provider prefixes.
  expect(
    containsLikelySecret(`NPM_TOKEN=npm_abcDEF1234567890abcdef1234567890ab\n`),
  ).toBe(true);
  expect(
    containsLikelySecret(`pypi_token = "pypi-AgEIcHlwaS5vcmcCJGU5Y2YxMjM0NTY3ODkw"\n`),
  ).toBe(true);
  // #5: bearer_token key name.
  expect(
    containsLikelySecret(`bearer_token = "7fK8qN2mT6vX9yZ3bD4hJ1pL5sW8aC0eG2i"\n`),
  ).toBe(true);
  // #6: inline comments are stripped quote-aware; they must not decide detection.
  expect(
    containsLikelySecret(`API_KEY=abc # a very long production comment adding entropy here\n`),
  ).toBe(false);
  expect(
    containsLikelySecret(
      `API_KEY=sk-K7q2Mv9xT4pL8nR3wY6bD1fH5jG0cS9aE2dZ7xU4v # production\n`,
    ),
  ).toBe(true);
  // `#` inside a quoted value is preserved, not treated as a comment.
  expect(containsLikelySecret(`password = "xQ9#vL2$mK8@nB4!pT6&wZ3*"\n`)).toBe(true);
  // #7: short-but-strong values (16+) are caught.
  expect(containsLikelySecret(`password: "SuperSecret123!@#"\n`)).toBe(true);
  // Declaration keywords in source files are handled.
  expect(
    containsLikelySecret(`const password = "SuperSecret123!@#";\n`),
  ).toBe(true);
  // CRLF line endings work.
  expect(containsLikelySecret(`"OPENAI_API_KEY": "sk-K7q2Mv9xT4pL8nR3wY6bD1fH5jG0cS9aE2dZ7xU4v"\r\n`)).toBe(true);
  // Slack webhook URLs flag.
  expect(
    containsLikelySecret(
      `url = "https://hooks.slack.com/services/T12345678/B87654321/abcdefghijklmnopqrstuvwx"\n`,
    ),
  ).toBe(true);
});
