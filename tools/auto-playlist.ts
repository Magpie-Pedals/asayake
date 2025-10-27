import * as fs from 'fs';
import * as path from 'path';

import type { AsaMasterList, AsaTrackMeta } from '../src/types';

// Make an playlist for each album
const dir = path.join(__dirname, '..', 'dist', 'metadata', 'metadata.json');
const metadataRaw = fs.readFileSync(dir, 'utf-8');
const metadata: AsaMasterList = JSON.parse(metadataRaw);

const albums: { [key: string]: string[] } = {};

for (const [key, data] of Object.entries(metadata)) {
  const album = data.albumTitle || 'Unknown Album';
  if (!albums[album]) {
    albums[album] = [];
  }
  albums[album].push(key);
}

console.log(`Found ${Object.keys(albums).length} albums.`);
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', 'metadata', 'albums.json'),
  JSON.stringify(albums, null, 2),
);
