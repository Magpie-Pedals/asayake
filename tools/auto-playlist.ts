import * as fs from 'fs';
import * as path from 'path';

import type { AsaMasterList, AsaPlaylistList } from '../src/types';

// Make an playlist for each album
const dir = path.join(__dirname, '..', 'dist', 'metadata', 'metadata.json');
const metadataRaw = fs.readFileSync(dir, 'utf-8');
const metadata: AsaMasterList = JSON.parse(metadataRaw);

const playlists: AsaPlaylistList = {};

for (const [key, data] of Object.entries(metadata)) {
  const album = data.albumTitle || 'Unknown Album';
  if (!playlists[album]) {
    playlists[album] = {
      name: album,
      albumImageUri: data.albumImageUri,
      trackIds: [],
    };
  }
  playlists[album].trackIds.push(key);
}

console.log(`Found ${Object.keys(playlists).length} albums.`);
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', 'metadata', 'playlists.json'),
  JSON.stringify(playlists, null, 2),
);
