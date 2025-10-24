# Asayake
Asayake is a static music player that is easy to self-host. 

## Master Track List

The master track list is a `metadata.json` file that contains a single instance of a `MasterList` type object.

```ts
type TrackMeta = {
  title: string; // The track title
  artist: string; // The list of artists
  albumTitle: string; // The album name
  albumDate: Date; // The date the album was released
  albumImageUri: string; // The URL to the album image
  audioUri: string; // The URL to the track
  duration?: number; // The duration of the track in seconds
  size?: number; // The size of the track in bytes
  bitRate?: number; // The bit rate of the track in kbps
}

type MasterList = {
  [key: string]: TrackMeta;
};
```

An example `metadata.json` might look like:
```json
{
  "10007019": {
    "title": "The Moss Covers the Earth",
    "artist": "Andreji Rublev",
    "albumTitle": "Sample Collab 5",
    "albumDate": "2019-01-01T00:00:00.000Z",
    "albumImageUri": "Magpie Pirates - Sample Collab 5/cover.png",
    "audioUri": "Magpie Pirates - Sample Collab 5/Andreji Rublev - Sample Collab 5 - 01 The Moss Covers the Earth.mp3",
  },
  "13835280": {
    "title": "Admirals Of Industry",
    "artist": "Deepsurface",
    "albumTitle": "Industrial Music For Industrial People",
    "albumDate": "2019-01-01T00:00:00.000Z",
    "albumImageUri": "Magpie Pirates - Industrial Music For Industrial People/cover.png",
    "audioUri": "Magpie Pirates - Industrial Music For Industrial People/Deepsurface - Industrial Music For Industrial People - 04 Admirals Of Industry.mp3",
  },
  "14389788": {
    "title": "Ghost in the Machine",
    "artist": "TRBLMKR",
    "albumTitle": "Ministry of Magpies",
    "albumDate": "2021-01-01T00:00:00.000Z",
    "albumImageUri": "Magpie Pirates - Ministry of Magpies/cover.png",
    "audioUri": "Magpie Pirates - Ministry of Magpies/TRBLMKR - Ministry of Magpies - 02 Ghost in the Machine.mp3",
  },
  ...
}
```

There is only one `metadata.json` master list. Playlists reference entries in this list.

If that seems like a lot, don't worry. We can automatically generate this data from a directory of mp3s with the `ripper.ts` tool.

## Playlists

A "playlist" can represent a set of mostly unrelated songs or a cohesive album. 

An `AsaPlaylist` object is simply an array of strings where every entry is a key of the `MasterList` object.

A playlist might look like this:
```ts
const playlist = [
  '10007019',
  '13835280',
  '14389788',
];
```

# Usage

## Set up the tracks

Put the albums (audio files) in some directory like `./data`. 

You don't have to put the audio files in this repo directory but it makes it easier. 

The `.gitignore` file ignores `data*` so its pretty safe to put it here. 

You might have a structure like this:
```
data/
-- album 1/
---- track 1.mp3
---- track 2.mp3
---- cover.png
-- album 1/
---- track 1.mp3
---- track 2.mp3
---- cover.png
```

## Bun

This project was written for `bun`; an alternative to NodeJS, NPM, TSC and more. Its super fast and easy to work with. 

[Intall Bun](https://bun.com/docs/installation)

[More on Bun](https://bun.com/)

*Note: This will likely work with NodeJS / NPM / TSC as well.*

## Install dependencies

```sh
bun install
```

## Ripper

Run the ripper tool to extract metadata from the mp3 files.
```sh
bun tools/ripper.ts <dir>
```

This will output metadata JSON files to `./dist/metadata`.

## Compile

```sh
bun tools/build.ts <dir> <res?>
```

Where `<dir>` is the same directory we ran the ripper on.

The `<res?>` paramter is optional and allows for overriding the static resource directory with your own.

## Serve

The `<dir>` we've been using is now ready to serve. 

The files here could be put on a file or object storage server.

For testing we will serve it locally

```sh
bunx http-server <dir>
```
