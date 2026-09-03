# Coordinated SDK package fixture

`openjobspec-sdk-0.5.0.tgz` is the packed `@openjobspec/sdk` 0.5.0 artifact
used only to build and test the contrib workspace before the coordinated SDK
release is available from npm.

Regenerate it from the sibling release worktree:

```bash
cd ../ojs-js-sdk
npm run build
npm pack --ignore-scripts --pack-destination ../ojs-js-contrib/vendor
cd ../ojs-js-contrib
shasum -a 256 vendor/openjobspec-sdk-0.5.0.tgz > vendor/openjobspec-sdk-0.5.0.tgz.sha256
```

The publishable contrib packages declare `@openjobspec/sdk ^0.5.0` as a peer
dependency; the fixture is not included in their npm packages.
`scripts/check-packages.mjs` verifies both the recorded SHA-256 and the npm
lockfile SHA-512 integrity before checking any workspace package.
