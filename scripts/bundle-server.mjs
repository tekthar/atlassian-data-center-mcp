// Bundles a server package's tsc output into dist/, with @atlassian-dc-mcp/common inlined.
// The published packages never depend on @atlassian-dc-mcp/common: that name belongs to the
// upstream project on npm, and installing it would replace our shared code with theirs.
// Every npm dependency stays external and is installed from the server's own dependencies,
// so each server must list the runtime dependencies of common as well as its own.
// Run from a server package directory, after `tsc --build` (the package's prepack does both).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const packageDir = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const pkg = readJson(path.join(packageDir, 'package.json'));
const common = readJson(path.join(packageDir, '..', 'common', 'package.json'));

const dependencies = Object.keys(pkg.dependencies ?? {});
const missing = Object.keys(common.dependencies ?? {}).filter((name) => !dependencies.includes(name));
if (missing.length > 0) {
  throw new Error(`${pkg.name} must list these runtime dependencies of common: ${missing.join(', ')}`);
}
if (dependencies.includes(common.name)) {
  throw new Error(`${pkg.name} must not depend on ${common.name}; it is bundled.`);
}

// The MIT notices of every project this code builds on ship with each package.
fs.copyFileSync(path.join(packageDir, '..', '..', 'LICENSE'), path.join(packageDir, 'LICENSE'));

fs.rmSync(path.join(packageDir, 'dist'), { recursive: true, force: true });
await build({
  absWorkingDir: packageDir,
  entryPoints: { index: 'build/index.js', setup: 'build/setup.js', doctor: 'build/doctor.js' },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: dependencies.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
});
