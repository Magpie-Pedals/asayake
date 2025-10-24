// bun build src/asa.ts --outfile asa.js --outdir dist
// cp res/* dist
// cp -r dist/*

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const dirOut = process.argv[2] || 'data';
const dirRes = process.argv[3] || 'res';

// Run Bun build
console.log('Building asa.ts with Bun...');
execSync('bun build src/asa.ts --outfile asa.js --outdir dist', { stdio: 'inherit' });

// Copy all files from res to dist
console.log('Copying resource files to dist...');
fs.readdirSync(dirRes).forEach(file => {
  fs.copyFileSync(path.join(dirRes, file), path.join('dist', file));
});

// Copy all files from dist to fianl directory
console.log('Copying built files to ' + dirOut);
fs.readdirSync('dist').forEach(file => {
  const srcPath = path.join('dist', file);
  const destPath = path.join(dirOut, 'asayake', file);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const stat = fs.statSync(srcPath);
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
});
console.log('Build complete.');
