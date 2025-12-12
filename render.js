import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SKELETON_DEFINITION, NAME_TO_ID } from './constants.js';

class Renderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.rootGroup = null;
        this.boneIdMap = {};
    }

    init(containerId) {
        const container = document.getElementById(containerId);
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.add(new THREE.GridHelper(500, 50, 0x333333, 0x111111));
        this.scene.add(new THREE.AxesHelper(20));

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 2000);
        this.camera.position.set(0, 150, 300);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.update();

        // Lights
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(100, 200, 100);
        this.scene.add(dirLight);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Resize Listener
        window.addEventListener('resize', () => {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        });

        this.startLoop();
    }

    buildSkeleton() {
        if (this.rootGroup) this.scene.remove(this.rootGroup);
        this.boneIdMap = {};

        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const boneNodes = [];

        lines.forEach(line => {
            if (!line.trim()) return;
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            const rotMatch = line.match(/G\.Rot \(quat\):\(([^)]+)\)/);

            if (nameMatch && posMatch && rotMatch) {
                const pos = posMatch[1].split(',').map(parseFloat);
                const rot = rotMatch[1].split(',').map(parseFloat);
                boneNodes.push({
                    name: nameMatch[1],
                    level: depth,
                    globalPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
                    globalRot: new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3])
                });
            }
        });

        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);
        const stack = [];

        boneNodes.forEach(node => {
            const bone = new THREE.Bone();
            bone.name = node.name;
            bone.userData = {
                originalGlobalPos: node.globalPos.clone(),
                originalGlobalRot: node.globalRot.clone()
            };

            const id = NAME_TO_ID[node.name];
            if (id !== undefined) this.boneIdMap[id] = bone;

            while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
                stack.pop();
            }

            if (stack.length > 0) {
                const parent = stack[stack.length - 1].bone;
                parent.add(bone);
                
                const parentMatrix = new THREE.Matrix4().compose(
                    parent.userData.originalGlobalPos,
                    parent.userData.originalGlobalRot,
                    new THREE.Vector3(1, 1, 1)
                ).invert();
                
                const globalMatrix = new THREE.Matrix4().compose(
                    node.globalPos,
                    node.globalRot,
                    new THREE.Vector3(1, 1, 1)
                );
                
                const localMatrix = parentMatrix.multiply(globalMatrix);
                const localPos = new THREE.Vector3();
                const localRot = new THREE.Quaternion();
                const localScale = new THREE.Vector3();
                localMatrix.decompose(localPos, localRot, localScale);
                
                bone.position.copy(localPos);
                bone.quaternion.copy(localRot);
            } else {
                this.rootGroup.add(bone);
                bone.position.copy(node.globalPos);
                bone.quaternion.copy(node.globalRot);
            }
            stack.push({ bone: bone, level: node.level });
        });

        this.rootGroup.updateMatrixWorld(true);
        this.scene.add(new THREE.SkeletonHelper(this.rootGroup.children[0]));
    }

    applyFrame(frameData) {
        if (!frameData || !frameData.bones || !this.rootGroup) return;
        frameData.bones.forEach(boneData => {
            const bone = this.boneIdMap[boneData.boneId];
            if (bone) {
                bone.position.set(...boneData.position);
                bone.quaternion.set(...boneData.rotation);
            }
        });
        this.rootGroup.updateMatrixWorld(true);
    }

    startLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
}

export const renderer = new Renderer();
