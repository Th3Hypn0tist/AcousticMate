function finiteVector(value, length, name) {
  if (!Array.isArray(value) || value.length !== length || value.some(item => !Number.isFinite(item))) {
    throw new Error(`${name} must contain ${length} finite numbers`);
  }
  return [...value];
}

function vec3(value, name = 'Vector') { return finiteVector(value, 3, name); }

function normalizeQuaternion(value, name = 'Quaternion') {
  const q = finiteVector(value, 4, name);
  const magnitude = Math.hypot(...q);
  if (magnitude <= Number.EPSILON) throw new Error(`${name} must not be zero`);
  return q.map(component => component / magnitude);
}

function quaternionConjugate(value) {
  const [x, y, z, w] = normalizeQuaternion(value);
  return [-x, -y, -z, w];
}

function quaternionMultiply(a, b) {
  const [ax, ay, az, aw] = normalizeQuaternion(a, 'Quaternion A');
  const [bx, by, bz, bw] = normalizeQuaternion(b, 'Quaternion B');
  return normalizeQuaternion([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

function axisQuaternion(axis, radians) {
  const half = radians / 2;
  const sine = Math.sin(half);
  const cosine = Math.cos(half);
  if (axis === 'x') return [sine, 0, 0, cosine];
  if (axis === 'y') return [0, sine, 0, cosine];
  if (axis === 'z') return [0, 0, sine, cosine];
  throw new Error(`Unknown quaternion axis: ${axis}`);
}

function quaternionFromEulerDegrees({ yaw = 0, pitch = 0, roll = 0 } = {}) {
  const toRadians = value => Number(value) * Math.PI / 180;
  if (![yaw, pitch, roll].every(value => Number.isFinite(Number(value)))) throw new Error('Euler angles must be finite');
  return quaternionMultiply(
    quaternionMultiply(axisQuaternion('y', toRadians(yaw)), axisQuaternion('x', toRadians(pitch))),
    axisQuaternion('z', toRadians(roll)),
  );
}

function eulerDegreesFromQuaternion(value) {
  const [x, y, z, w] = normalizeQuaternion(value);
  const m02 = 2 * (x * z + y * w);
  const m10 = 2 * (x * y + z * w);
  const m11 = 1 - 2 * (x * x + z * z);
  const m12 = 2 * (y * z - x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m12)));
  const cosinePitch = Math.cos(pitch);
  let yaw;
  let roll;
  if (Math.abs(cosinePitch) > 1e-8) {
    yaw = Math.atan2(m02, m22);
    roll = Math.atan2(m10, m11);
  } else {
    const m00 = 1 - 2 * (y * y + z * z);
    const m20 = 2 * (x * z - y * w);
    yaw = Math.atan2(-m20, m00);
    roll = 0;
  }
  const toDegrees = radians => radians * 180 / Math.PI;
  return { yaw: toDegrees(yaw), pitch: toDegrees(pitch), roll: toDegrees(roll) };
}

function rotateVector(value, orientation) {
  const [vx, vy, vz] = vec3(value);
  const [qx, qy, qz, qw] = normalizeQuaternion(orientation);
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

function inverseRotateVector(value, orientation) {
  return rotateVector(value, quaternionConjugate(orientation));
}

function composeTransform(parent, local) {
  const parentPosition = vec3(parent.position, 'Parent position');
  const parentOrientation = normalizeQuaternion(parent.orientation, 'Parent orientation');
  const localPosition = vec3(local.position, 'Local position');
  const localOrientation = normalizeQuaternion(local.orientation, 'Local orientation');
  const offset = rotateVector(localPosition, parentOrientation);
  return {
    position: parentPosition.map((component, index) => component + offset[index]),
    orientation: quaternionMultiply(parentOrientation, localOrientation),
  };
}

function inverseTransformPoint(worldPosition, parent) {
  const position = vec3(worldPosition, 'World position');
  const parentPosition = vec3(parent.position, 'Parent position');
  const delta = position.map((component, index) => component - parentPosition[index]);
  return inverseRotateVector(delta, parent.orientation);
}

export {
  vec3,
  normalizeQuaternion,
  quaternionConjugate,
  quaternionMultiply,
  quaternionFromEulerDegrees,
  eulerDegreesFromQuaternion,
  rotateVector,
  inverseRotateVector,
  composeTransform,
  inverseTransformPoint,
};
