import { shaders } from './shaders.ts';
import type {
  AsaMasterList,
  AsaPlaylist,
  AsaPlaylistSimple,
  AsaPlaylistInternal,
  AsaPlaylistId,
  AsaPlaylistList,
} from './types.ts';

// Shaders consist of vertex and fragment shader source code
export type AsaShader = {
  vsSource: string;
  fsSource: string;
};

// HTML elements used in the Asa player
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

// Visualization context and state
type AsaVis = {
  ctx: WebGLRenderingContext | null;
  mediaSourceNode: MediaElementAudioSourceNode | null;
  drawProgram: WebGLProgram | null;
  drawLocs: any;
  drawBuf: WebGLBuffer | null;
  albumImageTexture: WebGLTexture | null;
  audioCtx: AudioContext;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  bufferLength: number;
  rmsL: number;
  rmsR: number;
  rmsM: number;
  mode: number;
  img: HTMLImageElement | null;
  shader: AsaShader;
};

// Configuration for Asa player
type AsaConfig = {
  pathPrefix: string;
  playerElement: HTMLElement;
  playlistListElement?: HTMLElement;
};

// Main Asa player class
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
  // Visualization modes configuration
  private modeMap = [
    { fftSize: 32, shader: shaders.nothing },
    { fftSize: 2048, shader: shaders.spectrumAnalyzer },
    { fftSize: 32, shader: shaders.stereoColor },
    { fftSize: 32, shader: shaders.stereoCAFull },
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
  // Play the current track
  private play(): void {
    this.el.audioPlayer?.play();
    this.el.asa?.classList.add('asa-playing');
  }
  // Pause the current track
  private pause(): void {
    this.el.audioPlayer?.pause();
    this.el.asa?.classList.remove('asa-playing');
  }
  // Update album image texture
  // Image size might not be power of 2, so set parameters accordingly
  private updateShaderTexture(): void {
    if (!this.vis) this.error("Visualization context not initialized");
    if (!this.vis.img) this.error("Album image not initialized");
    const gl = this.vis.ctx;
    if (!gl) this.error("WebGL context not initialized");
    console.log("Album image loaded, updating texture");
    // Create or update texture with correct parameters for NPOT images
    const isPowerOf2 = (value: number) => (value & (value - 1)) === 0;
    const img = this.vis.img;
    this.vis.albumImageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.vis.albumImageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    if (isPowerOf2(img.width) && isPowerOf2(img.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  // Update track information and audio source
  // Called when changing tracks
  private updateTrack(trackIndex: number): void {
    if (!this.vis) this.error("Visualization context not initialized");
    if (this.vis.img) {
      console.log("Setting album image source");
      this.vis.img.onload = () => {
        this.updateShaderTexture();
      };
    }
    // Update audio source and metadata display
    const track = this.playlist[trackIndex];
    if (!track) this.error(`Track at index ${trackIndex} not found in playlist`);
    if (!this.el.audioPlayer) this.error("Audio player element not initialized");

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
      trackEl.classList.remove('asa-track-playing');
      if (index === trackIndex) {
        trackEl.classList.add('asa-track-playing');
      }
    }
  }
  // Navigate to next track
  private nextTrack(currentIndex: number): void {
    this.trackIndex = (currentIndex + 1) % this.playlist.length;
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
    if (!this.vis) this.error("Visualization context not initialized");
    if (this.el.audioPlayer && this.el.audioPlayer.paused) {
      this.play();
    }
    this.vis.mode += 1;
    this.vis.mode = this.vis.mode % this.modeMap.length;
    console.log(`Visualization mode changed to ${this.vis.mode}`);
    this.updateVisMode();
  }
  // Shuffle button click handler
  private onShuffleClick(): void {
    this.isShuffle = !this.isShuffle;
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
    timestamp.innerText = `${formatTime(current)} / ${formatTime(duration)}`;
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
  // Compile a shader from source
  private compileShader(type: number, src: string): WebGLShader | null {
    if (!this.vis) this.error("Visualization context not initialized");
    if (!this.vis.ctx) this.error("WebGL context not initialized");
    const gl = this.vis.ctx;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }
  // Main draw loop
  // Called via requestAnimationFrame
  private draw(): void {
    if (!this.vis) this.error("Visualization context not initialized");
    // Update audio data
    requestAnimationFrame(this.draw.bind(this));
    let dataArrayL: Uint8Array<ArrayBuffer> = new Uint8Array(this.vis.bufferLength);
    let dataArrayR: Uint8Array<ArrayBuffer> = new Uint8Array(this.vis.bufferLength);
    let dataArrayM: Uint8Array<ArrayBuffer> = new Uint8Array(this.vis.bufferLength);
    this.vis.analyserL.getByteFrequencyData(dataArrayL);
    this.vis.analyserR.getByteFrequencyData(dataArrayR);
    // Merge left and right channels for mono data
    if (this.vis) {
      for (let i = 0; i < this.vis.bufferLength; i++) {
        const l = dataArrayL[i] || 0;
        const r = dataArrayR[i] || 0;
        dataArrayM[i] = (l + r) / 2;
      }
    }
    const timeDomainDataL = new Uint8Array(this.vis.bufferLength);
    const timeDomainDataR = new Uint8Array(this.vis.bufferLength);
    this.vis.analyserL.getByteTimeDomainData(timeDomainDataL);
    this.vis.analyserR.getByteTimeDomainData(timeDomainDataR);
    // Calculate rms from a buffer
    const rms = (data: Uint8Array) => {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = ((data?.[i] ?? 128) - 128) / 128; // Normalize to [-1, 1]
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    };
    const rmsLRaw = rms(timeDomainDataL);
    const rmsRRaw = rms(timeDomainDataR);
    // Merge rms
    const rmsMRaw = (rmsLRaw + rmsRRaw) / 2;
    const alpha = 0.1; // Smoothing factor (0 < alpha < 1)
    this.vis.rmsL = this.vis.rmsL * (1 - alpha) + rmsLRaw * alpha;
    this.vis.rmsR = this.vis.rmsR * (1 - alpha) + rmsRRaw * alpha;
    this.vis.rmsM = this.vis.rmsM * (1 - alpha) + rmsMRaw * alpha;

    // Gl draw routine
    const gl = this.vis.ctx;
    if (!gl) this.error("WebGL context not initialized");
    if (!this.el.albumImage) this.error("Album image canvas not initialized");
    const bufferLength = this.vis.bufferLength;
    const locs = this.vis.drawLocs;
    gl.useProgram(this.vis.drawProgram);
    // Set uniforms
    gl.uniform1f(locs.uWidth, this.el.albumImage.width);
    gl.uniform1f(locs.uHeight, this.el.albumImage.height);
    gl.uniform1f(locs.uBufferLength, bufferLength);
    gl.uniform1f(locs.uRMSM, this.vis.rmsM);
    gl.uniform1f(locs.uRMSL, this.vis.rmsL);
    gl.uniform1f(locs.uRMSR, this.vis.rmsR);
    // Set analyser data uniforms
    gl.activeTexture(gl.TEXTURE1);
    const analyserLTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserLTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArrayL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserL, 1); // Texture unit 1

    gl.activeTexture(gl.TEXTURE2);
    const analyserRTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserRTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArrayR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserR, 2); // Texture unit 2

    gl.activeTexture(gl.TEXTURE3);
    const analyserMTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserMTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArrayM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserM, 3); // Texture unit 3

    // Set album image uniform
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(locs.uAlbumImage, 0); // Texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.vis.albumImageTexture);

    // Prepare fullscreen triangle buffer
    const positions = new Float32Array([
      -1, -1,
      3, -1,
      -1, 3,
    ]);
    const buf = this.vis.drawBuf || gl.createBuffer();
    this.vis.drawBuf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enableVertexAttribArray(locs.aPosition);
    gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(locs.aPosition);
    gl.useProgram(null);
  }
  // Update visualization mode
  // Compiles and sets the appropriate shader program
  private updateVisMode(): void {
    if (!this.vis) this.error("Visualization context not initialized");
    const gl = this.vis.ctx;
    if (!gl) this.error("WebGL context not initialized");
    // Clear the existing program
    if (this.vis.drawProgram) {
      gl.deleteProgram(this.vis.drawProgram);
      gl.deleteBuffer(this.vis.drawBuf);
      gl.deleteShader;
      this.vis.drawProgram = null;
    }
    const cfg = this.modeMap[this.vis.mode] ?? this.modeMap[0];
    if (cfg!.fftSize) this.setupVisContext(cfg!.fftSize);
    if (!cfg!.shader) this.error("Shader configuration missing");
    this.vis.shader = cfg!.shader;
    const { vsSource, fsSource } = this.vis.shader;
    // Replace aIndex with aPosition in shader sources if needed
    const patchedVsSource = vsSource.replace(/attribute\s+float\s+aIndex;/, 'attribute vec2 aPosition;');
    this.vis.shader.vsSource = patchedVsSource;
    const vs = this.compileShader(gl.VERTEX_SHADER, this.vis.shader.vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) this.error("Failed to compile shaders");
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.vis.drawProgram = prog;
    this.vis.drawLocs = {
      aPosition: gl.getAttribLocation(prog, "aPosition"),
      uWidth: gl.getUniformLocation(prog, "uWidth"),
      uHeight: gl.getUniformLocation(prog, "uHeight"),
      uBufferLength: gl.getUniformLocation(prog, "uBufferLength"),
      uAnalyserL: gl.getUniformLocation(prog, "uAnalyserL"),
      uAnalyserR: gl.getUniformLocation(prog, "uAnalyserR"),
      uAnalyserM: gl.getUniformLocation(prog, "uAnalyserM"),
      uRMSL: gl.getUniformLocation(prog, "uRMSL"),
      uRMSR: gl.getUniformLocation(prog, "uRMSR"),
      uRMSM: gl.getUniformLocation(prog, "uRMSM"),
      uAlbumImage: gl.getUniformLocation(prog, "uAlbumImage"),
    };
    this.updateShaderTexture();
  }
  // Set up WebGL and AudioContext for visualization
  // Called when initializing, changing modes, or changing fftSize
  private setupVisContext(fftSize: number = 2048): void {
    if (!this.el.albumImage || !this.el.audioPlayer) this.error("Album image canvas or audio player not initialized");
    console.log("Setting up visualization context");
    const ctx = this.el.albumImage.getContext('webgl');

    let audioCtx: AudioContext;
    let source: MediaElementAudioSourceNode;

    // Reuse existing audio context and source node if available
    if (this.vis && this.vis.audioCtx && this.vis.mediaSourceNode) {
      audioCtx = this.vis.audioCtx;
      source = this.vis.mediaSourceNode;
      // Disconnect existing connections to reconfigure
      source.disconnect();
    } else {
      // Close old context if it exists
      if (this.vis && this.vis.audioCtx) {
        this.vis.audioCtx.close();
      }
      audioCtx = new (AudioContext)();
      source = audioCtx.createMediaElementSource(this.el.audioPlayer);
    }

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
    const mode = this.vis?.mode ?? 0;// 0 is none
    this.vis = {
      ctx: ctx,
      mediaSourceNode: source,
      drawProgram: null,
      drawLocs: null,
      drawBuf: null,
      albumImageTexture: null,
      audioCtx: audioCtx,
      analyserL: analyserL,
      analyserR: analyserR,
      bufferLength: bufferLength,
      rmsL: 0,
      rmsR: 0,
      rmsM: 0,
      mode: mode,
      img: this.vis?.img ?? new Image(), // Will be set later
      shader: shaders.shader0!,
    };
    this.el.audioPlayer.onplay = () => {
      audioCtx.resume();
      this.draw();
    };
    // Create default 1x1 white texture to avoid null texture issues
    if (ctx) {
      this.vis.albumImageTexture = ctx.createTexture();
      ctx.bindTexture(ctx.TEXTURE_2D, this.vis.albumImageTexture);
      const defaultPixel = new Uint8Array([255, 255, 255, 255]); // White pixel
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, defaultPixel);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
    }
  }
  // Initialize the player UI
  // Called when loading a playlist
  private initPlayer(playlist: AsaPlaylistInternal): void {
    this.el.playerTarget.innerHTML = ''; // Clear existing content
    // Clear vis context since we're creating a new audio element
    if (this.vis && this.vis.audioCtx) {
      this.vis.audioCtx.close();
      this.vis = null;
    }
    this.el.asa = document.createElement('div');
    this.el.asa.className = 'asa-player';
    const playlistElement = document.createElement('div');
    playlistElement.className = 'asa-playlist';
    for (const track of playlist) {
      const trackElement = document.createElement('div');
      trackElement.className = 'asa-track';
      trackElement.onclick = () => this.onPlaylistClick(playlist.indexOf(track));
      trackElement.innerHTML = `${track.artist} - ${track.title} `;
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
    if (!this.el.playlistTarget) this.error("Playlist list element not initialized");
    if (!this.meta.playlists) this.error("Playlists metadata not initialized");
    this.el.playlistTarget.innerHTML = '';
    for (const [playlistId, playlistData] of Object.entries(this.meta.playlists)) {
      const listElement = document.createElement('div');
      listElement.className = 'asa-playlist-list-item';
      listElement.onclick = async () => {
        // We need to preserve the current vis mode
        // It is reset by yeet
        const visMode = this.vis?.mode || 0;
        await this.yeet(playlistId);
        this.vis!.mode = visMode;
        this.updateVisMode();
        this.play();
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
  // Load and play a playlist
  // Accepts various playlist formats or IDs
  public async yeet(playlist: AsaPlaylist | AsaPlaylistSimple | AsaPlaylistId): Promise<void> {
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
    this.initPlaylistList();
    this.initPlayer(this.playlist);
    // Set up the audio context
    this.setupVisContext();
    // Make sure we have the right draw function
    this.updateVisMode();
    this.updateTrack(0);
  }
}

// Declare a global variable for Asa
declare global {
  interface Window {
    Asa: typeof Asa;
  }
}
window.Asa = Asa;
