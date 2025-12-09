import { BONE_MAP } from '../constants';

export interface BoneFrameData {
  boneId: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface AnimationData {
  frames: { bones: BoneFrameData[] }[];
  framesCount: number;
  bonesCount: number;
  boneIds: number[];
}

class AnimationParser {
  private animationData: AnimationData | null = null;
  private boneIds: number[] = [];

  private halfToFloat(h: number): number {
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

  private parseCompressedQuaternion(v0: number, v1: number, v2: number): [number, number, number, number] {
    const scale = 1.0 / 32767.0;
    const maxValue = 1.4142135;
    const shift = 0.70710677;

    // Extract which component was omitted (bits 13-14)
    const missing = (v0 >> 13) & 3;

    // Extract sign bit (bit 15)
    const signBit = (v0 >> 15) & 1;

    // Calculate the three stored components
    const a = ((v1 >> 14) + 4 * (v0 & 0x1fff)) * scale * maxValue - shift;
    const b = ((v2 >> 15) + 2 * (v1 & 0x3fff)) * scale * maxValue - shift;
    const c = (v2 & 0x7fff) * scale * maxValue - shift;

    // Calculate the reconstructed (omitted) component
    const dSquared = 1.0 - (a * a + b * b + c * c);
    let d = dSquared > 0 ? Math.sqrt(dSquared) : 0;

    // Apply sign based on sign bit
    if (signBit === 1) {
      d = -d;
    }

    // Reorder components based on which one was omitted
    switch (missing) {
      case 0:
        return [d, a, b, c]; // W was omitted, return [W, X, Y, Z] -> actually re-ordered to [X, Y, Z, W] by logic usually, but let's stick to standard quat [x,y,z,w]
      case 1:
        return [a, d, b, c]; // X was omitted
      case 2:
        return [a, b, d, c]; // Y was omitted
      case 3:
        return [a, b, c, d]; // Z was omitted
      default:
        return [0, 0, 0, 1];
    }
  }

  public async parse(arrayBuffer: ArrayBuffer): Promise<AnimationData> {
    try {
      const dataView = new DataView(arrayBuffer);
      let offset = 0;

      // Header check
      const header = dataView.getBigInt64(offset, true);
      offset += 8;
      // 457546134634734n
      if (header !== 457546134634734n) {
        throw new Error('Invalid animation file format');
      }

      const arrayCount = dataView.getInt16(offset, true);
      offset += 2;
      offset += arrayCount * 8; // Skip array offsets

      const framesCount = dataView.getInt32(offset, true);
      offset += 4;
      const bonesCount = dataView.getInt32(offset, true);
      offset += 4;

      this.boneIds = [];
      for (let i = 0; i < bonesCount; i++) {
        this.boneIds.push(dataView.getInt16(offset, true));
        offset += 2;
      }

      const frames: { bones: BoneFrameData[] }[] = [];
      for (let frameIndex = 0; frameIndex < framesCount; frameIndex++) {
        const frameBones: BoneFrameData[] = [];
        for (let boneIndex = 0; boneIndex < bonesCount; boneIndex++) {
          const px = dataView.getUint16(offset, true); offset += 2;
          const py = dataView.getUint16(offset, true); offset += 2;
          const pz = dataView.getUint16(offset, true); offset += 2;
          const v0 = dataView.getUint16(offset, true); offset += 2;
          const v1 = dataView.getUint16(offset, true); offset += 2;
          const v2 = dataView.getUint16(offset, true); offset += 2;

          const position: [number, number, number] = [
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

      this.animationData = {
        frames: frames,
        framesCount: framesCount,
        bonesCount: bonesCount,
        boneIds: this.boneIds,
      };

      return this.animationData;
    } catch (error) {
      console.error('Error parsing animation:', error);
      throw error;
    }
  }

  public convertToCSV(animationData: AnimationData, originalFilename: string): void {
    const csvRows = [
      'bone_id,bone_name,frame_number,position_x,position_y,position_z,rotation_x,rotation_y,rotation_z,rotation_w',
    ];

    for (let frameIndex = 0; frameIndex < animationData.framesCount; frameIndex++) {
      const frame = animationData.frames[frameIndex];
      const frameNumber = frameIndex + 1;
      
      // Sort bones by ID for a consistent export order
      const sortedBones = [...frame.bones].sort((a, b) => a.boneId - b.boneId);

      for (const bone of sortedBones) {
        const boneName = BONE_MAP[bone.boneId] || `bone_${bone.boneId}`;
        const [qX, qY, qZ, qW] = bone.rotation;

        const row = [
          bone.boneId,
          boneName,
          frameNumber,
          bone.position[0].toFixed(6),
          bone.position[1].toFixed(6),
          bone.position[2].toFixed(6),
          qX.toFixed(6),
          qY.toFixed(6),
          qZ.toFixed(6),
          qW.toFixed(6),
        ];
        csvRows.push(row.join(','));
      }
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
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