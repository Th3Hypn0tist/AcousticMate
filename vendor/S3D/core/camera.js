import { Vec3, Mat4 } from './math.js';

class PerspectiveCamera {
  constructor({ position = [7, 6, 8], target = [0, 0, 0], up = [0, 1, 0], fov = 55, near = .05, far = 1000 } = {}) {
    this.position = [...position];
    this.target = [...target];
    this.up = [...up];
    this.fov = Number(fov);
    this.near = Number(near);
    this.far = Number(far);
  }

  basis() {
    const forward = Vec3.norm(Vec3.sub(this.target, this.position));
    let right = Vec3.cross(forward, this.up);
    right = Vec3.length(right) < 1e-9 ? [1, 0, 0] : Vec3.norm(right);
    const up = Vec3.norm(Vec3.cross(right, forward));
    return { forward, right, up };
  }

  viewProjection(aspect) {
    return Mat4.multiply(Mat4.perspective(this.fov, aspect, this.near, this.far), Mat4.lookAt(this.position, this.target));
  }

  ray(clientX, clientY, rect) {
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const x = ((clientX - rect.left) / width) * 2 - 1;
    const y = 1 - ((clientY - rect.top) / height) * 2;
    const aspect = width / height;
    const tangent = Math.tan(this.fov * Math.PI / 360);
    const { forward, right, up } = this.basis();
    const direction = Vec3.norm(Vec3.add(forward, Vec3.add(Vec3.mul(right, x * aspect * tangent), Vec3.mul(up, y * tangent))));
    return { origin: [...this.position], direction };
  }
}

export { PerspectiveCamera };
