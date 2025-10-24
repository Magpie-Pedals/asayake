console.log("Hello, World!");

import type { AsaMasterList } from './types.ts';
import type { AsaTrackMeta } from './types.ts';

type AsaPlaylistRaw = string[];
type AsaPlaylist = AsaTrackMeta[];

type AsaElements = {
  target: HTMLElement;
  asa: HTMLElement | null;
  audioPlayer: HTMLAudioElement | null;
  nowPlayingTitle: HTMLElement | null;
  nowPlayingArtist: HTMLElement | null;
  nowPlayingAlbum: HTMLElement | null;
  scrubberFill: HTMLElement | null;
  volumeFill: HTMLElement | null;
  albumImage: HTMLCanvasElement | null;
  tracks: HTMLElement[] | null;
};

type AsaVis = {
  ctx: CanvasRenderingContext2D | null;
  audioCtx: AudioContext;
  analyser: AnalyserNode;
  bufferLength: number;
  dataArray: Uint8Array<ArrayBuffer>;
  mode: number;
}

class Asa {
  private el: AsaElements;
  private master: AsaMasterList | null = null;
  private playlist: AsaPlaylist = [];
  private trackIndex: number = 0;
  private isShuffle: boolean = false;
  private vis: AsaVis | null = null;
  constructor(elementId: string) {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with id ${elementId} not found`);
    }
    this.el = {
      target: element,
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
  }
  private async init(): Promise<void> {
    this.master = await Asa.fetchMetadata();
    if (!this.master) {
      throw new Error("Failed to load master metadata");
    }
  }
  private static async fetchMetadata(): Promise<AsaMasterList | null> {
    try {
      const response = await fetch('metadata/metadata.json');
      const data = await response.json();
      return data;
    }
    catch (error) {
      console.error("Error fetching metadata:", error);
      return null;
    }
  }
  private static makePlaylist(master: AsaMasterList, playlistRaw: AsaPlaylistRaw): AsaPlaylist {
    const playlist: AsaPlaylist = [];
    for (const [key, data] of Object.entries(master)) {
      if (playlistRaw.includes(key)) {
        playlist.push(data);
      }
    }
    return playlist;
  }
  private play(): void {
    this.el.audioPlayer?.play();
    this.el.asa?.classList.add('asa-playing');
  }
  private pause(): void {
    this.el.audioPlayer?.pause();
    this.el.asa?.classList.remove('asa-playing');
  }
  private updateTrack(trackIndex: number): void {
    const track = this.playlist[trackIndex];
    if (!track) {
      console.error(`Track at index ${trackIndex} not found in playlist`);
      return;
    }
    if (!this.el.audioPlayer) {
      console.error("Audio element not initialized");
      return;
    }
    this.el.audioPlayer.src = track.audioUri;
    this.el.audioPlayer.currentTime = 0;
    this.el.audioPlayer.load();
    if (this.el.albumImage) {
      // Check if the image exists by making a HEAD request
      if (!track.albumImageUri) {
        this.el.albumImage.style.backgroundImage = 'url("placeholder.png")';
      }
      else {
        fetch(track.albumImageUri, { method: 'HEAD' })
          .then((response) => {
            if (response.ok) {
              this.el.albumImage!.style.backgroundImage = `url("${track.albumImageUri}")`;
            }
            else {
              this.el.albumImage!.style.backgroundImage = 'url("placeholder.png")';
            }
          })
          .catch(() => {
            this.el.albumImage!.style.backgroundImage = 'url("placeholder.png")';
          });
      }
    }
    this.el.nowPlayingTitle!.innerText = track.title;
    this.el.nowPlayingArtist!.innerText = track.artist;
    this.el.nowPlayingAlbum!.innerText = track.albumTitle;
    for (const [index, trackEl] of (this.el.tracks ?? []).entries()) {
      console.log(`Checking track element at index ${index}`);
      trackEl.classList.remove('asa-track-playing');
      if (index === trackIndex) {
        console.log(`found: ${index}`);
        trackEl.classList.add('asa-track-playing');
      }
    }
  }
  private nextTrack(currentIndex: number): void {
    this.trackIndex = (currentIndex + 1) % this.playlist.length;
    this.updateTrack(this.trackIndex);
    this.play();
  }
  private prevTrack(currentIndex: number): void {
    this.trackIndex = (currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.updateTrack(this.trackIndex);
    this.play();
  }
  private onPPClick(): void {
    if (!this.el.audioPlayer) return;
    if (this.el.audioPlayer.paused) {
      this.play();
    }
    else {
      this.pause();
    }
  }
  private onAlbumImageClick(): void {
    if (!this.vis) return;
    this.vis.mode = (this.vis.mode + 1) % 3;
  }
  private onShuffleClick(): void {
    this.isShuffle = !this.isShuffle;
  }
  // SCRUBBER EVENTS
  private handleScrub(e: PointerEvent, scrubber: HTMLElement): void {
    if (!this.el.audioPlayer) return;
    const rect = scrubber.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const width = rect.width;
    const percent = Math.max(0, Math.min(1, pointerX / width));
    const newTime = percent * this.el.audioPlayer.duration;
    this.el.audioPlayer.currentTime = newTime;
  }
  private attachScrubberEvents(scrubber: HTMLElement): void {
    const onPointerMove = (e: PointerEvent) => {
      this.handleScrub(e, scrubber);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    scrubber.addEventListener('pointerdown', (e: PointerEvent) => {
      this.handleScrub(e, scrubber);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
  // VOLUME EVENTS
  private handleVolume(e: PointerEvent, volumeControl: HTMLElement): void {
    if (!this.el.audioPlayer) return;
    const rect = volumeControl.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const width = rect.width;
    const percent = Math.max(0, Math.min(1, pointerX / width));
    this.el.audioPlayer.volume = percent;
    if (this.el.volumeFill) {
      this.el.volumeFill.style.width = `${percent * 100}%`;
    }
  }
  private attachVolumeEvents(volumeControl: HTMLElement): void {
    const onPointerMove = (e: PointerEvent) => {
      this.handleVolume(e, volumeControl);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    volumeControl.addEventListener('pointerdown', (e: PointerEvent) => {
      this.handleVolume(e, volumeControl);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
  private onPlaylistClick(trackIndex: number): void {
    console.log(`Track ${trackIndex} clicked`);
    this.updateTrack(trackIndex);
    this.play();
    this.trackIndex = trackIndex;
  }
  // NOTE:
  // Listening for `ended` has some delay so use this instead
  private onTimeUpdate(timestamp: HTMLElement): void {
    if (!this.el.audioPlayer) return;
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
    timestamp.innerText = `${formatTime(current)} / ${formatTime(duration)}`;
  }
  private draw0(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    this.vis.ctx.clearRect(0, 0, this.el.albumImage!.width, this.el.albumImage!.height);
    return;
  }
  private draw1(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    this.vis.ctx.clearRect(0, 0, this.el.albumImage!.width, this.el.albumImage!.height);
    const yScale = 0.5;
    const half = Math.floor(this.vis.bufferLength / 2);
    const barWidth = this.el.albumImage.width / this.vis.bufferLength;

    for (let i = 0; i < half; i++) {
      const value = this.vis.dataArray[i];
      if (!value) continue;
      const percent = value / 256;
      const height = yScale * this.el.albumImage.height * percent;
      const offset = this.el.albumImage.height - height - 1;

      // Left side
      let xLeft = i * barWidth;
      // Right side (mirrored)
      let xRight = this.el.albumImage.width - (i + 1) * barWidth;

      this.vis.ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      this.vis.ctx.fillRect(xLeft, offset, barWidth, height);
      this.vis.ctx.fillRect(xRight, offset, barWidth, height);
    }
  }
  private draw2(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    this.vis.ctx.clearRect(0, 0, this.el.albumImage!.width, this.el.albumImage!.height);
    const yScale = 0.5;
    for (let i = 0; i < this.vis.bufferLength; i++) {
      const value = this.vis.dataArray[i];
      if (!value) continue;
      const percent = value / 256;
      const height = yScale * this.el.albumImage.height * percent;
      const offset = this.el.albumImage.height - height - 1;
      const barWidth = this.el.albumImage.width / this.vis.bufferLength;
      this.vis.ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      this.vis.ctx.fillRect(i * barWidth, offset, barWidth, height);
    }
  }
  private draw(): void {
    if (!this.vis) return;
    requestAnimationFrame(this.draw.bind(this));
    this.vis.analyser.getByteFrequencyData(this.vis.dataArray);
    switch (this.vis.mode) {
      case 0:
        this.draw0();
        break;
      case 1:
        this.draw1();
        break;
      case 2:
        this.draw2();
        break;
      default:
        this.draw0();
        break;
    }
  }
  private setupAudioContext(): void {
    if (this.el.albumImage && this.el.audioPlayer) {
      const ctx = this.el.albumImage.getContext('2d');
      const audioCtx = new (AudioContext)();
      const source = audioCtx.createMediaElementSource(this.el.audioPlayer);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;//2048
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.vis = {
        ctx: ctx,
        audioCtx: audioCtx,
        analyser: analyser,
        bufferLength: bufferLength,
        dataArray: dataArray,
        mode: 1,// 0 is none
      };

      this.el.audioPlayer.onplay = () => {
        console.log("Resuming audio context");
        audioCtx.resume();
        this.draw();
      };
    }
  }
  private initPlayer(playlist: AsaPlaylist): void {
    this.el.target.innerHTML = ''; // Clear existing content
    this.el.asa = document.createElement('div');
    this.el.asa.className = 'asa-player';
    const playlistElement = document.createElement('div');
    playlistElement.className = 'asa-playlist';
    for (const track of playlist) {
      const trackElement = document.createElement('div');
      trackElement.className = 'asa-track';
      trackElement.onclick = () => this.onPlaylistClick(playlist.indexOf(track));
      trackElement.innerHTML = `${track.artist} - ${track.title}`;
      playlistElement.appendChild(trackElement);
      this.el.tracks?.push(trackElement);
    }
    this.el.asa.appendChild(playlistElement);

    // Append the audio player
    this.el.audioPlayer = document.createElement('audio');
    this.el.audioPlayer.controls = false;

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
    this.el.asa.appendChild(this.el.albumImage);
    this.el.albumImage.onclick = this.onAlbumImageClick.bind(this);

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
    this.el.target.appendChild(this.el.asa);

    // Setup audio event listeners
    this.el.audioPlayer.addEventListener('timeupdate', this.onTimeUpdate.bind(this, timestamp));

    // Set up the audio context
    this.setupAudioContext();
  }
  async yeet(playlistRaw: AsaPlaylistRaw = []): Promise<void> {
    // We only want to grab the  master list once
    if (!this.master) {
      await this.init();
    }
    if (!this.master) {
      throw new Error("Master metadata not initialized");
    }
    // Reset track index and playlist
    this.trackIndex = 0;
    if (this.el.tracks) {
      this.el.tracks = [];
    }
    this.playlist = Asa.makePlaylist(this.master, playlistRaw);
    console.log("Playlist:", this.playlist);
    this.initPlayer(this.playlist);
    this.updateTrack(0);
  }
}

declare global {
  interface Window {
    Asa: typeof Asa;
  }
}
window.Asa = Asa;
