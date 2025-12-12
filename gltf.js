import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NAME_TO_ID, BONE_MAP, SKELETON_DEFINITION } from './constants.js';

export class GLTFHandler {
    constructor() {
        this.loader = new GLTFLoader();
        this.exporter = new GLTFExporter();
    }

    // --- IMPORT ---
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

                // Find compatible bones
                const sceneBones = [];
                gltf.scene.traverse(obj => {
                    if (obj.isBone) {
                        const id = NAME_TO_ID[obj.name];
                        if (id !== undefined) sceneBones.push({ node: obj, id: id });
                    }
                });

                if (sceneBones.length === 0) {
                    reject(new Error("No SF3-compatible bones found"));
                    return;
                }

                const frames = [];
                for (let f = 0; f < totalFrames; f++) {
                    mixer.setTime(f * frameTime);
                    gltf.scene.updateMatrixWorld(true);
                    
                    const frameBones = sceneBones.map(b => ({
                        boneId: b.id,
                        position: [b.node.position.x, b.node.position.y, b.node.position.z],
                        rotation: [b.node.quaternion.x, b.node.quaternion.y, b.node.quaternion.z, b.node.quaternion.w]
                    }));
                    frames.push({ bones: frameBones });
                }

                // Handle Trailing Data Multiplication logic
                let resultTrailingData = originalAnimationData ? originalAnimationData.trailingData : null;
                let multiplier = 1;

                if (originalAnimationData && originalAnimationData.framesCount > 0) {
                    const factor = totalFrames / originalAnimationData.framesCount;
                    if (factor > 1 && originalAnimationData.trailingData) {
                        multiplier = Math.ceil(factor);
                        if (multiplier > 1) {
                            const chunks = [];
                            for (let i = 0; i < multiplier; i++) chunks.push(originalAnimationData.trailingData);
                            
                            // Concat buffers
                            const totalLen = chunks.reduce((sum, b) => sum + b.byteLength, 0);
                            const resArr = new Uint8Array(totalLen);
                            let off = 0;
                            for(const c of chunks) { resArr.set(new Uint8Array(c), off); off += c.byteLength; }
                            resultTrailingData = resArr.buffer;
                        }
                    }
                }

                resolve({
                    frames,
                    framesCount: totalFrames,
                    bonesCount: sceneBones.length,
                    trailingData: resultTrailingData,
                    trailingDataMultiplier: multiplier
                });

            }, (err) => reject(err));
        });
    }

    // --- EXPORT ---
    exportGLTF(animationData, fps = 30) {
        return new Promise((resolve, reject) => {
            // Build temporary scene for export
            const { root, bones } = this.buildSkeletonForExport();
            const skinnedMesh = this.createDummySkinnedMesh(bones);
            const scene = new THREE.Scene();
            scene.add(skinnedMesh);
            scene.add(root);

            const tracks = [];
            const times = Array.from({length: animationData.framesCount}, (_, i) => i / fps);

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

            this.exporter.parse(scene, (gltf) => {
                const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'application/gltf+json' });
                resolve(blob);
            }, reject, { animations: [clip] });
        });
    }

    buildSkeletonForExport() {
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const boneNodes = [];
        lines.forEach(line => {
            if (!line.trim()) return;
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            if (!nameMatch) return;
            const pos = posMatch ? posMatch[1].split(',').map(Number) : [0,0,0];
            boneNodes.push({ name: nameMatch[1], level: depth, globalPos: new THREE.Vector3(...pos) });
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
                stack[0] = { bone, level: node.level, globalPos: node.globalPos.clone() };
            } else {
                while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
                if (stack.length > 0) {
                    const parentInfo = stack[stack.length - 1];
                    const parent = parentInfo.bone;
                    bone.position.copy(node.globalPos.clone().sub(parentInfo.globalPos));
                    parent.add(bone);
                    stack.push({ bone, level: node.level, globalPos: node.globalPos.clone() });
                }
            }
        });
        if(root) root.updateMatrixWorld(true);
        return { root, bones };
    }

    createDummySkinnedMesh(bones) {
        // Create a basic mesh so GLTF export includes skinning data
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({ skinning: true });
        const skinnedMesh = new THREE.SkinnedMesh(boxGeo, mat);
        const skeleton = new THREE.Skeleton(bones);
        skinnedMesh.add(bones[0]); 
        skinnedMesh.bind(skeleton);
        return skinnedMesh;
    }
}

export const gltfHandler = new GLTFHandler();
