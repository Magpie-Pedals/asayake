import type { AsaShader } from "./asa";
export const shaders: { [key: string]: AsaShader } = {};
shaders.shader0 = {
  vsSource: `
attribute float aIndex;
uniform float uBufferLength;
void main() {
  float x = -1.0 + 2.0 * (aIndex / (uBufferLength - 1.0));
  float y = 0.0;
  gl_Position = vec4(x, y, 0, 1);
  gl_PointSize = 10000.0; // Large enough to cover the viewport
}
`,
  fsSource: `
precision mediump float;
void main() {
  gl_FragColor = vec4(0, 0, 0, 0);
}
`
};
shaders.shader1 = {
  vsSource: `
attribute float aIndex;
uniform float uBufferLength;
void main() {
  float x = -1.0 + 2.0 * (aIndex / (uBufferLength - 1.0));
  float y = 0.0;
  gl_Position = vec4(x, y, 0, 1);
  gl_PointSize = 10000.0; // Large enough to cover the viewport
}
`,
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
shaders.shader2 = {
  vsSource: `
attribute float aIndex;
uniform float uBufferLength;
void main() {
  float x = -1.0 + 2.0 * (aIndex / (uBufferLength - 1.0));
  float y = 0.0;
  gl_Position = vec4(x, y, 0, 1);
  gl_PointSize = 10000.0; // Large enough to cover the viewport
}
`,
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
shaders.shader3 = {
  vsSource: `
attribute float aIndex;
uniform float uBufferLength;
void main() {
  float x = -1.0 + 2.0 * (aIndex / (uBufferLength - 1.0));
  float y = 0.0;
  gl_Position = vec4(x, y, 0, 1);
  gl_PointSize = 10000.0; // Large enough to cover the viewport
}
`,
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
