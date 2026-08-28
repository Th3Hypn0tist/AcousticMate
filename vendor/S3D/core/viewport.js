import { WebGLImageRenderer } from './webgl_image_renderer.js';

const viewportsByCanvas = new WeakMap();

class Viewport {
  constructor(canvas, { camera, clearColor = [.025, .03, .045, 1], pixelRatio = () => globalThis.devicePixelRatio || 1 } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Viewport requires a canvas');
    if (!camera || typeof camera.viewProjection !== 'function') throw new Error('Viewport requires a camera');
    this.canvas = canvas;
    this.camera = camera;
    this.clearColor = [...clearColor];
    this.pixelRatio = pixelRatio;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true });
    if (!this.gl) throw new Error('Viewport requires WebGL2');
    this.renderer = new WebGLImageRenderer(this.gl);
    this.scene = null;
    this.running = false;
    this.frameHandle = null;
    this.previousNow = 0;
    viewportsByCanvas.set(canvas, this);
  }

  resize() {
    const density = Math.max(1, Number(this.pixelRatio()) || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * density));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * density));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(now = performance.now()) {
    if (!this.scene) return;
    this.resize();
    const gl = this.gl;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const viewProjection = this.camera.viewProjection(aspect);
    const basis = this.camera.basis();
    const delta = this.previousNow ? Math.max(0, (now - this.previousNow) / 1000) : 0;
    this.previousNow = now;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...this.clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.scene.update(delta, now);
    this.renderer.begin(viewProjection);
    this.scene.draw(this.renderer, { now, camera: this.camera, viewport: this });
    return this.renderer.flush(basis.right, basis.up, now / 1000);
  }

  frame = now => {
    if (!this.running) return;
    this.render(now);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  start(scene) {
    this.scene = scene;
    if (!this.running) {
      this.running = true;
      this.frameHandle = requestAnimationFrame(this.frame);
    }
    return this;
  }

  stop() {
    this.running = false;
    if (this.frameHandle != null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  destroy() { this.stop(); this.scene = null; viewportsByCanvas.delete(this.canvas); }
}

function viewportForCanvas(canvas) { return viewportsByCanvas.get(canvas) ?? null; }

export { Viewport, viewportForCanvas };
