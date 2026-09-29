"""Compare fixed upstream and this checkout; stdout is JSONL, diagnostics go to stderr."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("baseline", type=Path, help="clean checkout of 2dc1d3c")
args = parser.parse_args()
candidate = Path(__file__).resolve().parents[2]
baseline = args.baseline.resolve()
commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=baseline, text=True).strip()
if not commit.startswith("2dc1d3c"):
    raise SystemExit("Baseline must be upstream 2dc1d3c")
subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=baseline, check=True)
images = {}
for arm, root in [("before", baseline), ("after", candidate)]:
    image = "jevgrep-tree-bench-" + arm
    subprocess.run(["docker", "build", "-q", "-f", "test/Dockerfile", "-t", image, "."], cwd=root, stdout=sys.stderr, check=True, timeout=600)
    images[arm] = subprocess.check_output(["docker", "image", "inspect", image, "--format", "{{.Id}}"], text=True).strip()
metadata = {"baseline": commit, "images": images, "sourceSHA256": {str(p.relative_to(candidate)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((candidate / "packages/core/src").iterdir()) if p.is_file()}, "node": "22 (image)", "cpus": 2, "memory": "2g"}
print(json.dumps({"metadata": metadata}), flush=True)
for language in ["python", "typescript"]:
    for count in [100, 1500]:
        hashes = set()
        for trial in range(5):
            for arm in ["before", "after"]:
                command = ["docker", "run", "--rm", "--network", "none", "--read-only", "--cpus", "2", "--memory", "2g", "--tmpfs", "/tmp", "-v", str(candidate / "test/parser/tree-sitter.bench.mjs") + ":/work/test/parser/tree-sitter.bench.mjs:ro", images[arm], "node", "--experimental-strip-types", "test/parser/tree-sitter.bench.mjs", language, str(count)]
                result = subprocess.run(command, text=True, capture_output=True, timeout=45, check=True)
                row = json.loads(result.stdout)
                hashes.add(row["outputHash"])
                print(json.dumps(dict(arm=arm, trial=trial, **row)), flush=True)
        if len(hashes) != 1:
            raise SystemExit(f"Output mismatch for {language}/{count}")
