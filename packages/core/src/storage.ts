import { homedir } from "node:os";
import { join } from "node:path";

/** The one source of Jevgrep's config and cache locations; filesystem policy protects the same paths. */
export function storageDirectory(
  kind: "config" | "cache",
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
) {
  const xdg = kind === "config" ? env.XDG_CONFIG_HOME : env.XDG_CACHE_HOME;
  if (xdg) return join(xdg, "jevgrep");
  if (platform === "win32") {
    const base = kind === "config" ? env.APPDATA : env.LOCALAPPDATA;
    return join(
      base || join(homedir(), "AppData", kind === "config" ? "Roaming" : "Local"),
      "jevgrep",
    );
  }
  return join(homedir(), kind === "config" ? ".config" : ".cache", "jevgrep");
}
