const fs = require('node:fs');

const p = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const all = {
  ...p.dependencies,
  ...p.devDependencies,
  ...p.peerDependencies,
  ...p.optionalDependencies,
};
const bad = Object.entries(all).filter(
  ([, v]) => typeof v === 'string' && v.startsWith('workspace:'),
);
if (bad.length) {
  console.error(`ERR: workspace: refs not resolved: ${bad.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
