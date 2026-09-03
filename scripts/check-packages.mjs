import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootManifest = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const releaseVersion = rootManifest.version;
const lock = JSON.parse(
  readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
);
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (
  lock.version !== releaseVersion ||
  lock.packages['']?.version !== releaseVersion
) {
  throw new Error('package.json and package-lock.json versions do not match');
}
if (!changelog.includes(`## [${releaseVersion}]`)) {
  throw new Error(`CHANGELOG.md has no ${releaseVersion} release heading`);
}
const expectedFixture = `file:vendor/openjobspec-sdk-${releaseVersion}.tgz`;
if (rootManifest.devDependencies['@openjobspec/sdk'] !== expectedFixture) {
  throw new Error(`Expected coordinated SDK fixture ${expectedFixture}`);
}
const fixturePath = path.join(root, expectedFixture.slice('file:'.length));
const fixtureBytes = readFileSync(fixturePath);
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
const expectedSha256 = readFileSync(`${fixturePath}.sha256`, 'utf8')
  .trim()
  .split(/\s+/)[0];
if (fixtureSha256 !== expectedSha256) {
  throw new Error(
    `SDK fixture SHA-256 ${fixtureSha256} does not match ${expectedSha256}`,
  );
}
const fixtureIntegrity = `sha512-${createHash('sha512')
  .update(fixtureBytes)
  .digest('base64')}`;
const lockedSdk = lock.packages['node_modules/@openjobspec/sdk'];
if (
  lockedSdk?.resolved !== expectedFixture ||
  lockedSdk?.integrity !== fixtureIntegrity
) {
  throw new Error(
    `SDK fixture lock integrity is stale; expected ${fixtureIntegrity}`,
  );
}
const fixtureResult = spawnSync(
  'tar',
  [
    '-xOf',
    fixturePath,
    'package/package.json',
  ],
  { encoding: 'utf8' },
);
if (fixtureResult.status !== 0) {
  throw new Error(`Unable to inspect coordinated SDK fixture: ${fixtureResult.stderr}`);
}
const fixtureManifest = JSON.parse(fixtureResult.stdout);
if (
  fixtureManifest.name !== '@openjobspec/sdk' ||
  fixtureManifest.version !== releaseVersion
) {
  throw new Error(
    `SDK fixture is ${fixtureManifest.name}@${fixtureManifest.version}; expected @openjobspec/sdk@${releaseVersion}`,
  );
}
const packagesDir = path.join(root, 'packages');
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .filter((directory) => {
    try {
      readFileSync(path.join(directory, 'package.json'));
      return true;
    } catch {
      return false;
    }
  })
  .sort();

for (const directory of packageDirs) {
  const pkg = JSON.parse(
    readFileSync(path.join(directory, 'package.json'), 'utf8'),
  );
  if (pkg.version !== releaseVersion) {
    throw new Error(
      `${pkg.name} is ${pkg.version}; expected repository release ${releaseVersion}`,
    );
  }
  if (pkg.publishConfig?.access !== 'public') {
    throw new Error(`${pkg.name} must publish with public access`);
  }
  if (pkg.peerDependencies?.['@openjobspec/sdk'] !== `^${releaseVersion}`) {
    throw new Error(`${pkg.name} must peer-depend on @openjobspec/sdk ^${releaseVersion}`);
  }

  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${pkg.name}: npm pack --dry-run failed\n${result.stdout}\n${result.stderr}`,
    );
  }

  const files = new Set(
    JSON.parse(result.stdout)[0].files.map((file) => file.path),
  );
  for (const target of Object.values(pkg.exports)) {
    const branches =
      typeof target === 'string' ? [target] : Object.values(target);
    for (const branch of branches) {
      const packedPath = branch.replace(/^\.\//, '');
      if (!files.has(packedPath)) {
        throw new Error(`${pkg.name} omitted export target ${packedPath}`);
      }
    }
  }
}

console.log(
  `Verified ${packageDirs.length} public packages at ${releaseVersion} with complete dry-run exports.`,
);
