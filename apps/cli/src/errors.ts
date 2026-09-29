/** Only authored messages and sanitized provider diagnostics are safe to print; raw SDK/OS errors can contain secrets. */
export class CliError extends Error {}
