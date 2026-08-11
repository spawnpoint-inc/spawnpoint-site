#!/bin/bash
#
# spawnpoint vm-init: what a spawnpoint machine runs to be able to build and
# run a Docker deploy (runtime: "docker").
#
# Published for transparency: this is exactly the logic the deploy path runs
# over SSH on first use (ensureDocker in the spawnpoint source), and it is the
# cloud-init user-data spawnpoint will pass at machine-create when the
# platform ships cloud-init support. Nothing here is fetched from outside
# Ubuntu's own package archive: no third-party apt repos, no piped installers.
#
# Idempotent: safe to run on a machine that already has the engine.
set -euo pipefail

command -v docker >/dev/null 2>&1 || {
  apt-get update -qq
  apt-get install -y -qq docker.io
}
systemctl enable --now docker >/dev/null 2>&1 || true

docker --version
