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

                // Identify Bones
                const sceneBones = [];
                gltf.scene.traverse(obj => {
                    if (obj.isBone && NAME_TO_ID[obj.name] !== undefined) {
                        sceneBones.push({ node: obj, id: NAME_TO_ID[obj.name] });
                    }
                });

                if (sceneBones.length === 0) {
                    reject(new Error("No matching SF3 bones found in GLTF scene"));
                    return;
                }

                // Sort bones by ID to maintain consistent order
                sceneBones.sort((a, b) => a.id - b.id);
                const boneIds = sceneBones.map(b => b.id);

                const frames = [];

                for (let f = 0; f < totalFrames; f++) {
                    mixer.setTime(f * frameTime);
                    // Force update
                    gltf.scene.updateMatrixWorld(true);

                    const frameBones = sceneBones.map(b => {
                        // We use position/quaternion directly as they represent local transform
                        // which is what the binary format expects relative to parent
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
                    bonesCount: boneIds.length,
                    boneIds
                });

            }, undefined, (err) => reject(err));
        });
    }

    // --- EXPORT: AnimationData -> GLTF ---
    exportGLTF(animationData, fps = 30) {
        return new Promise((resolve, reject) => {
            // 1. Reconstruct Skeleton Scene
            const { root, bonesMap } = this.buildSkeletonScene();
            
            // 2. Create Animation Clip
            const tracks = [];
            const times = [];
            for(let f=0; f<animationData.framesCount; f++) times.push(f / fps);

            const boneIds = animationData.boneIds;
            
            // Prepare tracks per bone
            boneIds.forEach(id => {
                const name = BONE_MAP[id];
                if(!name || !bonesMap[name]) return;

                const posValues = [];
                const rotValues = [];

                for(let f=0; f<animationData.framesCount; f++) {
                    // Find bone data in this frame
                    const boneData = animationData.frames[f].bones.find(b => b.boneId === id);
                    if(boneData) {
                        posValues.push(...boneData.position);
                        rotValues.push(...boneData.rotation);
                    } else {
                        // Fallback to identity/rest if missing
                        posValues.push(0,0,0);
                        rotValues.push(0,0,0,1);
                    }
                }

                tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, posValues));
                tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotValues));
            });

            const clip = new THREE.AnimationClip("SF3_Anim", -1, tracks);

            // 3. Export
            const scene = new THREE.Scene();
            scene.add(root);
            
            // Create Dummy Mesh for visualization
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, skinning: true });
            const mesh = new THREE.SkinnedMesh(geometry, material);
            const skeleton = new THREE.Skeleton(Object.values(bonesMap));
            mesh.add(root);
            mesh.bind(skeleton);
            scene.add(mesh);

            this.exporter.parse(
                scene,
                (gltf) => {
                    const blob = new Blob([JSON.stringify(gltf)], { type: 'application/json' });
                    resolve(blob);
                },
                (err) => reject(err),
                { animations: [clip] }
            );
        });
    }

    buildSkeletonScene() {
        // Parses SKELETON_DEFINITION from constants
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const stack = [];
        const bonesMap = {};
        let root = null;

        lines.forEach(line => {
            const depth = line.search(/\S|$/) / 2; // Assuming 2 spaces indentation
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            
            if (!nameMatch) return;
            const name = nameMatch[1];
            const pos = posMatch ? posMatch[1].split(',').map(Number) : [0,0,0];

            const bone = new THREE.Bone();
            bone.name = name;
            // The definition uses global positions, but ThreeJS needs hierarchy.
            // We set local position relative to parent.
            
            bonesMap[name] = bone;

            if (depth === 0) {
                root = bone;
                bone.position.set(pos[0], pos[1], pos[2]);
                stack[0] = { node: bone, gPos: new THREE.Vector3(...pos) };
            } else {
                const parentInfo = stack[depth - 1];
                const parent = parentInfo.node;
                const gPos = new THREE.Vector3(...pos);
                
                parent.add(bone);
                
                // Calculate local pos
                const localPos = gPos.clone().sub(parentInfo.gPos);
                bone.position.copy(localPos);
                
                stack[depth] = { node: bone, gPos: gPos };
            }
        });

        return { root, bonesMap };
    }
}

export const gltfHandler = new GLTFHandler();
