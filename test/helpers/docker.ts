import { test } from "bun:test";
export const testIfDocker = process.env.JEVGREP_TEST_IN_DOCKER === "1" ? test : test.skip;
/** Windows lacks POSIX modes, chmod 0 denial, FIFOs, pty and newline filenames; those fixtures are POSIX-only. */
export const posix = process.platform !== "win32";
export const testIfDockerPosix = posix ? testIfDocker : test.skip;
