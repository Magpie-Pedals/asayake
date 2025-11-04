//
// Demo usage
//

// Add track keys here to include in the playlist
const playlistSimple = [
  '10007019',
  '13835280',
  '14389788',
  '16026300',
  '19429127',
  '27777941',
  '29802531',
  '32180363',
  '33136646',
  '36471890',
  '36803325',
  '38513529',
  '41254965',
  '44107866',
];

const playlist = {
  title: 'My Playlist 1',
  albumImageUri: 'https://example.com/album-art.jpg',
  trackIds: playlistSimple,
};

const playlistId = "Sample Collab 5";

const asaConfig = {
  pathPrefix: '..',
  playerElement: document.getElementById('asa-player-container'),
  playlistListElement: document.getElementById('asa-playlist-list-container'),
  searchElement: document.getElementById('asa-search'),
  log: true,
};

async function runDemo() {
  const asa = new Asa(asaConfig);
  await asa.yeet(playlistSimple);
  asa.printClassNames();
}
runDemo();

const showPlaylistListButton = document.getElementById('asa-show-playlists');
const playlistListContainer = document.getElementById('asa-playlist-list-container');
const playerContainer = document.getElementById('asa-player-container');
if (!showPlaylistListButton) {
  throw new Error('Show playlist list button not found');
}
if (!playlistListContainer) {
  throw new Error('Playlist list container not found');
}
if (!playerContainer) {
  throw new Error('Player container not found');
}
showPlaylistListButton.addEventListener('click', async () => {
  console.log('Showing playlist list container');
  if (playerContainer.style.width === '100%') {
    playlistListContainer.style.width = '100%';
    playerContainer.style.width = '0';
  }
  else {
    playlistListContainer.style.width = '0';
    playerContainer.style.width = '100%';
  }
});
