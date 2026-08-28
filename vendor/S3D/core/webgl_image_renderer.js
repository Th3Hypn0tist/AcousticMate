import { WebGLBatchRenderer } from './webgl_batch_renderer.js';

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'image shader compile failed');
  return shader;
}

function program(gl, vertex, fragment) {
  const value = gl.createProgram();
  gl.attachShader(value, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(value, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(value);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value) || 'image program link failed');
  return value;
}

const IMAGE_VS = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec2 inputUv;
uniform mat4 vp;
out vec2 uv;
void main(){ uv=inputUv; gl_Position=vp*vec4(position,1.0); }`;

const IMAGE_FS = `#version 300 es
precision highp float;
uniform sampler2D imageTexture;
uniform float opacity;
in vec2 uv;
out vec4 outColor;
void main(){ vec4 value=texture(imageTexture,uv); outColor=vec4(value.rgb,value.a*opacity); }`;

function sourceDimensions(source) {
  const width = Number(source?.naturalWidth ?? source?.videoWidth ?? source?.width ?? 0);
  const height = Number(source?.naturalHeight ?? source?.videoHeight ?? source?.height ?? 0);
  return width > 0 && height > 0 ? [width, height] : null;
}

class WebGLImageRenderer extends WebGLBatchRenderer {
  constructor(gl) {
    super(gl);
    this.imageProgram = program(gl, IMAGE_VS, IMAGE_FS);
    this.imageVao = gl.createVertexArray();
    this.imageBuffer = gl.createBuffer();
    this.imageQueue = [];
    this.imageCache = new Map();
    this.protectedBoxQueue = [];
    this.stats.protectedBoxes = 0;
    gl.bindVertexArray(this.imageVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.imageBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
    gl.bindVertexArray(null);
  }

  begin(viewProjection) {
    super.begin(viewProjection);
    this.imageQueue.length = 0;
    this.protectedBoxQueue.length = 0;
    this.stats.protectedBoxes = 0;
  }

  box(position, scale, color, outline = false, source = null) {
    if (!outline && source?.protectFromTransparency === true) {
      this.protectedBoxQueue.push(
        Number(position[0]), Number(position[1]), Number(position[2]),
        Number(scale[0]), Number(scale[1]), Number(scale[2]),
        Number(color[0]), Number(color[1]), Number(color[2]),
        1,
      );
      this.stats.protectedBoxes += 1;
      return;
    }
    super.box(position, scale, color, outline);
  }

  imagePlane(image, transform = {}) {
    if (!image) return;
    this.imageQueue.push({
      image,
      position: [...(transform.position ?? [0, 0])],
      rotation: Number(transform.rotation ?? 0),
      scale: [...(transform.scale ?? [1, 1])],
      y: Number(transform.y ?? .002),
      opacity: Math.max(0, Math.min(1, Number(transform.opacity ?? 1))),
    });
  }

  resolveImage(source) {
    let entry = this.imageCache.get(source);
    if (entry) return entry;
    entry = { source: null, texture: null, ready: false, loading: true, failed: false };
    this.imageCache.set(source, entry);
    const finish = resolved => {
      if (!resolved || !sourceDimensions(resolved)) { entry.failed = true; entry.loading = false; return; }
      entry.source = resolved;
      entry.loading = false;
      entry.ready = true;
    };
    if (sourceDimensions(source)) {
      finish(source);
    } else if (typeof Blob !== 'undefined' && source instanceof Blob && typeof createImageBitmap === 'function') {
      createImageBitmap(source).then(finish).catch(() => { entry.failed = true; entry.loading = false; });
    } else if (typeof source === 'string' || (typeof URL !== 'undefined' && source instanceof URL)) {
      const image = new Image();
      image.onload = () => finish(image);
      image.onerror = () => { entry.failed = true; entry.loading = false; };
      image.src = String(source);
    } else {
      entry.failed = true;
      entry.loading = false;
    }
    return entry;
  }

  textureFor(entry) {
    if (entry.texture || !entry.ready) return entry.texture;
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    entry.texture = texture;
    return texture;
  }

  verticesFor(item, source) {
    const [width, height] = sourceDimensions(source);
    const sx = Number(item.scale[0]);
    const sz = Number(item.scale[1]);
    const c = Math.cos(item.rotation);
    const s = Math.sin(item.rotation);
    const local = (x, z) => [
      item.position[0] + x * sx * c - z * sz * s,
      item.y,
      item.position[1] + x * sx * s + z * sz * c,
    ];
    const p00 = local(0, 0);
    const p10 = local(width, 0);
    const p01 = local(0, height);
    const p11 = local(width, height);
    return new Float32Array([
      ...p00, 0, 0,
      ...p10, 1, 0,
      ...p01, 0, 1,
      ...p11, 1, 1,
    ]);
  }

  drawImagePlanes(vp) {
    if (!this.imageQueue.length) return;
    const gl = this.gl;
    gl.useProgram(this.imageProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.imageProgram, 'vp'), false, new Float32Array(vp));
    gl.uniform1i(gl.getUniformLocation(this.imageProgram, 'imageTexture'), 0);
    gl.bindVertexArray(this.imageVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const item of this.imageQueue) {
      const entry = this.resolveImage(item.image);
      const texture = this.textureFor(entry);
      if (!texture) continue;
      const vertices = this.verticesFor(item, entry.source);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.imageBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1f(gl.getUniformLocation(this.imageProgram, 'opacity'), item.opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.stats.drawCalls += 1;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawProtectedBoxes(vp) {
    const count = this.protectedBoxQueue.length / 10;
    if (!count) return;
    this.drawBoxes(new Float32Array(this.protectedBoxQueue), count, false, vp, false);
  }

  flush(cameraRight, cameraUp, nowSeconds = performance.now() / 1000) {
    const snapshot = this.store.snapshot();
    const gl = this.gl;
    this.drawImagePlanes(snapshot.viewProjection);
    this.drawLines(snapshot.lines, snapshot.counts.lineVertices, snapshot.viewProjection);
    this.drawBoxes(snapshot.solidBoxes, snapshot.counts.solidBoxes, false, snapshot.viewProjection);
    this.drawBoxes(snapshot.transparentBoxes, snapshot.counts.transparentBoxes, false, snapshot.viewProjection, true);
    this.drawProtectedBoxes(snapshot.viewProjection);
    this.drawBoxes(snapshot.outlineBoxes, snapshot.counts.outlineBoxes, true, snapshot.viewProjection);
    this.drawFlow(snapshot.flowPulses, snapshot.counts.flowPulses, snapshot.viewProjection, nowSeconds);
    this.drawText(snapshot.glyphs, snapshot.counts.glyphs, snapshot.viewProjection, cameraRight, cameraUp);
    gl.bindVertexArray(null);
    Object.assign(this.stats, snapshot.counts);
    return { ...this.stats };
  }
}

export { WebGLImageRenderer, sourceDimensions };
