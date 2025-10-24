import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Import types
import type { MasterList } from '../src/types.ts';
import type { RecordRaw } from '../src/types.ts';

class Ripper {
  private exitOnError = true;
  private ffprobeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams`;
  constructor() { }
  // Handle errors
  private error(msg: string): void {
    if (this.exitOnError) {
      console.warn('!!!!!!! Exiting due to error !!!!!!!');
      throw new Error(msg);
    }
    console.warn(msg);
  }
  // WARN: This is a very simple hash function and may produce collisions
  // TODO: Replace with a better hash function if needed
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    // Convert to unsigned, then to hex, and pad to 8 characters
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  // Use ffprobe to rip metadata from a track
  private async ripMeta(trackPath: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const escapedPath = trackPath.replace(/(["\\$`])/g, '\\$1');
      exec(`${this.ffprobeCmd} "${escapedPath}"`, (error, stdout, stderr) => {
        if (error) {
          this.error(error.message);
          return reject(error);
        }
        if (stderr) {
          this.error(stderr);
          return reject(new Error(stderr));
        }
        resolve(stdout);
      });
    });
  }
  // Traverse directory and probe files
  private async traverseAndProbe(dir: string, recordRaw: RecordRaw[]): Promise<RecordRaw[]> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.traverseAndProbe(fullPath, recordRaw);
      }
      else if (entry.isFile() && entry.name.endsWith('.mp3')) {
        const raw = await this.ripMeta(fullPath);
        if (!raw) {
          this.error(`Failed to rip metadata for ${fullPath}`);
          continue;
        }
        const dataFull = JSON.parse(raw);
        const rec: RecordRaw = dataFull.format;
        if (!rec) {
          this.error(`No tags found in metadata for ${fullPath}`);
          continue;
        }
        console.log(rec.filename);
        console.log(`Ripped metadata for ${fullPath}:`, rec);
        recordRaw.push(rec);
      }
    }
    return recordRaw;
  }
  // Process raw records into final data
  private process(recordRaw: RecordRaw[]) {
    const listing: MasterList = {};
    for (const record of recordRaw) {
      // We use a hash of some meta data to generate a unique key for each track
      const hashInput = `${record.tags.album}${record.tags.artist}${record.tags.title}`;
      const key = this.simpleHash(hashInput).toString();
      if (listing[key]) {
        this.error(`Duplicate track detected: ${record.tags.title} by ${record.tags.artist} in album ${record.tags.album}`);
        continue;
      }
      const audioUri = record.filename.split(path.sep).slice(1).join('/');
      // NOTE: The albumImageUri is assumed to be in the same directory as the audio file
      const albumImageUri = audioUri.split(path.sep)[0] + '/cover.png';
      listing[key] = {
        title: record.tags.title,
        artist: record.tags.artist,
        albumTitle: record.tags.album,
        albumDate: new Date(record.tags.date),
        albumImageUri: albumImageUri,
        audioUri: audioUri, // Relative path
        duration: Number(record.duration),
        size: Number(record.size),
        bitRate: Number(record.bit_rate),
      };
    }
    return listing;
  }
  // Run the ripper
  async run(dir: string, exitOnError: boolean = true): Promise<void> {
    this.exitOnError = exitOnError;
    let recordRaw: RecordRaw[] = [];
    fs.mkdirSync(`dist/metadata`, { recursive: true });
    recordRaw = await this.traverseAndProbe(dir, recordRaw);
    fs.writeFileSync(`dist/metadata/rawdata.json`, JSON.stringify(recordRaw, null, 2));
    const playlist = this.process(recordRaw);
    fs.writeFileSync(`dist/metadata/metadata.json`, JSON.stringify(playlist, null, 2));
  }
}

const start = Date.now();
const dir = process.argv[2] || "data";
await new Ripper().run(dir, true);
const end = Date.now();
console.log(`Ripping completed in ${(end - start) / 1000} seconds.`);
