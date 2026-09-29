#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
jg_test_image=$(docker build -q -f test/Dockerfile -t jevgrep-test .)
docker run --rm --network none --read-only --user 65534:65534 --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 2 --pids-limit 256 --tmpfs /tmp:rw,exec,nosuid,nodev,size=512m "$jg_test_image" "$@"
