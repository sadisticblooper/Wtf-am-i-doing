// --- Utils / Math Helpers ---

function halfToFloat(h) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
    else if (e === 0x1f) return f ? NaN : (s ? -1 : 1) * Infinity;
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
}

function float32ToFloat16(val) {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = val;
    const x = int32View[0];
    const bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) {
        if (e !== 255) return bits | 0x7c00;
        return bits | 0x7c00 | (m !== 0 ? 1 : 0);
    }
    if (e < 113) {
        m |= 0x0800;
        return bits | ((m >> (114 - e)) + ((m >> (113 - e)) & 1));
    }
    return bits | ((e - 112) << 10) | (m >> 1);
}

function parseCompressedQuaternion(v0, v1, v2) {
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

function compressQuaternion(q0, q1, q2, q3) {
    // Normalize
    let len = Math.sqrt(q0*q0 + q1*q1 + q2*q2 + q3*q3);
    if (len === 0) { q0=0; q1=0; q2=0; q3=1; len=1; }
    q0/=len; q1/=len; q2/=len; q3/=len;

    const arr = [q0, q1, q2, q3];
    let maxIdx = 0;
    let maxVal = Math.abs(q0);
    for(let i=1; i<4; i++){
        if(Math.abs(arr[i]) > maxVal) { maxVal = Math.abs(arr[i]); maxIdx = i; }
    }

    const signBit = arr[maxIdx] < 0 ? 1 : 0;
    let a, b, c;

    if (maxIdx === 0)      { a=q1; b=q2; c=q3; }
    else if (maxIdx === 1) { a=q0; b=q2; c=q3; }
    else if (maxIdx === 2) { a=q0; b=q1; c=q3; }
    else                   { a=q0; b=q1; c=q2; }

    const scale = 1.0 / 32767.0;
    const maxValue = 1.4142135;
    const shift = 0.70710677;
    const factor = 1.0 / (scale * maxValue);

    const clamp = (v) => Math.max(0, Math.min(v, 0x7FFF));
    const aBits = clamp(Math.round((a + shift) * factor));
    const bBits = clamp(Math.round((b + shift) * factor));
    const cBits = clamp(Math.round((c + shift) * factor));

    const v0 = (signBit << 15) | (maxIdx << 13) | (aBits >> 2);
    const v1 = ((aBits & 3) << 14) | (bBits >> 1);
    const v2 = ((bBits & 1) << 15) | cBits;

    return [v0, v1, v2];
}

// --- Main Parser Class ---

class AnimationParser {
    constructor() {
        this.originalFileBuffer = null;
        this.originalHeaderBuffer = null;
        this.headerStart = 0;
        this.headerEnd = 0;
        this.animationDataStart = 0;
        this.animationDataEnd = 0;
        this.boneIds = [];
        this.bonesCount = 0;
        this.origFramesCount = 0;
        this.EXPECTED_HEADER = 457546134634734n;
        this.frameSize = 0; 
    }

    async parse(arrayBuffer) {
        try {
            this.originalFileBuffer = arrayBuffer;
            const dataView = new DataView(arrayBuffer);
            
            // 1. Find header
            this.headerStart = -1;
            for(let i = 0; i < arrayBuffer.byteLength - 8; i++) {
                if (dataView.getBigUint64(i, true) === this.EXPECTED_HEADER) {
                    this.headerStart = i;
                    break;
                }
            }
            
            if (this.headerStart === -1 && dataView.getBigUint64(0, true) === this.EXPECTED_HEADER) {
                this.headerStart = 0;
            }
            
            if (this.headerStart === -1) {
                throw new Error('Invalid file signature');
            }

            let offset = this.headerStart + 8; // Skip magic
            
            // 2. Parse header
            const arrayCount = dataView.getInt16(offset, true); offset += 2;
            const garbageSize = arrayCount * 8;
            offset += garbageSize;
            
            this.origFramesCount = dataView.getInt32(offset, true); offset += 4;
            this.bonesCount = dataView.getInt32(offset, true); offset += 4;
            
            this.frameSize = this.bonesCount * 12;
            
            this.boneIds = [];
            for (let i = 0; i < this.bonesCount; i++) {
                this.boneIds.push(dataView.getInt16(offset, true));
                offset += 2;
            }
            
            this.headerEnd = offset;
            this.animationDataStart = this.headerEnd;
            this.animationDataEnd = this.headerEnd + (this.origFramesCount * this.frameSize);
            this.originalHeaderBuffer = arrayBuffer.slice(0, this.headerEnd);
            
            // Capture original trailing data
            const trailingData = arrayBuffer.slice(this.animationDataEnd);

            // 3. Parse animation body
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
                boneIds: this.boneIds,
                trailingData: trailingData
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
        
        const preHeaderSize = this.headerStart; 
        const headerSize = this.headerEnd - this.headerStart;
        
        // Determine footer buffer: Use modified trailing data if present, otherwise fallback to original
        let footerBuffer;
        if (animationData.trailingData && animationData.trailingData.byteLength > 0) {
            footerBuffer = new Uint8Array(animationData.trailingData);
        } else {
            footerBuffer = new Uint8Array(this.originalFileBuffer.slice(this.animationDataEnd));
        }
        
        const totalSize = preHeaderSize + headerSize + bodySize + footerBuffer.byteLength;
        const finalBuffer = new Uint8Array(totalSize);
        const finalDv = new DataView(finalBuffer.buffer);
        
        let writePtr = 0;
        
        // Copy pre-header
        if (preHeaderSize > 0) {
            finalBuffer.set(new Uint8Array(this.originalFileBuffer.slice(0, this.headerStart)), writePtr);
            writePtr += preHeaderSize;
        }
        
        // Copy header
        const headerBytes = new Uint8Array(this.originalFileBuffer.slice(this.headerStart, this.headerEnd));
        finalBuffer.set(headerBytes, writePtr);
        
        // Update frame count
        const arrayCount = origDataView.getInt16(this.headerStart + 8, true);
        const frameCountOffset = writePtr + 8 + 2 + (arrayCount * 8);
        finalDv.setInt32(frameCountOffset, framesCount, true);
        
        writePtr += headerSize;
        
        // Write animation body
        for(let f = 0; f < framesCount; f++) {
            const frame = animationData.frames[f];
            const boneMap = {};
            if(frame.bones) frame.bones.forEach(b => boneMap[b.boneId] = b);
            
            for(let b = 0; b < this.bonesCount; b++) {
                const id = this.boneIds[b];
                const boneData = boneMap[id] || { position: [0,0,0], rotation: [0,0,0,1] };
                
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[0]), true); writePtr += 2;
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[1]), true); writePtr += 2;
                finalDv.setUint16(writePtr, float32ToFloat16(boneData.position[2]), true); writePtr += 2;
                
                const packed = compressQuaternion(boneData.rotation[0], boneData.rotation[1], boneData.rotation[2], boneData.rotation[3]);
                finalDv.setUint16(writePtr, packed[0], true); writePtr += 2;
                finalDv.setUint16(writePtr, packed[1], true); writePtr += 2;
                finalDv.setUint16(writePtr, packed[2], true); writePtr += 2;
            }
        }
        
        // Copy footer (Trailing Data)
        if (footerBuffer.byteLength > 0) {
            finalBuffer.set(footerBuffer, writePtr);
        }
        
        return finalBuffer;
    }
}

export const animationParser = new AnimationParser();
