import { halfToFloat, parseCompressedQuaternion, float32ToFloat16, compressQuaternion } from './utils.js';

export class AnimationParser {
    constructor() {
        this.originalHeaderBuffer = null;
        this.boneIds = [];
        this.EXPECTED_HEADER = 457546134634734n;
    }

    async parse(arrayBuffer) {
        try {
            const dataView = new DataView(arrayBuffer);
            let offset = 0;

            const header = dataView.getBigInt64(offset, true);
            if (header !== this.EXPECTED_HEADER) throw new Error('Invalid file signature');

            // Find structure to preserve header
            let tempOffset = 8;
            const arrayCount = dataView.getInt16(tempOffset, true); tempOffset += 2;
            const garbageSize = arrayCount * 8;
            const headerEnd = 8 + 2 + garbageSize; 
            
            offset = headerEnd;
            const framesCount = dataView.getInt32(offset, true); offset += 4;
            const bonesCount = dataView.getInt32(offset, true); offset += 4;
            
            // Store the header exactly as is (up to frame count)
            // But we need to include the bone IDs in preservation if we want a perfect copy base
            // The file structure: [Header][Frames][Bones][BoneIDs array][FRAME DATA]
            
            // Let's capture bone IDs too
            this.boneIds = [];
            for (let i = 0; i < bonesCount; i++) {
                this.boneIds.push(dataView.getInt16(offset, true));
                offset += 2;
            }

            // Save everything UP TO the start of frame data as the "Header Template"
            this.originalHeaderBuffer = arrayBuffer.slice(0, offset);

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

    repack(animationData) {
        if (!animationData || !this.originalHeaderBuffer) {
            throw new Error("Missing Base File header or Animation Data");
        }

        const bonesCount = animationData.bonesCount;
        const framesCount = animationData.framesCount;
        
        // 1. Prepare Header
        // Copy the original header
        const headerSize = this.originalHeaderBuffer.byteLength;
        const bodySize = framesCount * bonesCount * 12;
        const finalBuffer = new Uint8Array(headerSize + bodySize);
        
        // Set Header
        finalBuffer.set(new Uint8Array(this.originalHeaderBuffer), 0);
        
        // Update Frames Count in the header (It's located at HeaderEnd)
        // We need to recalculate where Frame Count is stored.
        // It is after [Magic 8] + [ArrCount 2] + [ArrCount * 8]
        const dv = new DataView(finalBuffer.buffer);
        const arrCount = dv.getInt16(8, true);
        const frameCountOffset = 8 + 2 + (arrCount * 8);
        dv.setInt32(frameCountOffset, framesCount, true);
        
        // 2. Write Body
        let ptr = headerSize;
        const boneIds = this.boneIds; // Use IDs from base file

        for(let f=0; f<framesCount; f++) {
            const frame = animationData.frames[f];
            // Sort frame bones map for O(1) access
            const boneMap = {};
            if(frame.bones) frame.bones.forEach(b => boneMap[b.boneId] = b);

            for(let b=0; b<bonesCount; b++) {
                const id = boneIds[b];
                // Use data from GLTF import or fallback to identity
                const boneData = boneMap[id] || { position: [0,0,0], rotation: [0,0,0,1] };

                // Pos
                dv.setUint16(ptr, float32ToFloat16(boneData.position[0]), true); ptr+=2;
                dv.setUint16(ptr, float32ToFloat16(boneData.position[1]), true); ptr+=2;
                dv.setUint16(ptr, float32ToFloat16(boneData.position[2]), true); ptr+=2;

                // Rot
                const packed = compressQuaternion(boneData.rotation[0], boneData.rotation[1], boneData.rotation[2], boneData.rotation[3]);
                dv.setUint16(ptr, packed[0], true); ptr+=2;
                dv.setUint16(ptr, packed[1], true); ptr+=2;
                dv.setUint16(ptr, packed[2], true); ptr+=2;
            }
        }

        return finalBuffer;
    }
}

export const animationParser = new AnimationParser();
