console.log("Hello, World!");

import type {
  AsaMasterList,
  AsaPlaylist,
  AsaPlaylistSimple,
  AsaPlaylistInternal,
  AsaPlaylistId,
  AsaPlaylistList,
} from './types.ts';


type AsaElements = {
  playerTarget: HTMLElement;
  playlistTarget: HTMLElement | null;
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
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  bufferLength: number;
  dataArrayL: Uint8Array<ArrayBuffer>;
  dataArrayR: Uint8Array<ArrayBuffer>;
  dataArrayM: Uint8Array<ArrayBuffer>;
  timeDomainDataL: Uint8Array<ArrayBuffer>;
  timeDomainDataR: Uint8Array<ArrayBuffer>;
  rmsLRaw: number;
  rmsRRaw: number;
  rmsMRaw: number;
  rmsL: number;
  rmsR: number;
  rmsM: number;
  mode: number;
  img: HTMLImageElement | null;
  fn: () => void;
};

type AsaConfig = {
  pathPrefix: string;
  playerElement: HTMLElement;
  playlistListElement?: HTMLElement;
};

class Asa {
  private config: AsaConfig;
  private el: AsaElements;
  private meta = {
    master: null as AsaMasterList | null,
    playlists: null as AsaPlaylistList | null,
  };
  private playlist: AsaPlaylistInternal = [];
  private trackIndex: number = 0;
  private isShuffle: boolean = false;
  private vis: AsaVis | null = null;
  private modeMap = [
    { fftSize: 32, fn: this.draw0 },
    { fftSize: 64, fn: this.draw1 },
    { fftSize: 2048, fn: this.draw1 },
    { fftSize: 64, fn: this.draw2 },
    { fftSize: 2048, fn: this.draw2 },
    { fftSize: 512, fn: this.draw3 },
    { fftSize: 512, fn: this.draw4 },
    { fftSize: 512, fn: this.draw5 },
    { fftSize: 512, fn: this.draw6 },
    { fftSize: 32, fn: this.draw7 }
  ];
  constructor(config: AsaConfig) {
    this.config = config;
    this.el = {
      playerTarget: config.playerElement,
      playlistTarget: config.playlistListElement || null,
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
  private static makePlaylistInternal(master: AsaMasterList, playlist: AsaPlaylist | AsaPlaylistSimple): AsaPlaylistInternal {
    const playlistInternal: AsaPlaylistInternal = [];
    for (const [key, data] of Object.entries(master)) {
      // Handle both simple array and object playlist formats
      const trackIds = Array.isArray(playlist) ? playlist : playlist.trackIds;
      if (trackIds.includes(key)) {
        playlistInternal.push(data);
      }
    }
    return playlistInternal;
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
    this.el.audioPlayer.src = `${this.config.pathPrefix}/${track.audioUri}`;
    this.el.audioPlayer.currentTime = 0;
    this.el.audioPlayer.load();
    if (this.el.albumImage) {
      if (!track.albumImageUri) {
        this.el.albumImage.style.backgroundImage = 'url("placeholder.png")';
        this.vis!.img!.src = 'placeholder.png';
      }
      // Check if the image exists by making a HEAD request
      else {
        fetch(track.albumImageUri, { method: 'HEAD' })
          .then((response) => {
            if (response.ok) {
              this.el.albumImage!.style.backgroundImage = `url("${this.config.pathPrefix}/${track.albumImageUri}")`;
              this.vis!.img!.src = `${this.config.pathPrefix}/${track.albumImageUri}`;
            }
            else {
              this.el.albumImage!.style.backgroundImage = 'url("placeholder.png")';
              this.vis!.img!.src = 'placeholder.png';
            }
          })
          .catch(() => {
            this.el.albumImage!.style.backgroundImage = 'url("placeholder.png")';
            this.vis!.img!.src = 'placeholder.png';
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
    if (this.el.audioPlayer && this.el.audioPlayer.paused) {
      this.play();
    }
    this.vis.mode = (this.vis.mode + 1) % this.modeMap.length;
    console.log(`Visualization mode changed to ${this.vis.mode}`);
    this.updateVisMode();
  }
  private onShuffleClick(): void {
    this.isShuffle = !this.isShuffle;
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
  private updateVisMode(): void {
    if (!this.vis) return;
    const cfg = this.modeMap[this.vis.mode] ?? this.modeMap[0];
    if (cfg!.fftSize) this.setupVisContext(cfg!.fftSize);
    this.vis.fn = cfg!.fn.bind(this);
  }
  // Scrubber Events
  private attachScrubberEvents(scrubber: HTMLElement): void {
    const handleScrub = (e: PointerEvent, scrubber: HTMLElement): void => {
      if (!this.el.audioPlayer) return;
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
  private handleVolume(e: PointerEvent, volumeControl: HTMLElement): void {
    if (!this.el.audioPlayer) return;
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
  private draw0(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    this.vis.ctx.clearRect(0, 0, this.el.albumImage!.width, this.el.albumImage!.height);
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
      const value = this.vis.dataArrayM[i];
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
      const value = this.vis.dataArrayM[i];
      if (!value) continue;
      const percent = value / 256;
      const height = yScale * this.el.albumImage.height * percent;
      const offset = this.el.albumImage.height - height - 1;
      const barWidth = this.el.albumImage.width / this.vis.bufferLength;
      this.vis.ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      this.vis.ctx.fillRect(i * barWidth, offset, barWidth, height);
    }
  }
  private draw3(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    const canvas = this.el.albumImage;
    const ctx = this.vis.ctx;
    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;
    const bufferLength = this.vis.bufferLength;

    ctx.clearRect(0, 0, width, height);

    // Left channel: draw from bottom to top on left half, bars extend from left edge toward center
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayL[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      // Invert y so low frequencies are at the bottom
      const y = height - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      // Invert x: start from left edge, go toward center
      ctx.fillRect(0, y, barLength, barHeight);
    }

    // Right channel: draw from bottom to top on right half, bars extend from right edge toward center (mirrored)
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayR[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      // Invert y so low frequencies are at the bottom
      const y = height - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      // Invert x: start from right edge, go toward center
      ctx.fillRect(width - barLength, y, barLength, barHeight);
    }
  }
  private draw4(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    const canvas = this.el.albumImage;
    const ctx = this.vis.ctx;
    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;
    const bufferLength = this.vis.bufferLength;

    ctx.clearRect(0, 0, width, height);

    // Left channel: draw from bottom to top on left half, bars extend from left edge toward center
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayL[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      // Invert y so low frequencies are at the bottom
      const y = height - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth - barLength, y, barLength, barHeight);
    }

    // Right channel: draw from bottom to top on right half, bars extend from right edge toward center (mirrored)
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayR[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      // Invert y so low frequencies are at the bottom
      const y = height - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth, y, barLength, barHeight);
    }

  }
  private draw5(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;

    const canvas = this.el.albumImage;
    const ctx = this.vis.ctx;
    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;
    const bufferLength = this.vis.bufferLength;

    ctx.clearRect(0, 0, width, height);

    // Left channel: draw from top to bottom on left half, bars extend from left edge toward center
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayL[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      const y = i * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth - barLength, y, barLength, barHeight);
    }
    // Right channel: draw from top to bottom on right half, bars extend from right edge toward center (mirrored)
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayR[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      const y = i * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth, y, barLength, barHeight);
    }
  }
  private draw6(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    const canvas = this.el.albumImage;
    const ctx = this.vis.ctx;
    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;
    const bufferLength = this.vis.bufferLength;

    ctx.clearRect(0, 0, width, height);

    // Left channel: draw from top to bottom on left half, bars extend rightward
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayL[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      const y = i * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth - barLength, y, barLength, barHeight);
    }

    // Right channel: draw from bottom to top on right half, bars extend leftward (mirrored)
    for (let i = 0; i < bufferLength; i++) {
      const value = this.vis.dataArrayR[i];
      if (!value) continue;
      const percent = value / 256;
      const barLength = percent * halfWidth;
      const barHeight = height / bufferLength;
      const y = height - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(255,255,255, 0.5)';
      ctx.fillRect(halfWidth, y, barLength, barHeight);
    }
  }
  private draw7(): void {
    if (!this.el.albumImage) return;
    if (!this.vis) return;
    if (!this.vis.ctx) return;
    this.vis.ctx.clearRect(0, 0, this.el.albumImage!.width, this.el.albumImage!.height);
    // Check if the image is loaded
    // Draw vis.img at center
    const img = this.vis.img;
    if (!img) return;
    const canvas = this.el.albumImage;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = this.vis.ctx;
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    const x = (canvas.width - drawWidth) / 2;
    const y = (canvas.height - drawHeight) / 2;
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
    const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
    const data = imageData.data;
    const min = 0.3;
    const scale = 1.0 - min;
    for (let i = 0; i < data.length; i += 4) {
      // NOTE: data[i] is red, data[i+1] is green, data[i+2] is blue, data[i+3] is alpha
      data[i]! *= Math.pow(min + this.vis.rmsM * scale, 0.5);
      data[i + 1]! *= Math.pow(min + this.vis.rmsL * scale, 0.5);
      data[i + 2]! *= Math.pow(min + this.vis.rmsR * scale, 0.5);
    }
    ctx.putImageData(imageData, 0, 0);
  }
  private draw(): void {
    if (!this.vis) return;
    requestAnimationFrame(this.draw.bind(this));
    this.vis.analyserL.getByteFrequencyData(this.vis.dataArrayL);
    this.vis.analyserR.getByteFrequencyData(this.vis.dataArrayR);
    // Merge left and right channels for mono data
    if (this.vis) {
      for (let i = 0; i < this.vis.bufferLength; i++) {
        const l = this.vis.dataArrayL[i] || 0;
        const r = this.vis.dataArrayR[i] || 0;
        this.vis.dataArrayM[i] = (l + r) / 2;
      }
    }
    this.vis.analyserL.getByteTimeDomainData(this.vis.timeDomainDataL);
    this.vis.analyserR.getByteTimeDomainData(this.vis.timeDomainDataR);
    // Calculate rms from a buffer
    const rms = (data: Uint8Array) => {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = ((data?.[i] ?? 128) - 128) / 128; // Normalize to [-1, 1]
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    };
    this.vis.rmsLRaw = rms(this.vis.timeDomainDataL);
    this.vis.rmsRRaw = rms(this.vis.timeDomainDataR);
    // Merge rms
    this.vis.rmsMRaw = (this.vis.rmsLRaw + this.vis.rmsRRaw) / 2;
    const alpha = 0.1; // Smoothing factor (0 < alpha < 1)
    this.vis.rmsL = this.vis.rmsL * (1 - alpha) + this.vis.rmsLRaw * alpha;
    this.vis.rmsR = this.vis.rmsR * (1 - alpha) + this.vis.rmsRRaw * alpha;
    this.vis.rmsM = this.vis.rmsM * (1 - alpha) + this.vis.rmsMRaw * alpha;
    this.vis.fn();
  }
  private setupVisContext(fftSize: number = 2048): void {
    if (this.el.albumImage && this.el.audioPlayer) {
      const ctx = this.el.albumImage.getContext('2d');
      if (this.vis && this.vis.audioCtx) {
        this.vis.audioCtx.close();
      }
      const audioCtx = new (AudioContext)();
      const source = audioCtx.createMediaElementSource(this.el.audioPlayer);
      const splitter = audioCtx.createChannelSplitter(2);
      const analyserL = audioCtx.createAnalyser();
      const analyserR = audioCtx.createAnalyser();
      source.connect(splitter);
      analyserL.fftSize = fftSize;
      analyserR.fftSize = fftSize;
      splitter.connect(analyserL, 0); // Left channel
      splitter.connect(analyserR, 1); // Right channel
      source.connect(analyserL);
      source.connect(analyserR);
      source.connect(audioCtx.destination);
      const bufferLength = analyserL.frequencyBinCount;
      const dataArrayL = new Uint8Array(bufferLength);
      const dataArrayR = new Uint8Array(bufferLength);
      const dataArrayM = new Uint8Array(bufferLength);
      const mode = this.vis?.mode || 1;// 0 is none
      this.vis = {
        ctx: ctx,
        audioCtx: audioCtx,
        analyserL: analyserL,
        analyserR: analyserR,
        bufferLength: bufferLength,
        dataArrayL: dataArrayL,
        dataArrayR: dataArrayR,
        dataArrayM: dataArrayM,
        timeDomainDataL: new Uint8Array(bufferLength),
        timeDomainDataR: new Uint8Array(bufferLength),
        rmsLRaw: 0,
        rmsRRaw: 0,
        rmsMRaw: 0,
        rmsL: 0,
        rmsR: 0,
        rmsM: 0,
        mode: mode,
        img: this.vis?.img ?? new Image(), // Will be set later
        fn: () => { },// Will be set later
      };

      this.el.audioPlayer.onplay = () => {
        console.log("Resuming audio context");
        audioCtx.resume();
        this.draw();
      };
    }
  }
  private initPlayer(playlist: AsaPlaylistInternal): void {
    this.el.playerTarget.innerHTML = ''; // Clear existing content
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
  private initPlaylistList(): void {
    if (!this.el.playlistTarget) return;
    if (!this.meta.playlists) return;
    this.el.playlistTarget.innerHTML = '';
    for (const [playlistId, playlistData] of Object.entries(this.meta.playlists)) {
      console.log(`Adding playlist ${playlistId}: ${JSON.stringify(playlistData)}`);
      const listElement = document.createElement('div');
      listElement.className = 'asa-playlist-list-item';
      listElement.onclick = async () => {
        await this.yeet(playlistId);
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

      const coverElement = document.createElement('div');
      coverElement.className = 'asa-playlist-list-item-cover';
      coverElement.style.backgroundImage = `url("${playlistData.albumImageUri || ''}")`;
      listElement.appendChild(coverElement);

      this.el.playlistTarget.appendChild(listElement);
    }
  }
  async yeet(playlist: AsaPlaylist | AsaPlaylistSimple | AsaPlaylistId): Promise<void> {
    // We only want to grab the  master list once
    if (!this.meta.master) {
      await this.fetchMetadata();
    }
    if (!this.meta.master) {
      throw new Error("Master metadata not initialized");
    }
    // Reset track index and playlist
    this.trackIndex = 0;
    if (this.el.tracks) {
      this.el.tracks = [];
    }
    if (typeof playlist === 'object') {
      this.playlist = Asa.makePlaylistInternal(this.meta.master, playlist);
    }
    else { // it's an ID
      if (!this.meta.playlists) {
        throw new Error("Playlists metadata not initialized");
      }
      const playlistRaw = this.meta.playlists[playlist];
      if (!playlistRaw) {
        throw new Error(`Playlist with ID ${playlist} not found`);
      }
      this.playlist = Asa.makePlaylistInternal(this.meta.master, playlistRaw);
    }
    console.log("Playlist:", this.playlist);
    this.initPlaylistList();
    this.initPlayer(this.playlist);
    this.updateTrack(0);
    // Set up the audio context
    this.setupVisContext();
    // Make sure we have the right draw function
    this.updateVisMode();
  }
}

declare global {
  interface Window {
    Asa: typeof Asa;
  }
}

window.Asa = Asa;
