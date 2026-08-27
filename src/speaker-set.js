import { Complex } from './complex.js';
import { composeTransform, inverseTransformPoint, normalizeQuaternion, quaternionConjugate, quaternionMultiply, vec3 } from './spatial.js';

const TYPES = new Set(['generic', 'line-array', 'cluster', 'sub-array', 'stack', 'distributed']);

function optionalFinite(value, name) {
  if (value == null) return null;
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite or null`);
  return value;
}

class SpeakerSet {
  constructor({ id, name = id, type = 'generic', position = [0, 0, 0], orientation = [0, 0, 0, 1], members = [], signalChain = null, enabled = true, metadata = {} } = {}) {
    if (typeof id !== 'string' || !id) throw new Error('SpeakerSet requires a non-empty id');
    if (!TYPES.has(type)) throw new Error(`Unknown SpeakerSet type: ${type}`);
    this.id = id;
    this.name = String(name ?? id);
    this.type = type;
    this.position = vec3(position, 'SpeakerSet position');
    this.orientation = normalizeQuaternion(orientation, 'SpeakerSet orientation');
    this.members = [];
    this.signalChain = signalChain;
    this.enabled = Boolean(enabled);
    this.metadata = { ...metadata };
    this.listeners = new Map();
    for (const member of members) this.addMember(member);
  }
  on(event, listener) { const values = this.listeners.get(event) ?? new Set(); values.add(listener); this.listeners.set(event, values); return () => values.delete(listener); }
  emit(event, detail = {}) { for (const listener of this.listeners.get(event) ?? []) listener({ type: event, target: this, ...detail }); }
  addMember(value) {
    const speaker = value?.speaker ?? value;
    if (!speaker?.id || typeof speaker.setPosition !== 'function') throw new Error('SpeakerSet member requires a Speaker instance');
    if (speaker.parentSet && speaker.parentSet !== this) throw new Error(`Speaker ${speaker.id} already belongs to another SpeakerSet`);
    const localPosition = value?.localPosition ? vec3(value.localPosition, 'Member local position') : inverseTransformPoint(speaker.position, this);
    const localOrientation = value?.localOrientation ? normalizeQuaternion(value.localOrientation, 'Member local orientation') : quaternionMultiply(quaternionConjugate(this.orientation), speaker.orientation);
    const member = {
      speaker,
      localPosition,
      localOrientation,
      gainTrimDb: optionalFinite(value?.gainTrimDb, 'Member gain trim'),
      delayTrimMs: optionalFinite(value?.delayTrimMs, 'Member delay trim'),
    };
    speaker.parentSet = this;
    this.members.push(member);
    this.syncMember(member);
    this.emit('memberAdded', { member });
    return member;
  }
  removeMember(speakerOrId) { const index = this.members.findIndex(member => member.speaker === speakerOrId || member.speaker.id === speakerOrId); if (index < 0) return null; const [member] = this.members.splice(index, 1); if (member.speaker.parentSet === this) member.speaker.parentSet = null; this.emit('memberRemoved', { member, index }); return member; }
  moveMember(speakerOrMember, toIndex) {
    const fromIndex = this.members.findIndex(member => member === speakerOrMember || member.speaker === speakerOrMember || member.speaker.id === speakerOrMember);
    if (fromIndex < 0) throw new Error('SpeakerSet member not found');
    toIndex = Number(toIndex);
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.members.length) throw new Error('SpeakerSet member target index is out of range');
    if (fromIndex === toIndex) return this;
    const [member] = this.members.splice(fromIndex, 1);
    this.members.splice(toIndex, 0, member);
    this.emit('memberOrderChanged', { member, fromIndex, toIndex, members: [...this.members] });
    return this;
  }
  memberForSpeaker(speaker) { return this.members.find(member => member.speaker === speaker) ?? null; }
  requireMember(speaker) { const member = this.memberForSpeaker(speaker); if (!member) throw new Error('Speaker is not a member of this set'); return member; }
  worldTransform(memberOrSpeaker) { const member = memberOrSpeaker?.speaker ? memberOrSpeaker : this.memberForSpeaker(memberOrSpeaker); if (!member) throw new Error('Speaker is not a member of this set'); return composeTransform(this, { position: member.localPosition, orientation: member.localOrientation }); }
  syncMember(member) { const world = this.worldTransform(member); member.speaker.setPosition(world.position); member.speaker.setOrientation(world.orientation); return world; }
  syncAll() { for (const member of this.members) this.syncMember(member); return this; }
  setPosition(value) { this.position = vec3(value, 'SpeakerSet position'); this.syncAll(); this.emit('positionChanged', { position: [...this.position] }); return this; }
  setOrientation(value) { this.orientation = normalizeQuaternion(value, 'SpeakerSet orientation'); this.syncAll(); this.emit('orientationChanged', { orientation: [...this.orientation] }); return this; }
  setMemberPosition(speaker, value) { const member = this.requireMember(speaker); member.localPosition = vec3(value, 'Member local position'); this.syncMember(member); this.emit('memberTransformChanged', { member }); return this; }
  setMemberOrientation(speaker, value) { const member = this.requireMember(speaker); member.localOrientation = normalizeQuaternion(value, 'Member local orientation'); this.syncMember(member); this.emit('memberTransformChanged', { member }); return this; }
  setMemberGainTrim(speaker, value) { const member = this.requireMember(speaker); member.gainTrimDb = optionalFinite(value, 'Member gain trim'); this.emit('memberProcessingChanged', { member, gainTrimDb: member.gainTrimDb, delayTrimMs: member.delayTrimMs }); return this; }
  setMemberDelayTrim(speaker, value) { const member = this.requireMember(speaker); member.delayTrimMs = optionalFinite(value, 'Member delay trim'); this.emit('memberProcessingChanged', { member, gainTrimDb: member.gainTrimDb, delayTrimMs: member.delayTrimMs }); return this; }
  setMemberProcessing(speaker, { gainTrimDb, delayTrimMs } = {}) {
    const member = this.requireMember(speaker);
    if (gainTrimDb !== undefined) member.gainTrimDb = optionalFinite(gainTrimDb, 'Member gain trim');
    if (delayTrimMs !== undefined) member.delayTrimMs = optionalFinite(delayTrimMs, 'Member delay trim');
    this.emit('memberProcessingChanged', { member, gainTrimDb: member.gainTrimDb, delayTrimMs: member.delayTrimMs });
    return this;
  }
  setEnabled(value) { this.enabled = Boolean(value); this.emit('enabledChanged', { enabled: this.enabled }); return this; }
  setSignalChain(value) { this.signalChain = value; this.emit('signalChainChanged', { signalChain: value }); return this; }
  transferForSpeaker(speaker, frequencyHz, localTransfer) {
    const member = this.memberForSpeaker(speaker);
    if (!member) return localTransfer;
    const setTransfer = this.signalChain?.evaluateFrequencyResponse(frequencyHz) ?? [1, 0];
    const gain = 10 ** (Number(member.gainTrimDb ?? 0) / 20);
    const phase = -2 * Math.PI * frequencyHz * Number(member.delayTrimMs ?? 0) / 1000;
    return Complex.multiply(Complex.multiply(localTransfer, setTransfer), Complex.fromPolar(gain, phase));
  }
}

export { SpeakerSet };
