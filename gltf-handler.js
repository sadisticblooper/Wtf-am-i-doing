import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NAME_TO_ID, BONE_MAP, SKELETON_DEFINITION } from './constants.js';

export class GLTFHandler {
    constructor() {
        this.loader = new GLTFLoader();
        this.exporter = new GLTFExporter();
    }

    // --- IMPORT: GLTF -> AnimationData ---
    async importGLTF(file, fps = 30) {
        const url = URL.createObjectURL(file);
        
        return new Promise((resolve, reject) => {
            this.loader.load(url, (gltf) => {
                URL.revokeObjectURL(url);
                
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
                        // Fuzzy match name? Or exact?
                        // Let's try exact match with map first
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
                    // Force matrix update to get animated local transforms
                    gltf.scene.updateMatrixWorld(true);

                    const frameBones = sceneBones.map(b => {
                        // SF3 format expects LOCAL transform relative to parent
                        return {
                            boneId: b.id,
                            position: [b.node.position.x, b.node.position.y, b.node.position.z],
                            rotation: [b.node.quaternion.x, b.node.quaternion.y, b.node.quaternion.z, b.node.quaternion.w]
                        };
                    });
                    frames.push({ bones: frameBones });
                }

                resolve({
                    frames,
                    framesCount: totalFrames,
                    bonesCount: sceneBones.length
                    // Note: We don't overwrite boneIds array in app.js if we import. 
                    // We assume Base File provides the ID list order.
                });

            }, undefined, (err) => reject(err));
        });
    }

    // --- EXPORT: AnimationData -> GLTF ---
    exportGLTF(animationData, fps = 30) {
        return new Promise((resolve, reject) => {
            // 1. Build Skeleton with user-provided logic
            const { root, bones } = this.buildSkeletonHierarchy();
            
            // 2. Create Skinned Mesh (The Armature)
            const skinnedMesh = this.createDummySkinnedMesh(bones);
            const scene = new THREE.Scene();
            scene.add(skinnedMesh);
            scene.add(root); // Add root explicitly to scene graph

            // 3. Create Keyframe Tracks
            const tracks = [];
            const times = [];
            for(let f=0; f<animationData.framesCount; f++) times.push(f / fps);

            // Iterate all defined bones to make tracks
            Object.values(BONE_MAP).forEach(boneName => {
                const id = NAME_TO_ID[boneName];
                // Check if this bone exists in the hierarchy we built
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
                        // Fallback: use rest pose
                        posValues.push(boneNode.position.x, boneNode.position.y, boneNode.position.z);
                        rotValues.push(boneNode.quaternion.x, boneNode.quaternion.y, boneNode.quaternion.z, boneNode.quaternion.w);
                    }
                }

                // Create Tracks
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

    // Parsers SKELETON_DEFINITION into actual THREE.Bone hierarchy
    buildSkeletonHierarchy() {
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const stack = [];
        const bones = [];
        let root = null;

        lines.forEach(line => {
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            
            if (!nameMatch) return;
            const name = nameMatch[1];
            // Only used for Rest Pose calculation
            const pos = posMatch ? posMatch[1].split(',').map(Number) : [0,0,0];

            const bone = new THREE.Bone();
            bone.name = name;
            bones.push(bone);

            if (depth === 0) {
                root = bone;
                bone.position.set(pos[0], pos[1], pos[2]);
                stack[0] = { node: bone, gPos: new THREE.Vector3(...pos) };
            } else {
                const parentInfo = stack[depth - 1];
                const parent = parentInfo.node;
                const gPos = new THREE.Vector3(...pos);
                
                parent.add(bone);
                
                // Set local pos relative to parent
                const localPos = gPos.clone().sub(parentInfo.gPos);
                bone.position.copy(localPos);
                
                stack[depth] = { node: bone, gPos: gPos };
            }
        });

        return { root, bones };
    }

    // Logic provided by user to ensure correct Armature export
    createDummySkinnedMesh(bones) {
        const BONE_VISUAL_SIZE = 2.0; 
        const boxGeo = new THREE.BoxGeometry(BONE_VISUAL_SIZE, BONE_VISUAL_SIZE, BONE_VISUAL_SIZE);
        const posArr = [], normArr = [], skinIdxArr = [], skinWtArr = [], indicesArr = [];
        let vertexOffset = 0;
        
        // Ensure matrices are up to date
        if(bones[0].parent) bones[0].parent.updateMatrixWorld(true);
        else bones[0].updateMatrixWorld(true);

        for (let i = 0; i < bones.length; i++) {
            const bone = bones[i];
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);

            const count = boxGeo.attributes.position.count;
            for (let v = 0; v < count; v++) {
                // Bake world position into mesh vertex
                posArr.push(
                    boxGeo.attributes.position.getX(v) + worldPos.x,
                    boxGeo.attributes.position.getY(v) + worldPos.y,
                    boxGeo.attributes.position.getZ(v) + worldPos.z
                );
                normArr.push(boxGeo.attributes.normal.getX(v), boxGeo.attributes.normal.getY(v), boxGeo.attributes.normal.getZ(v));
                
                // Rigid bind: Index = i, Weight = 1.0
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
        
        // Critical step for hierarchy recognition
        skinnedMesh.add(bones[0]); 
        skinnedMesh.bind(skeleton);
        
        return skinnedMesh;
    }
}

export const gltfHandler = new GLTFHandler();
