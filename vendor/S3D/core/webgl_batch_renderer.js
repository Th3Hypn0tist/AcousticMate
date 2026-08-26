// WebGL2-first batched renderer for S3D RenderStore.
// Boxes use shared cube geometry + instancing, links use one packed line draw,
// link flow is shader-driven, and text uses a shared glyph atlas + instanced quads.
import { RenderStore } from './render_store.js';

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
  return shader;
}

function makeProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  return program;
}

const BOX_VS = `#version 300 es
layout(location=0) in vec3 p;
layout(location=1) in vec3 instancePosition;
layout(location=2) in vec3 instanceScale;
layout(location=3) in vec3 instanceColor;
uniform mat4 vp;
out vec3 color;
void main(){ color=instanceColor; gl_Position=vp*vec4(instancePosition+p*instanceScale,1.0); }`;

const FLOW_VS = `#version 300 es
layout(location=0) in vec3 p;
layout(location=1) in vec3 flowStart;
layout(location=2) in vec3 flowEnd;
layout(location=3) in vec3 flowScale;
layout(location=4) in vec3 flowColor;
layout(location=5) in vec2 flowState;
uniform mat4 vp;
uniform float timeSeconds;
out vec3 color;
void main(){
  float progress=fract(flowState.x + timeSeconds * flowState.y);
  vec3 center=mix(flowStart,flowEnd,progress);
  color=flowColor;
  gl_Position=vp*vec4(center+p*flowScale,1.0);
}`;

const COLOR_FS = `#version 300 es
precision highp float;
in vec3 color;
out vec4 outColor;
void main(){ outColor=vec4(color,1.0); }`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 p;
layout(location=1) in vec3 inputColor;
uniform mat4 vp;
out vec3 color;
void main(){ color=inputColor; gl_Position=vp*vec4(p,1.0); }`;

const TEXT_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 center;
layout(location=2) in vec2 size;
layout(location=3) in vec4 uvRect;
layout(location=4) in vec3 inputColor;
layout(location=5) in float baselineOffset;
layout(location=6) in float billboard;
uniform mat4 vp;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
out vec2 uv;
out vec3 color;
void main(){
  vec3 textRight=mix(vec3(1.0,0.0,0.0),cameraRight,billboard);
  vec3 textUp=mix(vec3(0.0,1.0,0.0),cameraUp,billboard);
  vec3 world=center
    + textRight*(baselineOffset + corner.x*size.x)
    + textUp*(corner.y*size.y);
  uv=mix(uvRect.xy,uvRect.zw,corner*.5+.5);
  color=inputColor;
  gl_Position=vp*vec4(world,1.0);
}`;

const TEXT_FS = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec2 uv;
in vec3 color;
out vec4 outColor;
void main(){ float a=texture(atlas,uv).a; if(a<.025) discard; outColor=vec4(color,a); }`;

class GlyphAtlas {
  constructor(gl) {
    this.gl = gl;
    this.cols = 16;
    this.rows = 8;
    this.cellW = 64;
    this.cellH = 80;
    this.first = 32;
    this.last = 126;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols * this.cellW;
    this.canvas.height = this.rows * this.cellH;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '700 48px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let code = this.first; code <= this.last; code++) {
      const index = code - this.first;
      const col = index % this.cols;
      const row = Math.floor(index / this.cols);
      ctx.fillText(String.fromCharCode(code), col * this.cellW + this.cellW / 2, row * this.cellH + this.cellH / 2);
    }
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
  }
  uv(character) {
    let code = String(character || '?').charCodeAt(0);
    if (code < this.first || code > this.last) code = 63;
    const index = code - this.first;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const u0 = col / this.cols;
    const u1 = (col + 1) / this.cols;
    const vTop = row / this.rows;
    const vBottom = (row + 1) / this.rows;
    return [u0, vBottom, u1, vTop];
  }
}

class WebGLBatchRenderer {
  constructor(gl) {
    if (!gl) throw new Error('WebGLBatchRenderer requires WebGL2 context');
    this.gl = gl;
    this.store = new RenderStore();
    this.boxProgram = makeProgram(gl, BOX_VS, COLOR_FS);
    this.flowProgram = makeProgram(gl, FLOW_VS, COLOR_FS);
    this.lineProgram = makeProgram(gl, LINE_VS, COLOR_FS);
    this.textProgram = makeProgram(gl, TEXT_VS, TEXT_FS);
    this.atlas = new GlyphAtlas(gl);
    this.stats = { drawCalls: 0, uploads: 0, uploadBytes: 0, solidBoxes: 0, outlineBoxes: 0, lineVertices: 0, glyphs: 0, flowPulses: 0 };
    this._persistentUniforms = null;
    this._persistentBuffers = null;
    this._persistentCounts = { solidBoxes: 0, outlineBoxes: 0, lineVertices: 0, glyphs: 0, flowPulses: 0 };
    this._persistentResident = false;
    this.initBoxes();
    this.initFlow();
    this.initLines();
    this.initText();
  }

  initBoxes() {
    const gl = this.gl;
    this.boxVao = gl.createVertexArray();
    this.boxVertexBuffer = gl.createBuffer();
    this.boxInstanceBuffer = gl.createBuffer();
    this.boxFaceIndexBuffer = gl.createBuffer();
    this.boxEdgeIndexBuffer = gl.createBuffer();
    this.boxVertices = new Float32Array([-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1]);
    this.boxFaces = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,0,1,5,0,5,4,3,7,6,3,6,2]);
    this.boxEdges = new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]);
    gl.bindVertexArray(this.boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.boxVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxInstanceBuffer);
    const stride = 9 * 4;
    for (let attr = 1; attr <= 3; attr++) {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, stride, (attr - 1) * 3 * 4);
      gl.vertexAttribDivisor(attr, 1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxFaceIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.boxFaces, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxEdgeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.boxEdges, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  initFlow() {
    const gl = this.gl;
    this.flowVao = gl.createVertexArray();
    this.flowVertexBuffer = gl.createBuffer();
    this.flowInstanceBuffer = gl.createBuffer();
    gl.bindVertexArray(this.flowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flowVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.boxVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flowInstanceBuffer);
    const stride = 14 * 4;
    const spec = [[1,3,0],[2,3,3],[3,3,6],[4,3,9],[5,2,12]];
    for (const [attr,size,offset] of spec) {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(attr, 1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxFaceIndexBuffer);
    gl.bindVertexArray(null);
  }

  initLines() {
    const gl = this.gl;
    this.lineVao = gl.createVertexArray();
    this.lineBuffer = gl.createBuffer();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
    gl.bindVertexArray(null);
  }

  initText() {
    const gl = this.gl;
    this.textVao = gl.createVertexArray();
    this.textCornerBuffer = gl.createBuffer();
    this.textInstanceBuffer = gl.createBuffer();
    gl.bindVertexArray(this.textVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textCornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textInstanceBuffer);
    const stride = 14 * 4;
    const spec = [[1,3,0],[2,2,3],[3,4,5],[4,3,9],[5,1,12],[6,1,13]];
    for (const [attr, size, offset] of spec) {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(attr, 1);
    }
    gl.bindVertexArray(null);
  }

  begin(viewProjection) {
    this.store.begin(viewProjection);
    this.stats.drawCalls = 0;
    this.stats.uploads = 0;
    this.stats.uploadBytes = 0;
  }
  box(position, scale, color, outline = false) { this.store.box(position, scale, color, outline); }
  line(start, end, color) { this.store.line(start, end, color); }
  flow(start, end, scale, color, phase = 0, speed = 0) { this.store.flow(start, end, scale, color, phase, speed); }
  text(text, center, width, height, color) {
    this.queueText(text, center, width, height, color, false);
  }
  billboardText(text, center, width, height, color) {
    this.queueText(text, center, width, height, color, true);
  }
  queueText(text, center, width, height, color, billboard) {
    const value = String(text ?? '');
    if (!value.length || width <= 0 || height <= 0) return;
    const clipped = value.length > 36 ? `${value.slice(0, 33)}...` : value;
    const charWidth = width / Math.max(1, clipped.length);
    const start = -(clipped.length - 1) * charWidth * .5;
    for (let index = 0; index < clipped.length; index++) {
      const uv = this.atlas.uv(clipped[index]);
      this.store.glyph(center, [charWidth * .52, height * .5], uv, color, start + index * charWidth, billboard);
    }
  }

  upload(buffer, data, usage = this.gl.DYNAMIC_DRAW) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    this.stats.uploads += 1;
    this.stats.uploadBytes += data.byteLength;
  }

  drawBoxes(data, count, outline, vp) {
    if (!count) return;
    const gl = this.gl;
    gl.useProgram(this.boxProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.boxProgram, 'vp'), false, new Float32Array(vp));
    gl.bindVertexArray(this.boxVao);
    this.upload(this.boxInstanceBuffer, data);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, outline ? this.boxEdgeIndexBuffer : this.boxFaceIndexBuffer);
    gl.drawElementsInstanced(outline ? gl.LINES : gl.TRIANGLES, outline ? this.boxEdges.length : this.boxFaces.length, gl.UNSIGNED_SHORT, 0, count);
    this.stats.drawCalls += 1;
  }

  drawFlow(data, count, vp, nowSeconds) {
    if (!count) return;
    const gl = this.gl;
    gl.useProgram(this.flowProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.flowProgram, 'vp'), false, new Float32Array(vp));
    gl.uniform1f(gl.getUniformLocation(this.flowProgram, 'timeSeconds'), nowSeconds);
    gl.bindVertexArray(this.flowVao);
    this.upload(this.flowInstanceBuffer, data);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxFaceIndexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLES, this.boxFaces.length, gl.UNSIGNED_SHORT, 0, count);
    this.stats.drawCalls += 1;
  }

  drawLines(data, vertexCount, vp) {
    if (!vertexCount) return;
    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, 'vp'), false, new Float32Array(vp));
    gl.bindVertexArray(this.lineVao);
    this.upload(this.lineBuffer, data);
    gl.drawArrays(gl.LINES, 0, vertexCount);
    this.stats.drawCalls += 1;
  }

  drawText(data, count, vp, cameraRight, cameraUp) {
    if (!count) return;
    const gl = this.gl;
    gl.useProgram(this.textProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.textProgram, 'vp'), false, new Float32Array(vp));
    gl.uniform3fv(gl.getUniformLocation(this.textProgram, 'cameraRight'), cameraRight);
    gl.uniform3fv(gl.getUniformLocation(this.textProgram, 'cameraUp'), cameraUp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
    gl.uniform1i(gl.getUniformLocation(this.textProgram, 'atlas'), 0);
    gl.bindVertexArray(this.textVao);
    this.upload(this.textInstanceBuffer, data);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.disable(gl.BLEND);
    this.stats.drawCalls += 1;
  }

  flush(cameraRight, cameraUp, nowSeconds = performance.now() / 1000) {
    const snapshot = this.store.snapshot();
    const gl = this.gl;
    this.drawLines(snapshot.lines, snapshot.counts.lineVertices, snapshot.viewProjection);
    this.drawBoxes(snapshot.solidBoxes, snapshot.counts.solidBoxes, false, snapshot.viewProjection);
    this.drawBoxes(snapshot.outlineBoxes, snapshot.counts.outlineBoxes, true, snapshot.viewProjection);
    this.drawFlow(snapshot.flowPulses, snapshot.counts.flowPulses, snapshot.viewProjection, nowSeconds);
    this.drawText(snapshot.glyphs, snapshot.counts.glyphs, snapshot.viewProjection, cameraRight, cameraUp);
    gl.bindVertexArray(null);
    Object.assign(this.stats, snapshot.counts);
    return { ...this.stats };
  }

  persistentUniforms() {
    if (this._persistentUniforms) return this._persistentUniforms;
    const gl = this.gl;
    this._persistentUniforms = {
      boxVp: gl.getUniformLocation(this.boxProgram, 'vp'),
      lineVp: gl.getUniformLocation(this.lineProgram, 'vp'),
      flowVp: gl.getUniformLocation(this.flowProgram, 'vp'),
      flowTime: gl.getUniformLocation(this.flowProgram, 'timeSeconds'),
      textVp: gl.getUniformLocation(this.textProgram, 'vp'),
      textRight: gl.getUniformLocation(this.textProgram, 'cameraRight'),
      textUp: gl.getUniformLocation(this.textProgram, 'cameraUp'),
      textAtlas: gl.getUniformLocation(this.textProgram, 'atlas'),
    };
    return this._persistentUniforms;
  }

  persistentBuffers() {
    if (this._persistentBuffers) return this._persistentBuffers;
    const gl = this.gl;
    this._persistentBuffers = { solidBoxes: gl.createBuffer(), outlineBoxes: gl.createBuffer() };
    return this._persistentBuffers;
  }

  bindBoxInstances(instanceBuffer) {
    const gl = this.gl;
    gl.bindVertexArray(this.boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    const stride = 9 * 4;
    for (let attr = 1; attr <= 3; attr++) {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, stride, (attr - 1) * 3 * 4);
      gl.vertexAttribDivisor(attr, 1);
    }
  }

  commitPersistent() {
    const snapshot = this.store.snapshot();
    const buffers = this.persistentBuffers();
    this.stats.uploads = 0;
    this.stats.uploadBytes = 0;
    if (snapshot.counts.solidBoxes) this.upload(buffers.solidBoxes, snapshot.solidBoxes, this.gl.STATIC_DRAW);
    if (snapshot.counts.outlineBoxes) this.upload(buffers.outlineBoxes, snapshot.outlineBoxes, this.gl.STATIC_DRAW);
    if (snapshot.counts.lineVertices) this.upload(this.lineBuffer, snapshot.lines, this.gl.STATIC_DRAW);
    if (snapshot.counts.flowPulses) this.upload(this.flowInstanceBuffer, snapshot.flowPulses, this.gl.STATIC_DRAW);
    if (snapshot.counts.glyphs) this.upload(this.textInstanceBuffer, snapshot.glyphs, this.gl.STATIC_DRAW);
    this._persistentCounts = { ...snapshot.counts };
    this._persistentResident = true;
    Object.assign(this.stats, snapshot.counts);
    return { uploads: this.stats.uploads, uploadBytes: this.stats.uploadBytes, counts: { ...this._persistentCounts } };
  }

  drawPersistent(viewProjection, cameraRight, cameraUp, nowSeconds = performance.now() / 1000) {
    if (!this._persistentResident) throw new Error('drawPersistent requires commitPersistent() first');
    const gl = this.gl;
    const loc = this.persistentUniforms();
    const buffers = this.persistentBuffers();
    const counts = this._persistentCounts;
    this.stats.drawCalls = 0;
    this.stats.uploads = 0;
    this.stats.uploadBytes = 0;

    if (counts.lineVertices) {
      gl.useProgram(this.lineProgram);
      gl.uniformMatrix4fv(loc.lineVp, false, new Float32Array(viewProjection));
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, counts.lineVertices);
      this.stats.drawCalls += 1;
    }
    if (counts.solidBoxes) {
      gl.useProgram(this.boxProgram);
      gl.uniformMatrix4fv(loc.boxVp, false, new Float32Array(viewProjection));
      this.bindBoxInstances(buffers.solidBoxes);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxFaceIndexBuffer);
      gl.drawElementsInstanced(gl.TRIANGLES, this.boxFaces.length, gl.UNSIGNED_SHORT, 0, counts.solidBoxes);
      this.stats.drawCalls += 1;
    }
    if (counts.outlineBoxes) {
      gl.useProgram(this.boxProgram);
      gl.uniformMatrix4fv(loc.boxVp, false, new Float32Array(viewProjection));
      this.bindBoxInstances(buffers.outlineBoxes);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxEdgeIndexBuffer);
      gl.drawElementsInstanced(gl.LINES, this.boxEdges.length, gl.UNSIGNED_SHORT, 0, counts.outlineBoxes);
      this.stats.drawCalls += 1;
    }
    if (counts.flowPulses) {
      gl.useProgram(this.flowProgram);
      gl.uniformMatrix4fv(loc.flowVp, false, new Float32Array(viewProjection));
      gl.uniform1f(loc.flowTime, nowSeconds);
      gl.bindVertexArray(this.flowVao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boxFaceIndexBuffer);
      gl.drawElementsInstanced(gl.TRIANGLES, this.boxFaces.length, gl.UNSIGNED_SHORT, 0, counts.flowPulses);
      this.stats.drawCalls += 1;
    }
    if (counts.glyphs) {
      gl.useProgram(this.textProgram);
      gl.uniformMatrix4fv(loc.textVp, false, new Float32Array(viewProjection));
      gl.uniform3fv(loc.textRight, cameraRight);
      gl.uniform3fv(loc.textUp, cameraUp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
      gl.uniform1i(loc.textAtlas, 0);
      gl.bindVertexArray(this.textVao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, counts.glyphs);
      gl.disable(gl.BLEND);
      this.stats.drawCalls += 1;
    }
    gl.bindVertexArray(null);
    Object.assign(this.stats, counts);
    return { ...this.stats };
  }

  flushPersistent(cameraRight, cameraUp, nowSeconds = performance.now() / 1000) {
    const snapshot = this.store.snapshot();
    const committed = this.commitPersistent();
    const drawn = this.drawPersistent(snapshot.viewProjection, cameraRight, cameraUp, nowSeconds);
    drawn.uploads = committed.uploads;
    drawn.uploadBytes = committed.uploadBytes;
    this.stats.uploads = committed.uploads;
    this.stats.uploadBytes = committed.uploadBytes;
    return drawn;
  }

  invalidatePersistent() { this._persistentResident = false; }
}

export { GlyphAtlas, WebGLBatchRenderer };
