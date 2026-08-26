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

export { vec3, normalizeQuaternion, quaternionConjugate, quaternionMultiply, rotateVector, inverseRotateVector, composeTransform, inverseTransformPoint };
