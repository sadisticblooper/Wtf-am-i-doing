import { BONE_MAP } from './constants.js';

class AnimationParser {
  constructor() {
    this.animationData = null;
    this.boneIds = [];
  }

  halfToFloat(h) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) {
      return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
    } else if (e === 0x1f) {
      return f ? NaN : (s ? -1 : 1) * Infinity;
    }
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
  }

  parseCompressedQuaternion(v0, v1, v2) {
    const scale = 1.0 / 32767.0;
    const maxValue = 1.4142135;
    const shift = 0.70710677;

    const missing = (v0 >> 13) & 3;
    const signBit = (v0 >> 15) & 1;

    const a = ((v1 >> 14) + 4 * (v0 & 0x1fff)) * scale * maxValue - shift;
    const b = ((v2 >> 15) + 2 * (v1 & 0x3fff)) * scale * maxValue - shift;
    const c = (v2 & 0x7fff) * scale * maxValue - shift;

    const dSquared = 1.0 - (a * a + b * b + c * c);
    let d = dSquared > 0 ? Math.sqrt(dSquared) : 0;

    if (signBit === 1) d = -d;

    switch (missing) {
      case 0: return [d, a, b, c];
      case 1: return [a, d, b, c];
      case 2: return [a, b, d, c];
      case 3: return [a, b, c, d];
      default: return [0, 0, 0, 1];
    }
  }

  async parse(arrayBuffer) {
    try {
      const dataView = new DataView(arrayBuffer);
      let offset = 0;

      const header = dataView.getBigInt64(offset, true);
      offset += 8;
      
      // Magic number check
      if (header !== 457546134634734n) {
        throw new Error('Invalid file signature');
      }

      const arrayCount = dataView.getInt16(offset, true);
      offset += 2;
      offset += arrayCount * 8; 

      const framesCount = dataView.getInt32(offset, true);
      offset += 4;
      const bonesCount = dataView.getInt32(offset, true);
      offset += 4;

      this.boneIds = [];
      for (let i = 0; i < bonesCount; i++) {
        this.boneIds.push(dataView.getInt16(offset, true));
        offset += 2;
      }

      const frames = [];
      for (let frameIndex = 0; frameIndex < framesCount; frameIndex++) {
        const frameBones = [];
        for (let boneIndex = 0; boneIndex < bonesCount; boneIndex++) {
          const px = dataView.getUint16(offset, true); offset += 2;
          const py = dataView.getUint16(offset, true); offset += 2;
          const pz = dataView.getUint16(offset, true); offset += 2;
          const v0 = dataView.getUint16(offset, true); offset += 2;
          const v1 = dataView.getUint16(offset, true); offset += 2;
          const v2 = dataView.getUint16(offset, true); offset += 2;

          const position = [
            this.halfToFloat(px),
            this.halfToFloat(py),
            this.halfToFloat(pz),
          ];

          const rotation = this.parseCompressedQuaternion(v0, v1, v2);

          frameBones.push({
            boneId: this.boneIds[boneIndex],
            position: position,
            rotation: rotation,
          });
        }
        frames.push({ bones: frameBones });
      }

      return {
        frames: frames,
        framesCount: framesCount,
        bonesCount: bonesCount,
        boneIds: this.boneIds,
      };
    } catch (error) {
      throw error;
    }
  }

  convertToCSV(animationData, originalFilename) {
    if (!animationData) return;
    const csvRows = [
      'bone_id,bone_name,frame_number,position_x,position_y,position_z,rotation_x,rotation_y,rotation_z,rotation_w',
    ];

    for (let frameIndex = 0; frameIndex < animationData.framesCount; frameIndex++) {
      const frame = animationData.frames[frameIndex];
      const frameNumber = frameIndex + 1;
      const sortedBones = [...frame.bones].sort((a, b) => a.boneId - b.boneId);

      for (const bone of sortedBones) {
        const boneName = BONE_MAP[bone.boneId] || `bone_${bone.boneId}`;
        const [qX, qY, qZ, qW] = bone.rotation;

        csvRows.push([
          bone.boneId, boneName, frameNumber,
          bone.position[0].toFixed(6), bone.position[1].toFixed(6), bone.position[2].toFixed(6),
          qX.toFixed(6), qY.toFixed(6), qZ.toFixed(6), qW.toFixed(6),
        ].join(','));
      }
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalFilename.replace(/\.[^/.]+$/, "")}_extracted.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const animationParser = new AnimationParser();
