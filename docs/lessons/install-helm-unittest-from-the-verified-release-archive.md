---
title: 'On Helm 4, install helm-unittest by unpacking its checksum-verified release archive into the plugins directory; `helm plugin install` needs `--verify=false` and its hook fails on macOS'
areas: ['ci', 'testing']
topics: ['helm', 'helm-unittest', 'kubeconform', 'github-actions', 'macos', 'supply-chain']
---

# On Helm 4, install helm-unittest by unpacking its checksum-verified release archive into the plugins directory; `helm plugin install` needs `--verify=false` and its hook fails on macOS

**In short**: `helm plugin install https://github.com/helm-unittest/helm-unittest.git --version v1.2.1` on Helm 4 stops with "plugin source does not support verification. Use --verify=false". With that flag the plugin's install hook downloads the binary and checks it against a checksum file from the same release, and on macOS the hook fails anyway, because the system `sha256sum` takes neither `--status` nor `-s`. The release archive (`helm-unittest-<os>-<arch>-<version>.tgz`) holds the binary and `plugin.yaml`, so unpacking it into `$(helm env HELM_PLUGINS)/helm-unittest` after checking a pinned SHA-256 is a complete install, and the same method works in CI and locally.

**Context**: Self-hosting Task 9 added `.github/workflows/helm.yml` (helm lint, helm-unittest, kubeconform) and needed the plugin on Helm 4.2.4 locally (macOS arm64) and on `ubuntu-latest`.

**Problem**: The failing hook leaves the plugin listed by `helm plugin list` without its binary (`fork/exec .../untt-macos-arm64: no such file or directory`). Installing from an unpacked archive directory with `helm plugin install <dir>` registers it but exits non-zero, because `plugin.yaml` names an `install-binary.sh` hook the archive does not contain; under `bash -e` that stops the workflow step.

**Rule**:

- CI: download the archive for the pinned version, `echo "<sha256>  <file>" | sha256sum -c -`, `tar -xzf` it into `$(helm env HELM_PLUGINS)/helm-unittest`, then `helm unittest --help` as a smoke check. Take the SHA-256 from the release's `helm-unittest-checksum.sha` once and pin it in the workflow, as for kubeconform.
- Locally on macOS: the same steps with `shasum -a 256 -c`. The checksum file lists paths as `./_dist/<file>`, so either recreate that layout or compare the hash by hand.
- Bump the version and the pinned hash together.

**Applies to**: `.github/workflows/helm.yml` in GatoJS and in projects, and any Helm plugin installed on Helm 4.
