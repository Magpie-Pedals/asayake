import type { AsaShader } from "./asa";
export const shaders: { [key: string]: AsaShader } = {};

const vertexShaderSource = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

shaders.nothing = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
void main() {
  gl_FragColor = vec4(0, 0, 0, 0);
}
`
};
shaders.imgTest = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform sampler2D uAlbumImage;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  gl_FragColor = texture2D(uAlbumImage, uv);
}
`
}
shaders.stereoBars = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform float uRMSL;
uniform float uRMSR;
void main() {
  float alpha = 0.0;
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  if (uv.x < 0.5) {
    if (uRMSL < uv.y) {
      gl_FragColor = vec4(1, 1, 1, alpha);
    } else {
      gl_FragColor = vec4(0, 0, 0, 0);
    }
  }
  else {
    if (uRMSR < uv.y) {
      gl_FragColor = vec4(1, 1, 1, alpha);
    } else {
      gl_FragColor = vec4(0, 0, 0, 0);
    }
  }
}
`
}
shaders.stereoColor = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform float uRMSL;
uniform float uRMSR;
uniform sampler2D uAlbumImage;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  vec4 img = texture2D(uAlbumImage, uv);
  img.r *= uRMSL;
  img.b *= uRMSR;
  gl_FragColor = vec4(img.rgb, 1.0);
}
`
}
shaders.stereoCASmall = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform float uRMSM;
uniform sampler2D uAlbumImage;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  vec2 center = vec2(0.5, 0.5);
  vec2 toCenter = uv - center;
  float dist = length(toCenter);

  // Chromatic aberration strength increases towards edges
  float maxShift = uRMSM * 0.1; // tweak for effect strength
  vec2 shift = normalize(toCenter) * dist * maxShift;

  // Shift channels in opposite directions
  float r = texture2D(uAlbumImage, uv + shift).r;
  float g = texture2D(uAlbumImage, uv).g;
  float b = texture2D(uAlbumImage, uv - shift).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`
}
shaders.stereoCAHalf = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform float uRMSM;
uniform sampler2D uAlbumImage;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  vec2 center = vec2(0.5, 0.5);
  vec2 toCenter = uv - center;
  float dist = length(toCenter);

  // Chromatic aberration strength increases towards edges
  float maxShift = uRMSM * 0.5; // tweak for effect strength
  vec2 shift = normalize(toCenter) * dist * maxShift;

  // Shift channels in opposite directions
  float r = texture2D(uAlbumImage, uv + shift).r;
  float g = texture2D(uAlbumImage, uv).g;
  float b = texture2D(uAlbumImage, uv - shift).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`
}
shaders.stereoCAFull = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform float uRMSM;
uniform sampler2D uAlbumImage;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  vec2 center = vec2(0.5, 0.5);
  vec2 toCenter = uv - center;
  float dist = length(toCenter);

  // Chromatic aberration strength increases towards edges
  float maxShift = uRMSM; // tweak for effect strength
  vec2 shift = normalize(toCenter) * dist * maxShift;

  // Shift channels in opposite directions
  float r = texture2D(uAlbumImage, uv + shift).r;
  float g = texture2D(uAlbumImage, uv).g;
  float b = texture2D(uAlbumImage, uv - shift).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`
}
shaders.spectrumAnalyzerSimple = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform sampler2D uAnalyserM;

void main() {
  gl_FragColor = vec4(0, 0, 0, 0);
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  float index = floor(uv.x * uWidth);
  float magnitude = texture2D(uAnalyserM, vec2(index / uWidth, 0.0)).r;
  if (magnitude > uv.y) {
    gl_FragColor = vec4(1, 1, 1, 1);
  }
}
`
};
shaders.spectrumAnalyzer = {
  vsSource: vertexShaderSource,
  fsSource: `
precision mediump float;
uniform float uWidth;
uniform float uHeight;
uniform sampler2D uAnalyserM;
uniform sampler2D uAlbumImage;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(uWidth, uHeight);
  vec4 col = texture2D(uAlbumImage, uv);
  float index = floor(uv.x * uWidth);
  float magnitude = texture2D(uAnalyserM, vec2(index / uWidth, 0.0)).r;
  if (magnitude > uv.y) {
    col = col.gbra;
    col *= 1.5;
  }
  gl_FragColor = col;
}
`
};
