ARG PACKAGE_STAGE=builder
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS bun

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS builder
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /checkout
COPY package.json bun.lock turbo.json ./
COPY apps/cli/package.json apps/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/typescript-config packages/typescript-config
RUN bun install --frozen-lockfile
COPY apps/cli apps/cli
COPY packages/core packages/core
COPY scripts/build-cli.ts scripts/package-notices.mjs scripts/parser-assets.mjs scripts/
COPY scripts/licenses scripts/licenses
COPY LICENSE LICENSE
COPY skills skills
RUN bun run --cwd apps/cli build \
    && mkdir -p /artifacts \
    && npm pack ./apps/cli --pack-destination /artifacts \
    && mv /artifacts/*.tgz /artifacts/jevgrep.tgz \
    && cp skills/jevgrep/SKILL.md /artifacts/canonical-skill.md

FROM scratch AS prebuilt
COPY .package-input/jevgrep.tgz /artifacts/jevgrep.tgz
COPY .package-input/canonical-skill.md /artifacts/canonical-skill.md

FROM ${PACKAGE_STAGE} AS package

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS install
COPY --from=package /artifacts/jevgrep.tgz /tmp/jevgrep.tgz
RUN npm install --global --prefix /opt/jevgrep --ignore-scripts --omit=dev /tmp/jevgrep.tgz \
    && rm -rf /tmp/jevgrep.tgz /root/.npm

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runtime
COPY --from=install /opt/jevgrep /opt/jevgrep
COPY --from=package /artifacts/canonical-skill.md /test/canonical-skill.md
COPY test/installed.test.mjs /test/installed.test.mjs
COPY test/fixtures/provider-route.mjs /test/fixtures/provider-route.mjs
COPY --chmod=755 test/fixtures/skill-installer.mjs /test/fixtures/skill-installer.mjs
ENV PATH=/opt/jevgrep/bin:/usr/local/bin:/usr/bin:/bin \
    JEVGREP_INSTALLED_BINARY=/opt/jevgrep/bin/jg \
    JEVGREP_INSTALLED_PACKAGE=/opt/jevgrep/lib/node_modules/@dzhng/jevgrep \
    JEVGREP_EXPECTED_SKILL=/test/canonical-skill.md
USER node
WORKDIR /tmp
CMD ["node", "--test", "--test-concurrency=1", "/test/installed.test.mjs"]
