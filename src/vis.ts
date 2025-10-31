/*
 * Asa Player Visualization Module
 * Handles WebGL context, shaders, and audio analysis
*/

import { shaders } from './shaders';
import type { AsaElements } from './types';
// Shaders consist of vertex and fragment shader source code
export type AsaShader = {
  vsSource: string;
  fsSource: string;
};
// Visualization context and state
type AsaVisData = {
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
  dataArrayL: Uint8Array<ArrayBuffer>;
  dataArrayR: Uint8Array<ArrayBuffer>;
  dataArrayM: Uint8Array<ArrayBuffer>;
  rmsL: number;
  rmsR: number;
  rmsM: number;
  mode: number;
  img: HTMLImageElement | null;
  shader: AsaShader;
};

class AsaVis {
  private data: AsaVisData | null = null;
  private el: AsaElements;
  private shadersEnabled: boolean = true;
  private shaderUpdateIntervalId: number | null = null;
  private shaderUpdataIntervalRunning: boolean = false;
  // Visualization modes configuration
  private modeMap = [
    { fftSize: 32, shader: shaders.nothing },
    { fftSize: 2048, shader: shaders.spectrumAnalyzer },
    { fftSize: 32, shader: shaders.stereoCAHalf },
  ];
  constructor(el: AsaElements) {
    this.el = el;
  }
  // Simple error handler
  private error(msg: string): never {
    throw new Error(`Asa Player Error: ${msg}`);
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
    if (this.data && this.data.audioCtx && this.data.mediaSourceNode) {
      audioCtx = this.data.audioCtx;
      source = this.data.mediaSourceNode;
      // Disconnect existing connections to reconfigure
      source.disconnect();
    }
    else {
      // Close old context if it exists
      if (this.data && this.data.audioCtx) {
        this.data.audioCtx.close();
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
    const mode = this.data?.mode ?? 0;// 0 is none
    this.data = {
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
      dataArrayL: new Uint8Array(bufferLength),
      dataArrayR: new Uint8Array(bufferLength),
      dataArrayM: new Uint8Array(bufferLength),
      rmsL: 0,
      rmsR: 0,
      rmsM: 0,
      mode: mode,
      img: this.data?.img ?? new Image(), // Will be set later
      shader: shaders.shader0!,
    };

    // Resume audio context on play
    this.el.audioPlayer.onplay = () => {
      audioCtx.resume();
      this.draw();
    };

    // Prepare fullscreen triangle buffer
    const positions = new Float32Array([
      -1, -1,
      3, -1,
      -1, 3,
    ]);
    const gl = this.data.ctx;
    if (!gl) this.error("WebGL context not initialized");
    this.data.drawBuf = this.data.drawBuf || gl.createBuffer();
    const buf = this.data.drawBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);

    // Create default 1x1 white texture to avoid null texture issues
    if (ctx) {
      this.data.albumImageTexture = ctx.createTexture();
      ctx.bindTexture(ctx.TEXTURE_2D, this.data.albumImageTexture);
      const defaultPixel = new Uint8Array([255, 255, 255, 255]); // White pixel
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, defaultPixel);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
    }
  }
  // Update visualization mode
  // Compiles and sets the appropriate shader program
  private updateVisMode(): void {
    if (!this.data) this.error("Visualization context not initialized");
    const gl = this.data.ctx;
    if (!gl) this.error("WebGL context not initialized");
    // Clear the existing program
    if (this.data.drawProgram) {
      gl.deleteProgram(this.data.drawProgram);
      gl.deleteBuffer(this.data.drawBuf);
      gl.deleteShader;
      this.data.drawProgram = null;
    }
    const cfg = this.modeMap[this.data.mode] ?? this.modeMap[0];
    if (!cfg) this.error("Invalid visualization mode configuration");
    if (cfg.fftSize) this.setupVisContext(cfg!.fftSize);
    if (!cfg.shader) this.error("Shader configuration missing");
    this.data.shader = cfg.shader;
    const { vsSource, fsSource } = this.data.shader;
    // Replace aIndex with aPosition in shader sources if needed
    const patchedVsSource = vsSource.replace(/attribute\s+float\s+aIndex;/, 'attribute vec2 aPosition;');
    this.data.shader.vsSource = patchedVsSource;
    const vs = this.compileShader(gl.VERTEX_SHADER, this.data.shader.vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) this.error("Failed to compile shaders");
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.data.drawProgram = prog;
    this.data.drawLocs = {
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
  // Update audio data uniforms
  private updateShaderData(): void {
    if (!this.shadersEnabled) return;
    if (!this.data) this.error("Visualization context not initialized");
    // if (this.vis.mode === 0) return; // No visualization
    this.data.analyserL.getByteFrequencyData(this.data.dataArrayL);
    this.data.analyserR.getByteFrequencyData(this.data.dataArrayR);
    // Merge left and right channels for mono data
    if (this.data) {
      for (let i = 0; i < this.data.bufferLength; i++) {
        const l = this.data.dataArrayL[i] || 0;
        const r = this.data.dataArrayR[i] || 0;
        this.data.dataArrayM[i] = (l + r) / 2;
      }
    }
    const timeDomainDataL = new Uint8Array(this.data.bufferLength);
    const timeDomainDataR = new Uint8Array(this.data.bufferLength);
    this.data.analyserL.getByteTimeDomainData(timeDomainDataL);
    this.data.analyserR.getByteTimeDomainData(timeDomainDataR);
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
    this.data.rmsL = this.data.rmsL * (1 - alpha) + rmsLRaw * alpha;
    this.data.rmsR = this.data.rmsR * (1 - alpha) + rmsRRaw * alpha;
    this.data.rmsM = this.data.rmsM * (1 - alpha) + rmsMRaw * alpha;
  }
  // Update album image texture
  // Image size might not be power of 2, so set parameters accordingly
  private updateShaderTexture(): void {
    if (!this.data) this.error("Visualization context not initialized");
    if (!this.data.img) this.error("Album image not initialized");
    const gl = this.data.ctx;
    if (!gl) this.error("WebGL context not initialized");
    console.log("Album image loaded, updating texture");
    // Create or update texture with correct parameters for NPOT images
    const isPowerOf2 = (value: number) => (value & (value - 1)) === 0;
    const img = this.data.img;
    this.data.albumImageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.data.albumImageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    if (isPowerOf2(img.width) && isPowerOf2(img.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  // Compile a shader from source
  private compileShader(type: number, src: string): WebGLShader | null {
    if (!this.data) this.error("Visualization context not initialized");
    if (!this.data.ctx) this.error("WebGL context not initialized");
    const gl = this.data.ctx;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }
  // Main draw loop
  // Called via requestAnimationFrame
  // TODO: The uniforms should only be updated about 60 times per second
  // Move the updates out of the draw loop and call them on a timer instead
  private draw(): void {
    if (!this.shadersEnabled) return;
    if (!this.data) this.error("Visualization context not initialized");
    // Update audio data
    requestAnimationFrame(this.draw.bind(this));

    // Gl draw routine
    const gl = this.data.ctx;
    if (!gl) this.error("WebGL context not initialized");
    if (!this.el.albumImage) this.error("Album image canvas not initialized");
    const bufferLength = this.data.bufferLength;
    const locs = this.data.drawLocs;
    gl.useProgram(this.data.drawProgram);
    // Set uniforms
    gl.uniform1f(locs.uWidth, this.el.albumImage.width);
    gl.uniform1f(locs.uHeight, this.el.albumImage.height);
    gl.uniform1f(locs.uBufferLength, bufferLength);
    gl.uniform1f(locs.uRMSM, this.data.rmsM);
    gl.uniform1f(locs.uRMSL, this.data.rmsL);
    gl.uniform1f(locs.uRMSR, this.data.rmsR);
    // Set analyser data uniforms
    gl.activeTexture(gl.TEXTURE1);
    const analyserLTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserLTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.data.dataArrayL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserL, 1); // Texture unit 1

    gl.activeTexture(gl.TEXTURE2);
    const analyserRTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserRTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.data.dataArrayR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserR, 2); // Texture unit 2

    gl.activeTexture(gl.TEXTURE3);
    const analyserMTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analyserMTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.data.dataArrayM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(locs.uAnalyserM, 3); // Texture unit 3

    // Set album image uniform
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(locs.uAlbumImage, 0); // Texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.data.albumImageTexture);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aPosition = this.data.drawLocs.aPosition;
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(aPosition);
    gl.useProgram(null);
  }
  public changeVisMode(): void {
    if (!this.data) this.error("Visualization context not initialized");
    this.data.mode += 1;
    this.data.mode = this.data.mode % this.modeMap.length;
    console.log(`Visualization mode changed to ${this.data.mode}`);
    this.updateVisMode();
  }
  public setupVisImg(): void {
    if (!this.data) this.error("Visualization context not initialized");
    if (this.data.img) {
      console.log("Setting album image source");
      this.data.img.onload = () => {
        this.updateShaderTexture();
      };
    }
  }
  public setVisImg(imgSrc: string): void {
    if (!this.data) this.error("Visualization context not initialized");
    if (this.data.img) {
      console.log("Loading album image from source:", imgSrc);
      this.data.img.src = imgSrc;
    }
  }
  public clearContext(): void {
    if (this.data && this.data.audioCtx) {
      this.data.audioCtx.close();
      this.data = null;
    }
  }
  public getVisMode(): number {
    if (!this.data) this.error("Visualization context not initialized");
    return this.data.mode;
  }
  public setVisMode(mode: number): void {
    if (!this.data) this.error("Visualization context not initialized");
    if (mode < 0 || mode >= this.modeMap.length) this.error("Invalid visualization mode");
    this.data.mode = mode;
    this.updateVisMode();
  }
  public init(): void {
    this.setupVisContext();
    this.updateVisMode();
    // Start the uniform update interval
    // If we updates the data directly in the draw loop,
    // it will run at the monitor refresh rate
    // This can be a LOT of updates on high refresh rate monitors
    if (!this.data) this.error("Visualization context not initialized");
    // NOTE: A valid intervalId is never 0
    if (this.shaderUpdateIntervalId) {
      console.log("Clearing existing visualization interval", this.shaderUpdateIntervalId);
      clearInterval(this.shaderUpdateIntervalId);
      this.shaderUpdataIntervalRunning = false;
    }
    const fps = 30;
    console.log("Starting visualization interval");
    this.shaderUpdateIntervalId = setInterval(() => {
      // Use a flag to make sure updates dont overlap
      // if the browser lags
      if (this.shaderUpdataIntervalRunning) return;
      this.shaderUpdataIntervalRunning = true;
      this.updateShaderData();
      this.shaderUpdataIntervalRunning = false;
    }, 1000 / fps);
    console.log("Visualization interval ID:", this.shaderUpdateIntervalId);
  }
}

export default AsaVis;
