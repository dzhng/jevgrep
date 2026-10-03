FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS bun
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY package.json bun.lock turbo.json ./
COPY apps/cli/package.json apps/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/typescript-config packages/typescript-config
RUN bun install --frozen-lockfile
COPY apps/cli apps/cli
COPY packages/core packages/core
COPY test test
COPY scripts scripts
COPY skills skills
COPY LICENSE LICENSE
RUN bun scripts/build-cli.ts
RUN mkdir -p /opt/npm-cache && cd apps/cli && npm pack --ignore-scripts --pack-destination /opt && npm install --prefix /opt/npm-warm --cache /opt/npm-cache --ignore-scripts --no-audit --no-fund /opt/dzhng-jevgrep-*.tgz && chmod -R a+rX /opt/npm-cache
ENV npm_config_cache=/opt/npm-cache npm_config_offline=true
COPY evals/implementation/swebench/installed.py evals/implementation/swebench/gateway_broker.py evals/implementation/swebench/test_installed.py evals/implementation/swebench/
COPY evals/implementation/swebench/fixed-baselines.json evals/implementation/swebench/
ENV JEVGREP_TEST_IN_DOCKER=1 HOME=/tmp/jevgrep-home XDG_CONFIG_HOME=/tmp/jevgrep-config XDG_CACHE_HOME=/tmp/jevgrep-cache
CMD ["bash", "scripts/test-suite.sh"]
