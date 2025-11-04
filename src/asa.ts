/*
 * Main Class for Asa Audio Player
 * Handles UI, playback, and playlist management
*/

import type {
  AsaMasterList,
  AsaPlaylist,
  AsaPlaylistSimple,
  AsaPlaylistInternal,
  AsaPlaylistId,
  AsaPlaylistUnion,
  AsaPlaylistList,
  AsaElements
} from './types';

import AsaVis from './vis';

// Configuration for Asa player
type AsaConfig = {
  // Prefix path for audio and image files
  // This can be a relative or absolute path to another server
  pathPrefix: string;
  // The HTML element to mount the player into
  playerElement: HTMLElement;
  // Optional HTML element to mount the playlist into
  playlistListElement?: HTMLElement;
  // Optional search box element
  searchElement?: HTMLInputElement;
  // Enable or disable logging (default: false)
  log?: boolean;
};

// Main Asa player class
class Asa {
  private vis: AsaVis;
  private config: AsaConfig;
  private el: AsaElements;
  private meta = {
    master: null as AsaMasterList | null,
    playlists: null as AsaPlaylistList | null,
  };
  private firstInit: boolean = true; // Only true on first yeet() call, for query param handling
  private playlistId: AsaPlaylistId | null = null; // Only used if loading by ID, only for URL params
  private searchFilter: string = '';
  private playlist: AsaPlaylistInternal = [];
  private trackIndex: number = 0;
  private isShuffle: boolean = false;
  constructor(config: AsaConfig) {
    this.config = config;
    this.el = {
      playerTarget: config.playerElement,
      playlistListTarget: config.playlistListElement || null,
      searchTarget: config.searchElement || null,
      playlist: null,
      asa: null,
      audioPlayer: null,
      nowPlayingTitle: null,
      nowPlayingArtist: null,
      nowPlayingAlbum: null,
      scrubberFill: null,
      volumeFill: null,
      albumImage: null,
      tracks: [],
    };
    this.vis = new AsaVis(this.el);
    if (!this.config.log) {
      console.log = () => { };
    }
    console.log("Initializing Asa Player");
    console.log(JSON.stringify(this.config));
  }
  // Simple error handler
  private error(msg: string): never {
    throw new Error(`Asa Player Error: ${msg}`);
  }
  // Fetch metadata JSON files
  // Writes them to state
  private async fetchMetadata(): Promise<void> {
    try {
      const response = await fetch('metadata/metadata.json');
      const data = await response.json();
      this.meta.master = data as AsaMasterList;
    }
    catch (error) {
      console.error("Error fetching metadata:", error);
      throw error;
    }
    try {
      const response = await fetch('metadata/playlists.json');
      const data = await response.json();
      this.meta.playlists = data as AsaPlaylistList;
    }
    // Playlists are optional and will remain null if not found
    catch (error) {
      console.error("Error fetching playlists:", error);
    }
  }
  // Create internal playlist from master list and given playlist
  // Can take many playlist formats (types)
  private makePlaylistInternal(master: AsaMasterList, playlist: AsaPlaylist | AsaPlaylistSimple): void {
    const playlistInternal: AsaPlaylistInternal = [];
    for (const [key, data] of Object.entries(master)) {
      // Handle both simple array and object playlist formats
      const trackIds = Array.isArray(playlist) ? playlist : playlist.trackIds;
      if (trackIds.includes(key)) {
        playlistInternal.push(data);
      }
    }
    if (playlistInternal.length === 0) {
      this.error("No valid tracks found in the provided playlist");
    }
    this.playlist = playlistInternal;
  }
  // Play the current track
  private play(): void {
    console.log("called play")
    this.el.audioPlayer?.play();
    this.el.asa?.classList.add('asa-playing');
  }
  // Pause the current track
  private pause(): void {
    this.el.audioPlayer?.pause();
    this.el.asa?.classList.remove('asa-playing');
  }
  // Navigate to next track
  private nextTrack(currentIndex: number): void {
    // Handle shuffle
    if (this.isShuffle) {
      const curTrackIndex = this.trackIndex;
      // Ensure we don't pick the same track again
      while (this.trackIndex === curTrackIndex && this.playlist.length > 1) {
        this.trackIndex = Math.floor(Math.random() * this.playlist.length);
      }
    }
    else {
      // Normal next track
      this.trackIndex = (currentIndex + 1) % this.playlist.length;
    }
    this.updateTrack(this.trackIndex);
    this.play();
  }
  // Navigate to previous track
  private prevTrack(currentIndex: number): void {
    this.trackIndex = (currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.updateTrack(this.trackIndex);
    this.play();
  }
  // Play/Pause button click handler
  private onPPClick(): void {
    if (!this.el.audioPlayer) this.error("Audio player element not initialized");
    if (this.el.audioPlayer.paused) {
      this.play();
    }
    else {
      this.pause();
    }
  }
  // Album image click handler to change visualization mode
  private onAlbumImageClick(): void {
    if (this.el.audioPlayer && this.el.audioPlayer.paused) {
      this.play();
    }
    this.vis.changeVisMode();
  }
  // Shuffle button click handler
  private onShuffleClick(): void {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      this.el.asa?.classList.add('asa-shuffling');
    }
    else {
      this.el.asa?.classList.remove('asa-shuffling');
    }
  }
  // Playlist track click handler
  // Updates track and plays it
  private onPlaylistClick(trackIndex: number): void {
    this.updateTrack(trackIndex);
    this.play();
    this.trackIndex = trackIndex;
  }
  // Audio time update handler
  // NOTE:
  // Listening for `ended` has some delay so use this instead
  private onTimeUpdate(timestamp: HTMLElement): void {
    if (!this.el.audioPlayer) this.error("Audio player element not initialized");
    if (this.el.audioPlayer.currentTime >= this.el.audioPlayer.duration) {
      this.el.audioPlayer.pause();
      this.el.audioPlayer.currentTime = this.el.audioPlayer.duration;
      this.nextTrack(this.trackIndex);
    }
    // Update scrubber
    if (this.el.audioPlayer.duration > 0) {
      const progress = (this.el.audioPlayer.currentTime / this.el.audioPlayer.duration) * 100;
      if (this.el.scrubberFill) {
        this.el.scrubberFill.style.width = `${progress}%`;
      }
    }
    // Update timestamp
    const current = Math.floor(this.el.audioPlayer.currentTime);
    const duration = Math.floor(this.el.audioPlayer.duration);
    const formatTime = (time: number) => {
      const minutes = Math.floor(time / 60).toString().padStart(2, '0');
      const seconds = (time % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };
    timestamp.innerText = `${formatTime(current)} / ${formatTime(duration || 0)}`;
  }
  // Download button click handler
  private onDownloadClick(): void {
    if (!this.el.audioPlayer) this.error("Audio player element not initialized");
    const track = this.playlist[this.trackIndex];
    if (!track) this.error("No track loaded for download");
    const link = document.createElement('a');
    link.href = `${this.config.pathPrefix}/${track.audioUri}`;
    link.download = `${track.artist} - ${track.title}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  // Search box input handler
  private onSearchInput(): void {
    this.searchFilter = this.el.searchTarget!.value;
    console.log(`Search filter updated: ${this.searchFilter}`);
    if (!this.meta.master) this.error("Master metadata not initialized");

    // Build a raw playlist (array of track IDs) based on the search filter
    const filteredIds: string[] = [];
    const filterLower = this.searchFilter.toLowerCase();
    for (const [trackId, track] of Object.entries(this.meta.master)) {
      if (
        track.title.toLowerCase().includes(filterLower) ||
        track.artist.toLowerCase().includes(filterLower) ||
        track.albumTitle.toLowerCase().includes(filterLower)
      ) {
        filteredIds.push(trackId);
      }
    }
    if (filteredIds.length === 0) {
      console.log("No tracks match the search filter");
      return;
    }
    // Call yeet with the filtered raw playlist
    this.yeet(filteredIds);
    // Set the albumId
    this.playlistId = 'search';
  }
  private clearSearch(): void {
    if (!this.el.searchTarget) this.error("Search target element not initialized");
    this.el.searchTarget.value = '';
    this.searchFilter = '';
    console.log("Search filter cleared");
  }
  // Scrubber Events
  private attachScrubberEvents(scrubber: HTMLElement): void {
    const handleScrub = (e: PointerEvent, scrubber: HTMLElement): void => {
      if (!this.el.audioPlayer) this.error("Audio player element not initialized");
      const rect = scrubber.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const width = rect.width;
      const percent = Math.max(0, Math.min(1, pointerX / width));
      const newTime = percent * this.el.audioPlayer.duration;
      this.el.audioPlayer.currentTime = newTime;
    }
    const onPointerMove = (e: PointerEvent) => {
      handleScrub(e, scrubber);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    scrubber.addEventListener('pointerdown', (e: PointerEvent) => {
      handleScrub(e, scrubber);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
  // Volume events
  private attachVolumeEvents(volumeControl: HTMLElement): void {
    const handleVolume = (e: PointerEvent, volumeControl: HTMLElement): void => {
      if (!this.el.audioPlayer) this.error("Audio player element not initialized");
      const rect = volumeControl.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const width = rect.width;
      const percent = Math.max(0, Math.min(1, pointerX / width));
      // Logarithmic scaling: perceptual volume
      const minDb = -50;
      const maxDb = 0;
      let linear: number;
      if (percent === 0) {
        linear = 0;
      }
      else if (percent === 1) {
        linear = 1;
      }
      else {
        const db = minDb + (maxDb - minDb) * percent;
        linear = Math.pow(10, db / 20);
      }
      this.el.audioPlayer.volume = linear;
      if (this.el.volumeFill) {
        this.el.volumeFill.style.width = `${percent * 100}%`;
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      handleVolume(e, volumeControl);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    volumeControl.addEventListener('pointerdown', (e: PointerEvent) => {
      handleVolume(e, volumeControl);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
  private updateQueryParams(trackIndex: number): void {
    // Update the query params
    const url = new URL(window.location.href);
    url.searchParams.set('p', this.playlistId || 'custom');
    url.searchParams.set('t', trackIndex.toString());
    window.history.replaceState({}, '', url.toString());
  }
  // Update track information and audio source
  // Called when changing tracks
  private updateTrack(trackIndex: number): void {
    if (!this.vis) this.error("Visualization context not initialized");
    // Update audio source and metadata display
    this.vis.setupVisImg();
    console.log(this.playlist);
    const track = this.playlist[trackIndex];
    if (!track) this.error(`Track at index ${trackIndex} not found in playlist`);
    if (!this.el.audioPlayer) this.error("Audio player element not initialized");

    this.el.audioPlayer.src = `${this.config.pathPrefix}/${track.audioUri}`;
    this.el.audioPlayer.currentTime = 0;
    this.el.audioPlayer.load();
    if (this.el.albumImage) {
      if (!track.albumImageUri) {
        this.el.albumImage.style.backgroundImage = 'url("asaimg/placeholder.png")';
        this.vis.setVisImg('asaimg/placeholder.png');
      }
      // Check if the image exists by making a HEAD request
      else {
        const realPath = `${this.config.pathPrefix}/${track.albumImageUri}`;
        fetch(realPath, { method: 'HEAD' })
          .then((response) => {
            if (response.ok) {
              this.el.albumImage!.style.backgroundImage = `url("${realPath}")`;
              this.vis.setVisImg(realPath);
            }
            else {
              this.el.albumImage!.style.backgroundImage = 'url("asaimg/placeholder.png")';
              this.vis.setVisImg('asaimg/placeholder.png');
            }
          })
          .catch(() => {
            this.el.albumImage!.style.backgroundImage = 'url("asaimg/placeholder.png")';
            this.vis.setVisImg('asaimg/placeholder.png');
          });
      }
    }
    this.el.nowPlayingTitle!.innerText = track.title;
    this.el.nowPlayingArtist!.innerText = track.artist;
    this.el.nowPlayingAlbum!.innerText = track.albumTitle;
    for (const [index, trackEl] of (this.el.tracks ?? []).entries()) {
      trackEl.classList.remove('asa-track-playing');
      if (index === trackIndex) {
        trackEl.classList.add('asa-track-playing');
      }
    }
    // Focus the current track in the playlist
    const currentTrackEl = this.el.playlist?.querySelectorAll('.asa-track')[trackIndex] as HTMLElement;
    if (currentTrackEl) {
      console.log("Scrolling to current track in playlist");
      currentTrackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    else {
      console.log("Current track element not found in playlist");
    }
    this.updateQueryParams(trackIndex);
  }
  // Initialize the player UI
  // Called when loading a playlist
  private initPlayer(playlist: AsaPlaylistInternal): void {
    this.el.playerTarget.innerHTML = ''; // Clear existing content
    // Clear vis context since we're creating a new audio element
    this.vis.clearContext();
    this.el.asa = document.createElement('div');
    this.el.asa.className = 'asa-player';
    this.el.playlist = document.createElement('div');
    this.el.playlist.className = 'asa-playlist';
    for (const track of playlist) {
      const trackElement = document.createElement('div');
      trackElement.className = 'asa-track';
      trackElement.onclick = () => this.onPlaylistClick(playlist.indexOf(track));
      trackElement.innerHTML = `${track.artist} - ${track.title} `;
      this.el.playlist.appendChild(trackElement);
      this.el.tracks?.push(trackElement);
    }
    this.el.asa.appendChild(this.el.playlist);

    // Append the audio player
    this.el.audioPlayer = document.createElement('audio');
    this.el.audioPlayer.controls = false;
    this.el.audioPlayer.preload = 'auto';
    this.el.audioPlayer.autoplay = false;

    // Append the currently playing display
    const nowPlayingElement = document.createElement('div');
    nowPlayingElement.className = 'asa-now-playing';

    this.el.nowPlayingArtist = document.createElement('div');
    this.el.nowPlayingArtist.className = 'asa-now-playing-artist';
    nowPlayingElement.appendChild(this.el.nowPlayingArtist);

    this.el.nowPlayingTitle = document.createElement('div');
    this.el.nowPlayingTitle.className = 'asa-now-playing-title';
    nowPlayingElement.appendChild(this.el.nowPlayingTitle);

    this.el.nowPlayingAlbum = document.createElement('div');
    this.el.nowPlayingAlbum.className = 'asa-now-playing-album';
    nowPlayingElement.appendChild(this.el.nowPlayingAlbum);

    this.el.asa.appendChild(nowPlayingElement);

    // Append the album image display
    this.el.albumImage = document.createElement('canvas');
    this.el.albumImage.className = 'asa-album-image';
    // NOTE: The image will be blurry if canvas size doesn't match display size
    // Set canvas size to match display size for sharp rendering
    this.el.albumImage.width = 512;
    this.el.albumImage.height = 512;
    this.el.asa.appendChild(this.el.albumImage);
    this.el.albumImage.onclick = this.onAlbumImageClick.bind(this);
    this.el.albumImage.oncontextmenu = (e) => {
      e.preventDefault();
    }

    // Add the control elements
    const controlsElement = document.createElement('div');
    controlsElement.className = 'asa-controls';

    const shuffleButton = document.createElement('button');
    shuffleButton.className = 'asa-btn asa-shuffle-button';
    shuffleButton.onclick = this.onShuffleClick.bind(this);
    const shuffleIcon = document.createElement('span');
    shuffleIcon.className = 'asa-shuffle-icon';
    shuffleButton.appendChild(shuffleIcon);

    const ppButton = document.createElement('button');
    ppButton.className = 'asa-btn asa-pp-button';
    ppButton.onclick = this.onPPClick.bind(this);
    const ppIcon = document.createElement('span');
    ppIcon.className = 'asa-pp-icon';
    ppButton.appendChild(ppIcon);

    const prevButton = document.createElement('button');
    prevButton.className = 'asa-btn asa-prev-button';
    prevButton.onclick = () => this.prevTrack(this.trackIndex);
    const prevIcon = document.createElement('span');
    prevIcon.className = 'asa-prev-icon';
    prevButton.appendChild(prevIcon);

    const nextButton = document.createElement('button');
    nextButton.className = 'asa-btn asa-next-button';
    nextButton.onclick = () => this.nextTrack(this.trackIndex);
    const nextIcon = document.createElement('span');
    nextIcon.className = 'asa-next-icon';
    nextButton.appendChild(nextIcon);

    const downloadButton = document.createElement('button');
    downloadButton.className = 'asa-btn asa-download-button';
    const downloadIcon = document.createElement('span');
    downloadIcon.className = 'asa-download-icon';
    downloadButton.appendChild(downloadIcon);
    downloadButton.onclick = this.onDownloadClick.bind(this);

    const scrubber = document.createElement('div');
    scrubber.className = 'asa-scrubber';
    this.el.scrubberFill = document.createElement('div');
    this.el.scrubberFill.className = 'asa-scrubber-fill';
    scrubber.appendChild(this.el.scrubberFill);
    this.attachScrubberEvents(scrubber);
    controlsElement.appendChild(scrubber);

    const volumeControl = document.createElement('div');
    volumeControl.className = 'asa-volume-control';
    this.el.volumeFill = document.createElement('div');
    this.el.volumeFill.className = 'asa-volume-fill';
    volumeControl.appendChild(this.el.volumeFill);
    this.attachVolumeEvents(volumeControl);
    controlsElement.appendChild(volumeControl);

    const timestamp = document.createElement('div');
    timestamp.className = 'asa-timestamp';
    timestamp.innerText = '00:00 / 00:00';

    const controlsBtnWrap = document.createElement('div');
    controlsBtnWrap.className = 'asa-controls-btn-wrap';
    controlsBtnWrap.appendChild(shuffleButton);
    controlsBtnWrap.appendChild(prevButton);
    controlsBtnWrap.appendChild(ppButton);
    controlsBtnWrap.appendChild(nextButton);
    controlsBtnWrap.appendChild(downloadButton);
    controlsElement.appendChild(controlsBtnWrap);
    controlsElement.appendChild(scrubber);
    this.el.asa.appendChild(controlsElement);
    this.el.asa.appendChild(volumeControl);
    this.el.asa.appendChild(timestamp);
    this.el.asa.appendChild(this.el.audioPlayer);
    // Finally, append to target
    this.el.playerTarget.appendChild(this.el.asa);

    // Setup audio event listeners
    this.el.audioPlayer.addEventListener('timeupdate', this.onTimeUpdate.bind(this, timestamp));
  }
  // Initialize the playlist list UI
  private initPlaylistList(): void {
    if (!this.el.playlistListTarget) {
      console.warn("Playlist list target element not initialized, skipping playlist list creation");
      return;
    }
    if (!this.meta.playlists) {
      console.warn("Playlists metadata not initialized, cant create playlist list");
      return;
    }

    if (this.el.playlistListTarget.innerHTML !== '') {
      // Already initialized
      return;
    }

    // Intersection Observer for lazy loading images
    const observer = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const realSrc = img.getAttribute('data-src');
          if (realSrc) {
            img.src = realSrc;
            img.removeAttribute('data-src');
          }
          obs.unobserve(img);
        }
      }
    }, { rootMargin: '100px' });

    for (const [playlistId, playlistData] of Object.entries(this.meta.playlists)) {
      const listElement = document.createElement('div');
      listElement.className = 'asa-playlist-list-item';
      listElement.onclick = async () => {
        const visMode = this.vis.getVisMode();
        await this.yeet(playlistId);
        this.vis.setVisMode(visMode);
        this.play();
        this.playlistId = playlistId;
        this.updateQueryParams(0);
        this.clearSearch();
      };

      const infoElement = document.createElement('div');
      infoElement.className = 'asa-playlist-list-item-info';

      const titleElement = document.createElement('div');
      titleElement.className = 'asa-playlist-list-item-title';
      titleElement.innerText = playlistData.title;
      infoElement.appendChild(titleElement);

      const artistElement = document.createElement('div');
      artistElement.className = 'asa-playlist-list-item-artist';
      artistElement.innerText = playlistData.artist || '';
      infoElement.appendChild(artistElement);

      const dateElement = document.createElement('div');
      dateElement.className = 'asa-playlist-list-item-date';
      dateElement.innerText = new Date(playlistData.date).toLocaleDateString();
      infoElement.appendChild(dateElement);

      listElement.appendChild(infoElement);

      const coverElement = document.createElement('img');
      coverElement.className = 'asa-playlist-list-item-cover';
      coverElement.src = 'asaimg/placeholder.png'; // Placeholder image
      coverElement.setAttribute('data-src', `${this.config.pathPrefix}/${playlistData.albumImageUri}`);
      observer.observe(coverElement);

      listElement.appendChild(coverElement);

      this.el.playlistListTarget.appendChild(listElement);
    }
  }
  private initPlaylist(playlist: AsaPlaylistUnion): void {
    if (!this.meta.master) {
      throw new Error("Master metadata not initialized");
    }
    // Reset track index and playlist
    this.trackIndex = 0;
    if (this.el.tracks) {
      this.el.tracks = [];
    }
    if (typeof playlist === 'object') {
      console.log("Loading playlist from object (AsaPlaylist or AsaPlaylistSimple)");
      this.makePlaylistInternal(this.meta.master, playlist);
    }
    else { // it's an ID
      if (!this.meta.playlists) {
        this.error("Playlists metadata not initialized");
      }
      const playlistRaw = this.meta.playlists[playlist];
      if (!playlistRaw) {
        this.error(`Playlist with ID ${playlist} not found`);
      }
      console.log("Loading a raw playlist by ID");
      this.makePlaylistInternal(this.meta.master, playlistRaw);
    }
    if (this.playlist.length === 0) {
      this.error("Playlist is empty");
    }
  }
  private checkQueryParams(): boolean {
    let foundQueryParams = false;
    if (this.firstInit) {
      this.firstInit = false;
      const urlParams = new URLSearchParams(window.location.search);
      const pParam = urlParams.get('p');
      const tParam = urlParams.get('t');
      if (pParam) {
        console.log(`URL parameter 'p' found: ${pParam}`);
        const playlist = pParam as AsaPlaylistId;
        // Validate playlist ID
        if (this.meta.playlists && !this.meta.playlists[playlist]) {
          console.warn(`Playlist ID '${playlist}' from URL not found in metadata, ignoring`);
          return false;
        }
        this.playlistId = playlist;
        this.initPlaylist(playlist);
        foundQueryParams = true;
      }
      if (tParam) {
        const tIndex = parseInt(tParam, 10);
        if (!isNaN(tIndex)) {
          console.log(`URL parameter 't' found: ${tIndex}`);
          if (tIndex < 0 || tIndex >= this.playlist.length) {
            console.warn(`Track index '${tIndex}' from URL is out of bounds, ignoring`);
            return foundQueryParams;
          }
          this.trackIndex = tIndex;
        }
      }
    }
    return foundQueryParams;
  }
  // Debug function to log all class names in the player element
  public printClassNames(): void {
    if (!this.el.asa) this.error("Asa player element not initialized");
    const elements = this.el.asa.querySelectorAll('*');
    const classSet = new Set<string>();
    elements.forEach(el => {
      el.classList.forEach(cls => classSet.add(cls));
    });
    // Also include the root element's classes
    this.el.asa.classList.forEach(cls => classSet.add(cls));
    console.log("Asa Player Class Names:");
    for (const cls of classSet) {
      console.log(cls);
    }
  }
  // Load and play a playlist
  // Accepts various playlist formats or IDs
  public async yeet(playlist: AsaPlaylistUnion): Promise<void> {
    // We only want to grab the  master list once
    if (!this.meta.master) {
      await this.fetchMetadata();
    }
    if (!this.meta.master) {
      throw new Error("Master metadata not initialized");
    }
    // If we have query params, they override the passed playlist
    const foundQueryParams = this.checkQueryParams();
    // Init the playlist
    if (!foundQueryParams) this.initPlaylist(playlist);
    // Initialize the playlist list UI
    // Only does anything on first call
    // Only if playlist list target is provided
    this.initPlaylistList();
    // Initialize the player UI
    this.initPlayer(this.playlist);
    // Set up the audio context
    this.vis.init();
    // Make sure we have the right draw function
    this.updateTrack(this.trackIndex); // Defaults to 0

    // Setup search
    if (this.el.searchTarget) {
      this.el.searchTarget.oninput = this.onSearchInput.bind(this);
    }
  }
}

// Declare a global variable for Asa
declare global {
  interface Window {
    Asa: typeof Asa;
  }
}
window.Asa = Asa;
