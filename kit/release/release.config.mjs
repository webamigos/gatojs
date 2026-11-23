export default {
  branches: ["main"],
  repositoryUrl: "git@github.com:webamigos/gatojs.git",
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "minor" },
          { subject: "*\\[no release\\]*", release: false },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "node kit/release/set-kit-version.mjs ${nextRelease.version} && node .wa/bin/wa.mjs kit sync",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["kit/kit.json", ".wa/kit.json"],
        message: "chore(release): ${nextRelease.version} [skip ci]",
      },
    ],
    "@semantic-release/github",
  ],
};
