// bun build src/asa.ts --outfile asa.js --outdir dist
// cp res/* dist
// cp -r dist/*

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const dirOut = process.argv[2] || 'data';
const dirRes = process.argv[3] || 'res';

// Run Bun build
console.log('Building asa.ts with Bun...');
execSync('bun build src/asa.ts --outfile asa.js --outdir dist', { stdio: 'inherit' });

// Copy all files from res to dist
console.log('Copying resource files to dist...');
fs.readdirSync(dirRes).forEach(file => {
  const srcPath = path.join(dirRes, file);
  const destPath = path.join('dist', file);
  const stat = fs.statSync(srcPath);
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
});

// Copy all files from dist to final directory
console.log('Copying dist files to ' + path.join(dirOut, 'asa'));
fs.readdirSync('dist').forEach(file => {
  const srcPath = path.join('dist', file);
  const destPath = path.join(dirOut, 'asa', file);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const stat = fs.statSync(srcPath);
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
});

// Copy album art up one level to data/asa/album_art
// This allows it to be hosted separately from the app code (with the music)
console.log('Copying album art to ' + path.join(dirOut, 'album_art'));
const albumArtSrc = path.join(dirOut, 'asa', 'album_art');
const albumArtDest = path.join(dirOut, 'album_art');
if (fs.existsSync(albumArtSrc)) {
  fs.mkdirSync(albumArtDest, { recursive: true });
  fs.cpSync(albumArtSrc, albumArtDest, { recursive: true });
}

// Remove the data/asa/album_art directory
console.log('Removing temporary album art directory from dist...');
fs.rmSync(albumArtSrc, { recursive: true, force: true });

console.log('Build complete.');
