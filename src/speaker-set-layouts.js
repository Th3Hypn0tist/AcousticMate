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

function axisIndex(axis) {
  if (axis === 'x' || axis === 0) return 0;
  if (axis === 'y' || axis === 1) return 1;
  if (axis === 'z' || axis === 2) return 2;
  throw new Error(`Unknown layout axis: ${axis}`);
}

function selectedMembers(set, members = null) {
  requireSet(set);
  if (members == null) return [...set.members];
  const values = members.map(value => value?.speaker ? value : set.memberForSpeaker?.(value)).filter(Boolean);
  for (const member of values) if (!set.members.includes(member)) throw new Error('Layout member does not belong to SpeakerSet');
  return values;
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

function mirrorMembers(set, { axis = 'x', origin = 0, members = null } = {}) {
  const index = axisIndex(axis);
  origin = finite(origin, 'Mirror origin');
  for (const member of selectedMembers(set, members)) {
    const position = [...member.localPosition];
    position[index] = origin - (position[index] - origin);
    set.setMemberPosition(member.speaker, position);
  }
  return set;
}

function alignMembers(set, { axis = 'x', mode = 'center', value = null, members = null } = {}) {
  const index = axisIndex(axis);
  const values = selectedMembers(set, members);
  if (!values.length) return set;
  const coordinates = values.map(member => member.localPosition[index]);
  let target;
  if (value != null) target = finite(value, 'Alignment value');
  else if (mode === 'min') target = Math.min(...coordinates);
  else if (mode === 'max') target = Math.max(...coordinates);
  else if (mode === 'center') target = (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
  else if (mode === 'mean') target = coordinates.reduce((sum, current) => sum + current, 0) / coordinates.length;
  else throw new Error(`Unknown alignment mode: ${mode}`);
  for (const member of values) {
    const position = [...member.localPosition];
    position[index] = target;
    set.setMemberPosition(member.speaker, position);
  }
  return set;
}

function distributeMembers(set, { axis = 'x', start = null, end = null, members = null } = {}) {
  const index = axisIndex(axis);
  const values = selectedMembers(set, members).sort((a, b) => a.localPosition[index] - b.localPosition[index]);
  if (values.length < 2) return set;
  start = start == null ? values[0].localPosition[index] : finite(start, 'Distribution start');
  end = end == null ? values.at(-1).localPosition[index] : finite(end, 'Distribution end');
  const step = (end - start) / (values.length - 1);
  values.forEach((member, memberIndex) => {
    const position = [...member.localPosition];
    position[index] = start + step * memberIndex;
    set.setMemberPosition(member.speaker, position);
  });
  return set;
}

export {
  applyLineArrayLayout,
  applyClusterLayout,
  applySubArrayLayout,
  mirrorMembers,
  alignMembers,
  distributeMembers,
  axisIndex,
};
