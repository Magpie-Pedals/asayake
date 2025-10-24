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
-- album 1/
---- track 1.mp3
---- track 2.mp3
```

## Bun

This project was written for `bun`; an alternative to NodeJS, NPM, TSC and more. Its super fast and easy to work with. 

[Intall Bun](https://bun.com/docs/installation)

[More on Bun](https://bun.com/)

*Note: This will likely work with NodeJS / NPM / TSC as well.*

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
