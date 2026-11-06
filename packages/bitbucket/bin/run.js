#!/usr/bin/env node
const sub = process.argv[2];
if (sub === 'setup') {
  await import('../dist/setup.js');
} else if (sub === 'doctor') {
  await import('../dist/doctor.js');
} else if (sub === 'install') {
  await import('../dist/install.js');
} else {
  await import('../dist/index.js');
}
