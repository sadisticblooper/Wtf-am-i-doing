
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NAME_TO_ID, BONE_MAP, SKELETON_DEFINITION } from './constants.js';

export class GLTFHandler {
    constructor() {
        this.loader = new GLTFLoader();
        this.exporter = new GLTFExporter();
    }

    // Helper function from lengthenAnimation logic
    gcd(a, b) {
        return b === 0 ? a : this.gcd(b, a % b);
    }

    // --- IMPORT: GLTF -> AnimationData ---
    async importGLTF(file, fps = 30, originalAnimationData = null) {
        const buffer = await file.arrayBuffer();
        
        return new Promise((resolve, reject) => {
            this.loader.parse(buffer, '', (gltf) => {
                
                if (!gltf.animations || gltf.animations.length === 0) {
                    reject(new Error("No animations found in GLTF"));
                    return;
                }

                const clip = gltf.animations[0];
                const mixer = new THREE.AnimationMixer(gltf.scene);
                const action = mixer.clipAction(clip);
                action.play();

                const duration = clip.duration;
                const totalFrames = Math.max(1, Math.ceil(duration * fps));
                const frameTime = 1 / fps;

                // Scan for bones
                const sceneBones = [];
                gltf.scene.traverse(obj => {
                    if (obj.isBone) {
                        const id = NAME_TO_ID[obj.name];
                        if (id !== undefined) {
                            sceneBones.push({ node: obj, id: id });
                        }
                    }
                });

                if (sceneBones.length === 0) {
                    reject(new Error("No SF3-compatible bones found (check bone names)"));
                    return;
                }

                const frames = [];

                for (let f = 0; f < totalFrames; f++) {
                    mixer.setTime(f * frameTime);
                    gltf.scene.updateMatrixWorld(true);

                    const frameBones = sceneBones.map(b => {
                        return {
                            boneId: b.id,
                            position: [b.node.position.x, b.node.position.y, b.node.position.z],
                            rotation: [b.node.quaternion.x, b.node.quaternion.y, b.node.quaternion.z, b.node.quaternion.w]
                        };
                    });
                    frames.push({ bones: frameBones });
                }

                // Handle trailing/remaining data multiplication if original animation exists
                let trailingDataInfo = '';
                if (originalAnimationData && originalAnimationData.originalFileBuffer) {
                    const originalFrames = originalAnimationData.framesCount || 0;
                    const importedFrames = totalFrames;
                    
                    // Calculate how many times we need to repeat the original trailing data
                    // to cover the imported GLTF frames (nearest higher multiple)
                    const repetitionsNeeded = Math.ceil(importedFrames / originalFrames);
                    
                    if (repetitionsNeeded > 1 && originalAnimationData.trailingData) {
                        trailingDataInfo = ` (trailing data ×${repetitionsNeeded})`;
                        
                        // Multiply trailing data like in lengthenAnimation
                        if (originalAnimationData.trailingData.byteLength > 0) {
                            const trailingChunks = [];
                            for (let i = 0; i < repetitionsNeeded; i++) {
                                trailingChunks.push(originalAnimationData.trailingData);
                            }
                            const multipliedTrailingData = this.concatArrayBuffers(trailingChunks);
                            
                            resolve({
                                frames,
                                framesCount: totalFrames,
                                bonesCount: sceneBones.length,
                                trailingData: multipliedTrailingData,
                                trailingDataMultiplied: repetitionsNeeded
                            });
                            return;
                        }
                    }
                }

                console.log(`Imported ${totalFrames} frames from GLTF${trailingDataInfo}`);

                resolve({
                    frames,
                    framesCount: totalFrames,
                    bonesCount: sceneBones.length,
                    trailingData: null
                });

            }, (err) => reject(err));
        });
    }

    // --- EXPORT: AnimationData -> GLTF ---
    exportGLTF(animationData, fps = 30) {
        return new Promise((resolve, reject) => {
            const { root, bones } = this.buildSkeletonHierarchy();
            const skinnedMesh = this.createDummySkinnedMesh(bones);
            const scene = new THREE.Scene();
            scene.add(skinnedMesh);
            scene.add(root);

            const tracks = [];
            const times = [];
            for(let f=0; f<animationData.framesCount; f++) times.push(f / fps);

            Object.values(BONE_MAP).forEach(boneName => {
                const id = NAME_TO_ID[boneName];
                const boneNode = bones.find(b => b.name === boneName);
                if(!boneNode) return;

                const posValues = [];
                const rotValues = [];

                for(let f=0; f<animationData.framesCount; f++) {
                    const frame = animationData.frames[f];
                    const bData = frame.bones.find(b => b.boneId === id);
                    if(bData) {
                        posValues.push(...bData.position);
                        rotValues.push(...bData.rotation);
                    } else {
                        posValues.push(boneNode.position.x, boneNode.position.y, boneNode.position.z);
                        rotValues.push(boneNode.quaternion.x, boneNode.quaternion.y, boneNode.quaternion.z, boneNode.quaternion.w);
                    }
                }

                if(posValues.length > 0) {
                    tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, posValues));
                    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, rotValues));
                }
            });

            const clip = new THREE.AnimationClip("SF3_Animation", -1, tracks);

            this.exporter.parse(
                scene,
                (gltf) => {
                    const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'application/gltf+json' });
                    resolve(blob);
                },
                (err) => reject(err),
                { animations: [clip] }
            );
        });
    }

    buildSkeletonHierarchy() {
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const boneNodes = [];
        
        // First pass: parse all bones
        lines.forEach(line => {
            if (!line.trim()) return;
            
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            
            if (!nameMatch) return;
            const name = nameMatch[1];
            const pos = posMatch ? posMatch[1].split(',').map(Number) : [0,0,0];

            boneNodes.push({
                name: name,
                level: depth,
                globalPos: new THREE.Vector3(pos[0], pos[1], pos[2])
            });
        });

        const bones = [];
        const stack = [];
        let root = null;

        boneNodes.forEach(node => {
            const bone = new THREE.Bone();
            bone.name = node.name;
            bones.push(bone);

            if (node.level === 0) {
                root = bone;
                bone.position.copy(node.globalPos);
                stack[0] = { bone: bone, level: node.level, globalPos: node.globalPos.clone() };
            } else {
                // Find parent based on indentation level
                while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
                    stack.pop();
                }
                
                if (stack.length > 0) {
                    const parentInfo = stack[stack.length - 1];
                    const parent = parentInfo.bone;
                    
                    // Calculate local position
                    const localPos = node.globalPos.clone().sub(parentInfo.globalPos);
                    parent.add(bone);
                    bone.position.copy(localPos);
                    
                    stack.push({ bone: bone, level: node.level, globalPos: node.globalPos.clone() });
                }
            }
        });

        // Update matrices
        if (root) {
            root.updateMatrixWorld(true);
        }

        return { root, bones };
    }

    createDummySkinnedMesh(bones) {
        const BONE_VISUAL_SIZE = 2.0; 
        const boxGeo = new THREE.BoxGeometry(BONE_VISUAL_SIZE, BONE_VISUAL_SIZE, BONE_VISUAL_SIZE);
        const posArr = [], normArr = [], skinIdxArr = [], skinWtArr = [], indicesArr = [];
        let vertexOffset = 0;
        
        if(bones[0].parent) bones[0].parent.updateMatrixWorld(true);
        else bones[0].updateMatrixWorld(true);

        for (let i = 0; i < bones.length; i++) {
            const bone = bones[i];
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);

            const count = boxGeo.attributes.position.count;
            for (let v = 0; v < count; v++) {
                posArr.push(
                    boxGeo.attributes.position.getX(v) + worldPos.x,
                    boxGeo.attributes.position.getY(v) + worldPos.y,
                    boxGeo.attributes.position.getZ(v) + worldPos.z
                );
                normArr.push(boxGeo.attributes.normal.getX(v), boxGeo.attributes.normal.getY(v), boxGeo.attributes.normal.getZ(v));
                skinIdxArr.push(i, 0, 0, 0);
                skinWtArr.push(1, 0, 0, 0);
            }
            const indexAttribute = boxGeo.index;
            for (let k = 0; k < indexAttribute.count; k++) {
                indicesArr.push(indexAttribute.getX(k) + vertexOffset);
            }
            vertexOffset += count;
        }

        const finalGeo = new THREE.BufferGeometry();
        finalGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        finalGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
        finalGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdxArr, 4));
        finalGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWtArr, 4));
        finalGeo.setIndex(indicesArr);

        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ccff, 
            roughness: 0.4, 
            metalness: 0.1, 
            skinning: true 
        });
        
        const skinnedMesh = new THREE.SkinnedMesh(finalGeo, mat);
        const skeleton = new THREE.Skeleton(bones);
        
        skinnedMesh.add(bones[0]); 
        skinnedMesh.bind(skeleton);
        
        return skinnedMesh;
    }

    // Helper function to concatenate ArrayBuffers (from lengthenAnimation logic)
    concatArrayBuffers(buffers) {
        if (!buffers || buffers.length === 0) {
            return new ArrayBuffer(0);
        }
        
        if (buffers.length === 1) {
            return buffers[0];
        }
        
        const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
        const result = new Uint8Array(totalLength);
        
        let offset = 0;
        for (const buffer of buffers) {
            result.set(new Uint8Array(buffer), offset);
            offset += buffer.byteLength;
        }
        
        return result.buffer;
    }
}

export const gltfHandler = new GLTFHandler();
