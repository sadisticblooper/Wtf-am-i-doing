import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SKELETON_DEFINITION, NAME_TO_ID } from './constants.js';

export class SceneController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.bones = {}; 
        this.boneIdMap = {}; 
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);

        // Grid & Helpers
        this.scene.add(new THREE.GridHelper(500, 50, 0x374151, 0x1f2937));
        this.scene.add(new THREE.AxesHelper(20));

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 2000);
        this.camera.position.set(0, 150, 300);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.update();

        // Lights
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(100, 200, 100);
        this.scene.add(dirLight);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        this.buildSkeleton();

        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });

        this.animate();
    }

    buildSkeleton() {
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const stack = [];
        const rootBones = [];

        lines.forEach(line => {
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            const rotMatch = line.match(/G\.Rot \(quat\):\(([^)]+)\)/);

            if (!nameMatch) return;
            const name = nameMatch[1];
            
            // Initial transform from definition
            const pos = posMatch[1].split(',').map(parseFloat);
            const rot = rotMatch[1].split(',').map(parseFloat);

            const bone = new THREE.Bone();
            bone.name = name;
            
            // Store for updates
            this.bones[name] = bone;
            const id = NAME_TO_ID[name];
            if (id !== undefined) this.boneIdMap[id] = bone;

            // Logic to convert Global Definition to Local Hierarchy
            // For visualization simply attach and let Three handle the graph
            if (depth === 0) {
                this.scene.add(bone);
                rootBones.push(bone);
                stack[0] = bone;
                // Set initial world transform
                bone.position.set(...pos);
                bone.quaternion.set(...rot);
            } else {
                const parent = stack[depth - 1];
                parent.attach(bone); // Attach keeps world transform
                bone.position.set(...pos); // Set Global pos 
                bone.quaternion.set(...rot); // Set Global rot
                bone.updateMatrixWorld();
                parent.attach(bone); // Re-attach to enforce hierarchy
                stack[depth] = bone;
            }
        });

        if (rootBones.length > 0) {
            this.scene.add(new THREE.SkeletonHelper(rootBones[0]));
        }
    }

    applyFrame(frameData) {
        if (!frameData || !frameData.bones) return;
        frameData.bones.forEach(boneData => {
            const bone = this.boneIdMap[boneData.boneId];
            if (bone) {
                bone.position.set(...boneData.position);
                bone.quaternion.set(...boneData.rotation);
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
