import { halfToFloat, parseCompressedQuaternion, float32ToFloat16, compressQuaternion } from './utils.js';

export class AnimationParser {
    constructor() {
        this.originalHeaderBuffer = null;
        this.boneIds = [];
        this.headerOffsetInfo = {
            start: 0,
            end: 0,
            garbSize: 0
        };
        this.EXPECTED_HEADER = 457546134634734n;
    }

    async parse(arrayBuffer) {
        try {
            const dataView = new DataView(arrayBuffer);
            
            // 1. Scan for Header (Matches HTML "Find Header" logic)
            let headerStart = -1;
            // Scan reasonable range first, then check 0
            for(let i=0; i < Math.min(arrayBuffer.byteLength - 8, 1024); i++) {
                if (dataView.getBigUint64(i, true) === this.EXPECTED_HEADER) {
                    headerStart = i; 
                    break;
                }
            }
            if (headerStart === -1 && dataView.getBigUint64(0, true) === this.EXPECTED_HEADER) {
                headerStart = 0;
            }
            
            if (headerStart === -1) throw new Error('Invalid file signature (Header not found)');

            // 2. Parse Metadata
            let offset = headerStart + 8; // Skip Magic
            const arrayCount = dataView.getInt16(offset, true); offset += 2;
            const garbageSize = arrayCount * 8;
            offset += garbageSize; // Skip garbage
            
            const framesCount = dataView.getInt32(offset, true); offset += 4;
            const bonesCount = dataView.getInt32(offset, true); offset += 4;
            
            // Capture bone IDs
            this.boneIds = [];
            for (let i = 0; i < bonesCount; i++) {
                this.boneIds.push(dataView.getInt16(offset, true));
                offset += 2;
            }

            // Store Header info for repacking
            const headerEnd = offset;
            this.headerOffsetInfo = {
                start: headerStart,
                end: headerEnd,
                garbSize: arrayCount
            };

            // Save the exact header bytes for preservation
            this.originalHeaderBuffer = arrayBuffer.slice(0, headerEnd);

            // 3. Parse Frames
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

                    // Parse Rotation
                    // Binary returns [W, X, Y, Z]
                    const q = parseCompressedQuaternion(v0, v1, v2);

                    frameBones.push({
                        boneId: this.boneIds[boneIndex],
                        position: [halfToFloat(px), halfToFloat(py), halfToFloat(pz)],
                        // SWIZZLE: Convert [W, X, Y, Z] -> [X, Y, Z, W] for Three.js/App
                        rotation: [q[1], q[2], q[3], q[0]],
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
        const headerSize = this.originalHeaderBuffer.byteLength; // Contains everything up to frame data
        const bodySize = framesCount * bonesCount * 12;
        
        // If the original file had offset start, we preserve that padding in the new file
        // headerOffsetInfo.start is the empty space before header
        const prefixPadding = this.headerOffsetInfo.start;
        const finalBuffer = new Uint8Array(prefixPadding + headerSize + bodySize);
        
        // Write Header (at correct offset if any)
        finalBuffer.set(new Uint8Array(this.originalHeaderBuffer), prefixPadding);
        
        // Update Frames Count in the header
        // Location logic from HTML: headerStart + 8 (magic) + 2 (count) + (garbSize * 8)
        const dv = new DataView(finalBuffer.buffer);
        const frameCountOffset = prefixPadding + 8 + 2 + (this.headerOffsetInfo.garbSize * 8);
        dv.setInt32(frameCountOffset, framesCount, true);
        
        // 2. Write Body
        let ptr = prefixPadding + headerSize;
        const boneIds = this.boneIds; // Use IDs from base file

        for(let f=0; f<framesCount; f++) {
            const frame = animationData.frames[f];
            
            // Map for O(1) access
            const boneMap = {};
            if(frame.bones) frame.bones.forEach(b => boneMap[b.boneId] = b);

            for(let b=0; b<bonesCount; b++) {
                const id = boneIds[b];
                const boneData = boneMap[id] || { position: [0,0,0], rotation: [0,0,0,1] };

                // Pos
                dv.setUint16(ptr, float32ToFloat16(boneData.position[0]), true); ptr+=2;
                dv.setUint16(ptr, float32ToFloat16(boneData.position[1]), true); ptr+=2;
                dv.setUint16(ptr, float32ToFloat16(boneData.position[2]), true); ptr+=2;

                // Rot
                // SWIZZLE: App uses [X, Y, Z, W]. Compress expects [W, X, Y, Z].
                const rot = boneData.rotation;
                const packed = compressQuaternion(rot[3], rot[0], rot[1], rot[2]);
                
                dv.setUint16(ptr, packed[0], true); ptr+=2;
                dv.setUint16(ptr, packed[1], true); ptr+=2;
                dv.setUint16(ptr, packed[2], true); ptr+=2;
            }
        }

        return finalBuffer;
    }
}

export const animationParser = new AnimationParser();
