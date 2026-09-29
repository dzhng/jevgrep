import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Use emitted inputs, so the notice follows the actual bundled dependency graph. */
export async function bundledNotices(metafile, root) {
  const packages = new Map();
  const retainedLicenses = {
    "@ai-sdk/provider-utils@5.0.45": "vercel-ai.LICENSE",
    "@ai-sdk/provider-utils@5.0.49": "vercel-ai.LICENSE",
  };
  let needsApacheTerms = false;
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs)) {
      if (!contribution.bytesInOutput || !input.split("/").includes("node_modules")) continue;
      let directory = dirname(resolve(root, input));
      while (directory.split("/").includes("node_modules")) {
        let metadata;
        try {
          metadata = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (metadata?.name && metadata.version) {
          const key = `${metadata.name}@${metadata.version}`;
          if (!packages.has(key)) {
            const files = (await readdir(directory, { withFileTypes: true }))
              .filter(
                (entry) =>
                  entry.isFile() && /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(entry.name),
              )
              .map((entry) => entry.name)
              .sort();
            if (!files.length && !retainedLicenses[key])
              throw new Error(`Bundled dependency ${key} has no license file`);
            if (metadata.license === "Apache-2.0") needsApacheTerms = true;
            const texts = await Promise.all(
              files.map(async (file) => {
                const text = await readFile(resolve(directory, file), "utf8");
                if (!text.trim()) throw new Error(`Empty license file in ${key}`);
                return `--- ${file} ---\n${text.trimEnd()}\n`;
              }),
            );
            if (!files.length)
              texts.push(
                await readFile(
                  new URL(`./licenses/${retainedLicenses[key]}`, import.meta.url),
                  "utf8",
                ),
              );
            packages.set(
              key,
              `=== ${key} (${metadata.license ?? "see license below"}) ===\n${texts.join("\n")}`,
            );
          }
          break;
        }
        directory = dirname(directory);
      }
      if (!directory.split("/").includes("node_modules"))
        throw new Error(`No package metadata for bundled input ${input}`);
    }
  }
  if (!packages.size) throw new Error("Bundle metadata contains no dependency licenses");
  if (needsApacheTerms)
    packages.set(
      "Apache License 2.0 terms",
      `=== Apache License 2.0 terms ===\n${await readFile(new URL("./licenses/Apache-2.0.txt", import.meta.url), "utf8")}`,
    );
  return `Third-party notices for bundled JavaScript dependencies\n\n${[...packages]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .join("\n")}`;
}

/** The external runtime's npm archive omits its upstream/component license files. */
export async function pythonRuntimeNotices(version) {
  if (version !== "0.25.1")
    throw new Error("Review Python runtime notices before upgrading Pyodide");
  const sources = [
    ["zlib 1.2.13", "zlib-1.2.13.LICENSE", "https://github.com/madler/zlib/tree/v1.2.13"],
    ["bzip2 1.0.6", "bzip2-1.0.6.LICENSE", "https://github.com/emscripten-ports/bzip2/tree/1.0.6"],
    ["Pyodide 0.25.1", "pyodide-0.25.1.LICENSE", "https://github.com/pyodide/pyodide/tree/0.25.1"],
    ["CPython 3.11.3", "cpython-3.11.3.LICENSE", "https://github.com/python/cpython/tree/v3.11.3"],
    [
      "CPython bundled component notices",
      "cpython-3.11.3-license.rst",
      "https://github.com/python/cpython/blob/v3.11.3/Doc/license.rst",
    ],
    [
      "Emscripten 3.1.46",
      "emscripten-3.1.46.LICENSE",
      "https://github.com/emscripten-core/emscripten/tree/3.1.46",
    ],
    ...["musl", "compiler-rt", "libcxx", "libcxxabi", "libunwind"].map((name) => [
      `Emscripten ${name}`,
      `emscripten-3.1.46-${name}.LICENSE`,
      `https://github.com/emscripten-core/emscripten/tree/3.1.46/system/lib`,
    ]),
    [
      "libffi f08493d",
      "libffi-f08493d.LICENSE",
      "https://github.com/libffi/libffi/tree/f08493d249d2067c8b3207ba46693dd858f95db3",
    ],
    [
      "hiwire 49f3450",
      "hiwire-49f3450.LICENSE",
      "https://github.com/hoodmane/hiwire/tree/49f3450e34f3f50d4b8296e782dc321bb2e3264e",
    ],
    [
      "Pyodide npm metadata: Apache-2.0 terms",
      "Apache-2.0.txt",
      "https://github.com/pyodide/pyodide/blob/0.25.1/src/js/package.json",
    ],
  ];
  return (
    "\nBundled Python runtime notices\n\n" +
    "Pyodide is bundled unmodified in this archive. Its package metadata declares Apache-2.0; " +
    "the tagged upstream source is MPL-2.0. This metadata label does not replace the component licenses below. " +
    "Corresponding source (including Pyodide's CPython patches and build configuration) is available at the linked versions. " +
    "The bundled base-64 and ws dependencies retain their own LICENSE files.\n\n" +
    (
      await Promise.all(
        sources.map(
          async ([name, file, source]) =>
            `=== ${name} ===\nSource: ${source}\n${await readFile(new URL(`./licenses/${file}`, import.meta.url), "utf8")}\n`,
        ),
      )
    ).join("\n")
  );
}
