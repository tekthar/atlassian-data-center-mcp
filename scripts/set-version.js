#!/usr/bin/env node
// Sets one version on the three servers: package.json, server.json and package-lock.json.
// Usage: node scripts/set-version.js 0.45.0
import { readFileSync, writeFileSync } from 'node:fs';

const packages = ['jira', 'confluence', 'bitbucket'];
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/set-version.js <major.minor.patch[-prerelease]>');
  process.exit(1);
}

const update = (file, change) => {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  change(json);
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
};

for (const pkg of packages) {
  update(`packages/${pkg}/package.json`, (json) => { json.version = version; });
  update(`packages/${pkg}/server.json`, (json) => {
    json.version = version;
    json.packages[0].version = version;
  });
}
update('package-lock.json', (lock) => {
  for (const pkg of packages) lock.packages[`packages/${pkg}`].version = version;
});
console.log(`Servers set to ${version}. Add a CHANGELOG.md entry, then merge to main to release.`);
