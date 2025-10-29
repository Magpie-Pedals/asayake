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
      title: album,
      albumImageUri: data.albumImageUri,
      date: data.albumDate,
      artist: data.artist,
      trackIds: [],
    };
  }
  playlists[album].trackIds.push(key);
  // If we have multiple artists set to Various Artists
  if (playlists[album].artist !== data.artist) {
    playlists[album].artist = 'Various Artists';
  }
  // If we have multiple dates, set to the latest date
  if (playlists[album].date < data.albumDate) {
    playlists[album].date = data.albumDate;
  }
}

console.log(`Found ${Object.keys(playlists).length} albums.`);
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', 'metadata', 'playlists.json'),
  JSON.stringify(playlists, null, 2),
);
