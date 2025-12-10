
import { halfToFloat, parseCompressedQuaternion, float32ToFloat16, compressQuaternion } from './utils.js';

export class AnimationParser {
    constructor() {
        this.originalFileBuffer = null;
        this.originalHeaderBuffer = null; // Keep this for backward compatibility
        this.headerStart = 0;
        this.headerEnd = 0;
        this.animationDataStart = 0;
        this.animationDataEnd = 0;
        this.boneIds = [];
        this.bonesCount = 0;
        this.origFramesCount = 0;
        this.EXPECTED_HEADER = 457546134634734n;
        this.frameSize = 0; // bonesCount * 12
    }

    async parse(arrayBuffer) {
        try {
            this.originalFileBuffer = arrayBuffer;
            const dataView = new DataView(arrayBuffer);
            
            // 1. Find header (it might not be at position 0)
            this.headerStart = -1;
            for(let i = 0; i < arrayBuffer.byteLength - 8; i++) {
                if (dataView.getBigUint64(i, true) === this.EXPECTED_HEADER) {
                    this.headerStart = i;
                    break;
                }
            }
            
            // Fallback: check position 0
            if (this.headerStart === -1 && dataView.getBigUint64(0, true) === this.EXPECTED_HEADER) {
                this.headerStart = 0;
            }
            
            if (this.headerStart === -1) {
                throw new Error('Invalid file signature');
            }

            let offset = this.headerStart + 8; // Skip magic
            
            // 2. Parse header structure
            const arrayCount = dataView.getInt16(offset, true); offset += 2;
            const garbageSize = arrayCount * 8;
            offset += garbageSize;
            
            this.origFramesCount = dataView.getInt32(offset, true); offset += 4;
            this.bonesCount = dataView.getInt32(offset, true); offset += 4;
            
            this.frameSize = this.bonesCount * 12;
            
            // Store bone IDs
            this.boneIds = [];
            for (let i = 0; i < this.bonesCount; i++) {
                this.boneIds.push(dataView.getInt16(offset, true));
                offset += 2;
            }
            
            // Mark where header ends and animation data starts
            this.headerEnd = offset;
            this.animationDataStart = this.headerEnd;
            this.animationDataEnd = this.headerEnd + (this.origFramesCount * this.frameSize);
            
            // Store the original header buffer (for backward compatibility)
            this.originalHeaderBuffer = arrayBuffer.slice(0, this.headerEnd);
            
            // 3. Parse animation data
            const frames = [];
            for (let frameIndex = 0; frameIndex < this.origFramesCount; frameIndex++) {
                const frameBones = [];
                for (let boneIndex = 0; boneIndex < this.bonesCount; boneIndex++) {
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
                framesCount: this.origFramesCount,
                bonesCount: this.bonesCount,
                boneIds: this.boneIds
            };
        } catch (error) {
            console.error(error);
            throw new Error("Failed to parse binary file");
        }
    }

    repack(animationData) {
        if (!animationData || !this.originalFileBuffer) {
            throw new Error("Missing Base File header or Animation Data");
        }

        const framesCount = animationData.framesCount;
        const bodySize = framesCount * this.frameSize;
        const origDataView = new DataView(this.originalFileBuffer);
        
        // 1. Calculate total size
        const preHeaderSize = this.headerStart; // Data before the header
        const headerSize = this.headerEnd - this.headerStart; // Header size
        const footerSize = this.originalFileBuffer.byteLength - this.animationDataEnd; // Data after animation
        
        const totalSize = preHeaderSize + headerSize + bodySize + footerSize;
        const finalBuffer = new Uint8Array(totalSize);
        const finalDv = new DataView(finalBuffer.buffer);
        
        let writePtr = 0;
        
        // 2. Copy pre-header data (if any)
        if (preHeaderSize > 0) {
            finalBuffer.set(
                new Uint8Array(this.originalFileBuffer.slice(0, this.headerStart)), 
                writePtr
            );
            writePtr += preHeaderSize;
        }
        
        // 3. Copy header (with updated frame count)
        const headerBytes = new Uint8Array(
            this.originalFileBuffer.slice(this.headerStart, this.headerEnd)
        );
        finalBuffer.set(headerBytes, writePtr);
        
        // Update frame count in the copied header
        // Calculate offset within header where frame count is stored
        // It's at: headerStart + 8 (magic) + 2 (arrayCount) + (arrayCount * 8) (garbage)
        const arrayCount = origDataView.getInt16(this.headerStart + 8, true);
        const frameCountOffset = writePtr + 8 + 2 + (arrayCount * 8);
        finalDv.setInt32(frameCountOffset, framesCount, true);
        
        writePtr += headerSize;
        
        // 4. Write new animation body
        for(let f = 0; f < framesCount; f++) {
            const frame = animationData.frames[f];
            const boneMap = {};
            if(frame.bones) frame.bones.forEach(b => boneMap[b.boneId] = b);
            
            for(let b = 0; b < this.bonesCount; b++) {
                const id = this.boneIds[b];
                const boneData = boneMap[id] || { position: [0,0,0], rotation: [0,0,0,1] };
                
                // Position (float16)
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[0]), true); writePtr += 2;
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[1]), true); writePtr += 2;
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[2]), true); writePtr += 2;
                
                // Rotation (compressed)
                const packed = compressQuaternion(
                    boneData.rotation[0], 
                    boneData.rotation[1], 
                    boneData.rotation[2], 
                    boneData.rotation[3]
                );
                finalDv.setUint16(writePtr, packed[0], true); writePtr += 2;
                finalDv.setUint16(writePtr, packed[1], true); writePtr += 2;
                finalDv.setUint16(writePtr, packed[2], true); writePtr += 2;
            }
        }
        
        // 5. Copy footer data (if any)
        if (footerSize > 0) {
            finalBuffer.set(
                new Uint8Array(this.originalFileBuffer.slice(this.animationDataEnd)),
                writePtr
            );
        }
        
        return finalBuffer;
    }
}

export const animationParser = new AnimationParser();
