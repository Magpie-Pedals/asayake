console.log("Hello, World!");

import type { MasterList } from '../types.ts';
import type { TrackMeta } from '../types.ts';

type PlaylistRaw = string[];
type Playlist = TrackMeta[];


type Elements = {
  target: HTMLElement;
  asa: HTMLElement | null;
  audioPlayer: HTMLAudioElement | null;
  nowPlayingTitle: HTMLElement | null;
  nowPlayingArtist: HTMLElement | null;
  nowPlayingAlbum: HTMLElement | null;
  scrubberFill: HTMLElement | null;
  albumImage: HTMLImageElement | null;
  tracks: HTMLElement[] | null;
};

class Asa {
  private el: Elements;
  private master: MasterList | null = null;
  private playlist: Playlist = [];
  private trackIndex: number = 0;
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
  private static async fetchMetadata(): Promise<MasterList | null> {
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
  private static makePlaylist(master: MasterList, playlistRaw: PlaylistRaw): Playlist {
    const playlist: Playlist = [];
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
        this.el.albumImage.src = 'placeholder.png';
      }
      else {
        fetch(track.albumImageUri, { method: 'HEAD' })
          .then((response) => {
            if (response.ok) {
              this.el.albumImage!.src = track.albumImageUri;
            }
            else {
              this.el.albumImage!.src = 'placeholder.png';
            }
          })
          .catch(() => {
            this.el.albumImage!.src = 'placeholder.png';
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
  private onScrub(e: MouseEvent): void {
    if (!this.el.audioPlayer) return;
    const scrubber = e.currentTarget as HTMLElement;
    const rect = scrubber.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percent = clickX / width;
    const newTime = percent * this.el.audioPlayer.duration;
    this.el.audioPlayer.currentTime = newTime;
  }
  private onPlaylistClick(trackIndex: number): void {
    console.log(`Track ${trackIndex} clicked`);
    this.updateTrack(trackIndex);
    this.play();
    this.trackIndex = trackIndex;
  }
  private initPlayer(playlist: Playlist): void {
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
    this.el.albumImage = document.createElement('img');
    this.el.albumImage.className = 'asa-album-image';
    this.el.asa.appendChild(this.el.albumImage);

    // Add the control elements
    const controlsElement = document.createElement('div');
    controlsElement.className = 'asa-controls';

    const ppButton = document.createElement('button');
    ppButton.className = 'asa-btn asa-pp-button';
    ppButton.innerText = 'PP';
    ppButton.onclick = this.onPPClick.bind(this);

    const prevButton = document.createElement('button');
    prevButton.className = 'asa-btn asa-prev-button';
    prevButton.innerText = '<<';
    prevButton.onclick = () => this.prevTrack(this.trackIndex);

    const nextButton = document.createElement('button');
    nextButton.className = 'asa-btn asa-next-button';
    nextButton.innerText = '>>';
    nextButton.onclick = () => this.nextTrack(this.trackIndex);

    const scrubber = document.createElement('div');
    scrubber.className = 'asa-scrubber';
    this.el.scrubberFill = document.createElement('div');
    this.el.scrubberFill.className = 'asa-scrubber-fill';
    scrubber.appendChild(this.el.scrubberFill);
    scrubber.onclick = (e: MouseEvent) => { this.onScrub(e); };
    controlsElement.appendChild(scrubber);

    const timeStamp = document.createElement('div');
    timeStamp.className = 'asa-timestamp';
    timeStamp.innerText = '00:00 / 00:00';

    const controlsBtnWrap = document.createElement('div');
    controlsBtnWrap.className = 'asa-controls-btn-wrap';
    controlsBtnWrap.appendChild(prevButton);
    controlsBtnWrap.appendChild(ppButton);
    controlsBtnWrap.appendChild(nextButton);
    controlsElement.appendChild(controlsBtnWrap);
    controlsElement.appendChild(scrubber);
    this.el.asa.appendChild(controlsElement);
    this.el.asa.appendChild(timeStamp);
    // NOTE:
    // Listening for `ended` has some delay so use this instead
    this.el.audioPlayer.addEventListener('timeupdate', () => {
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
      timeStamp.innerText = `${formatTime(current)} / ${formatTime(duration)}`;
    });
    this.el.asa.appendChild(this.el.audioPlayer);
    // Finally, append to target
    this.el.target.appendChild(this.el.asa);
  }
  async yeet(playlistRaw: PlaylistRaw = []): Promise<void> {
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
