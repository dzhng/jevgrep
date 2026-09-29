import { dirname } from "node:path";
import type { FilesystemReader } from "./filesystem";
import type { FileEvidence } from "./types";

/** Locate scoped repository guidance without executing it. */
export async function repositoryContext(reader: FilesystemReader, files: FileEvidence[]) {
  const directories = new Set(["."]);
  for (const file of files)
    for (let directory = dirname(file.path); directory !== "."; directory = dirname(directory))
      directories.add(directory);
  const instructionFiles: string[] = [];
  let instructionLookupIncomplete = false;
  for (const directory of directories) {
    const path = directory === "." ? "AGENTS.md" : `${directory}/AGENTS.md`;
    const result = await reader.lookupFile(path);
    if (result.status === "file") instructionFiles.push(path);
    else if (result.status !== "excluded" || result.reason !== "missing")
      instructionLookupIncomplete = true;
  }
  return { instructionFiles, instructionLookupIncomplete };
}
