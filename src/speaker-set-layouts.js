import { quaternionFromEulerDegrees } from './spatial.js';

function requireSet(set) {
  if (!set?.members || typeof set.setMemberPosition !== 'function' || typeof set.setMemberOrientation !== 'function') {
    throw new Error('SpeakerSet layout requires a SpeakerSet');
  }
  return set;
}

function finite(value, name) {
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function applyLineArrayLayout(set, { spacing = .3, splayDeg = 0, arrayTiltDeg = 0 } = {}) {
  requireSet(set);
  spacing = finite(spacing, 'Line-array spacing');
  splayDeg = finite(splayDeg, 'Line-array splay');
  arrayTiltDeg = finite(arrayTiltDeg, 'Line-array tilt');
  if (spacing < 0) throw new Error('Line-array spacing must be non-negative');
  const center = (set.members.length - 1) / 2;
  set.members.forEach((member, index) => {
    set.setMemberPosition(member.speaker, [0, (center - index) * spacing, 0]);
    set.setMemberOrientation(member.speaker, quaternionFromEulerDegrees({ pitch: arrayTiltDeg + (index - center) * splayDeg }));
  });
  return set;
}

function applyClusterLayout(set, { radius = .35, spreadDeg = 60 } = {}) {
  requireSet(set);
  radius = finite(radius, 'Cluster radius');
  spreadDeg = finite(spreadDeg, 'Cluster spread');
  if (radius < 0) throw new Error('Cluster radius must be non-negative');
  const count = set.members.length;
  set.members.forEach((member, index) => {
    const ratio = count <= 1 ? .5 : index / (count - 1);
    const yaw = (ratio - .5) * spreadDeg;
    const radians = yaw * Math.PI / 180;
    set.setMemberPosition(member.speaker, [Math.sin(radians) * radius, 0, Math.cos(radians) * radius - radius]);
    set.setMemberOrientation(member.speaker, quaternionFromEulerDegrees({ yaw }));
  });
  return set;
}

function applySubArrayLayout(set, { spacing = .8, arcDeg = 0, radius = 0 } = {}) {
  requireSet(set);
  spacing = finite(spacing, 'Sub-array spacing');
  arcDeg = finite(arcDeg, 'Sub-array arc');
  radius = finite(radius, 'Sub-array radius');
  if (spacing < 0 || radius < 0) throw new Error('Sub-array spacing and radius must be non-negative');
  const count = set.members.length;
  const center = (count - 1) / 2;
  if (Math.abs(arcDeg) < 1e-9 || radius <= 0) {
    set.members.forEach((member, index) => {
      set.setMemberPosition(member.speaker, [(index - center) * spacing, 0, 0]);
      set.setMemberOrientation(member.speaker, [0, 0, 0, 1]);
    });
    return set;
  }
  set.members.forEach((member, index) => {
    const ratio = count <= 1 ? 0 : (index - center) / Math.max(1, center);
    const yaw = ratio * arcDeg / 2;
    const radians = yaw * Math.PI / 180;
    set.setMemberPosition(member.speaker, [Math.sin(radians) * radius, 0, Math.cos(radians) * radius - radius]);
    set.setMemberOrientation(member.speaker, quaternionFromEulerDegrees({ yaw }));
  });
  return set;
}

export { applyLineArrayLayout, applyClusterLayout, applySubArrayLayout };
