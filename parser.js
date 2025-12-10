import { BONE_MAP } from './constants.js';
import { halfToFloat, parseCompressedQuaternion, float32ToFloat16, compressQuaternion } from './utils.js';

export class AnimationParser {
    constructor() {
        this.originalHeaderBuffer = null; // Store header to preserve garbage data
        this.boneIds = [];
        this.EXPECTED_HEADER = 457546134634734n;
    }

    async parse(arrayBuffer) {
        try {
            const dataView = new DataView(arrayBuffer);
            let offset = 0;

            const header = dataView.getBigInt64(offset, true);
            
            // Magic number check
            if (header !== this.EXPECTED_HEADER) {
                throw new Error('Invalid file signature');
            }

            // Save the exact header bytes for later repack
            let tempOffset = 8;
            const arrayCount = dataView.getInt16(tempOffset, true); tempOffset += 2;
            const garbageSize = arrayCount * 8;
            // Header ends after frames count (4) + bones count (4) + bone IDs list
            // We'll just grab the critical top section for now
            const headerEnd = 8 + 2 + garbageSize; 
            
            // Read structure
            offset = headerEnd;
            const framesCount = dataView.getInt32(offset, true); offset += 4;
            const bonesCount = dataView.getInt32(offset, true); offset += 4;
            
            // Capture header for repack up to bonesCount
            this.originalHeaderBuffer = arrayBuffer.slice(0, offset);

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

                    frameBones.push({
                        boneId: this.boneIds[boneIndex],
                        position: [halfToFloat(px), halfToFloat(py), halfToFloat(pz)],
                        rotation: parseCompressedQuaternion(v0, v1, v2),
                    });
                }
                frames.push({ bones: frameBones });
            }

            return {
                frames,
                framesCount,
                bonesCount,
                boneIds: this.boneIds
            };
        } catch (error) {
            console.error(error);
            throw new Error("Failed to parse binary file");
        }
    }

    // Compiles current internal animation data back to binary .bytes format
    repack(animationData) {
        if (!animationData) throw new Error("No data to compile");

        // 1. Prepare Header
        // If we don't have an original header (e.g. from GLTF import), construct a minimal one
        let headerBuffer;
        let bonesCount = animationData.bonesCount;
        let boneIds = animationData.boneIds;
        
        if (this.originalHeaderBuffer) {
            headerBuffer = new Uint8Array(this.originalHeaderBuffer);
            // Append Bone IDs if needed (though usually we assume same skeleton)
            // For safety, we reconstruct the header part that contains bone IDs
            const dv = new DataView(headerBuffer.buffer);
            // Update frames count in the header copy (Offset: headerLen - 4 - 4)
            // But headerBuffer only stores up to bonesCount. 
            // Let's just reconstruct the dynamic part.
        } 
        
        // Robust Header Reconstruction
        // Header: [Magic:8][GarbSize:2][Garbage...][Frames:4][Bones:4][BoneIDs...]
        
        // Default garbage if missing
        const garbageCount = 0; 
        const headerSize = 8 + 2 + (garbageCount * 8) + 4 + 4 + (bonesCount * 2);
        
        const bufferSize = headerSize + (animationData.framesCount * bonesCount * 12);
        const finalBuffer = new Uint8Array(bufferSize);
        const view = new DataView(finalBuffer.buffer);
        let ptr = 0;

        // Magic
        view.setBigUint64(ptr, this.EXPECTED_HEADER, true); ptr += 8;
        
        // Garbage (0 for clean repack)
        view.setInt16(ptr, garbageCount, true); ptr += 2;
        ptr += (garbageCount * 8);

        // Counts
        view.setInt32(ptr, animationData.framesCount, true); ptr += 4;
        view.setInt32(ptr, bonesCount, true); ptr += 4;

        // Bone IDs
        for(let i=0; i<bonesCount; i++) {
            view.setInt16(ptr, boneIds[i], true); ptr += 2;
        }

        // 2. Write Body
        for(let f=0; f<animationData.framesCount; f++) {
            const frame = animationData.frames[f];
            // Sort bones to match ID order in header
            const boneMap = {};
            frame.bones.forEach(b => boneMap[b.boneId] = b);

            for(let b=0; b<bonesCount; b++) {
                const id = boneIds[b];
                const boneData = boneMap[id] || { position: [0,0,0], rotation: [0,0,0,1] };

                // Pos
                view.setUint16(ptr, float32ToFloat16(boneData.position[0]), true); ptr+=2;
                view.setUint16(ptr+2, float32ToFloat16(boneData.position[1]), true); ptr+=2;
                view.setUint16(ptr+4, float32ToFloat16(boneData.position[2]), true); ptr+=2;

                // Rot
                const packed = compressQuaternion(boneData.rotation[0], boneData.rotation[1], boneData.rotation[2], boneData.rotation[3]);
                view.setUint16(ptr+6, packed[0], true);
                view.setUint16(ptr+8, packed[1], true);
                view.setUint16(ptr+10, packed[2], true);
                
                ptr += 12;
            }
        }

        return finalBuffer;
    }
}

export const animationParser = new AnimationParser();
