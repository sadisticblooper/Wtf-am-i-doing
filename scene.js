import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SKELETON_DEFINITION, NAME_TO_ID, BONE_MAP } from './constants.js';

export class SceneController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;
        this.skeleton = null;
        this.bones = {}; // Map Name -> THREE.Bone
        this.boneIdMap = {}; // Map ID -> THREE.Bone
        this.skeletonHelper = null;
        this.init();
    }

    init() {
        // 1. Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);

        // Grid
        const gridHelper = new THREE.GridHelper(500, 50, 0x374151, 0x1f2937);
        this.scene.add(gridHelper);

        // Axes
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);

        // 2. Setup Camera
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 2000);
        this.camera.position.set(0, 150, 300);

        // 3. Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 4. Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.update();

        // 5. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 200, 100);
        this.scene.add(dirLight);

        // 6. Build Skeleton from Constants
        this.buildSkeleton();

        // 7. Event Listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Start Loop
        this.animate();
    }

    // Parses the custom text format in SKELETON_DEFINITION
    buildSkeleton() {
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const boneStack = []; // To track hierarchy based on indentation
        const rootBones = [];

        lines.forEach(line => {
            // Determine depth by counting leading spaces (2 spaces per level)
            const leadingSpaces = line.search(/\S|$/);
            const depth = leadingSpaces / 2;

            // Regex to parse: "name" [BONE] | G.Pos:(x, y, z) | G.Rot (quat):(x, y, z, w)
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            const rotMatch = line.match(/G\.Rot \(quat\):\(([^)]+)\)/);

            if (!nameMatch || !posMatch || !rotMatch) return;

            const name = nameMatch[1];
            const pos = posMatch[1].split(',').map(parseFloat);
            const rot = rotMatch[1].split(',').map(parseFloat);

            const bone = new THREE.Bone();
            bone.name = name;

            // IMPORTANT: The definition uses Global Positions/Rotations.
            // Three.js bones use Local relative to parent.
            // Strategy: Add to scene (world), apply Global, then attach to parent (converts to local).
            
            // 1. Set Global Transform temporarily
            bone.position.set(pos[0], pos[1], pos[2]);
            bone.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
            
            // Fix quaternion normalization if needed
            bone.quaternion.normalize();

            // Store in maps
            this.bones[name] = bone;
            const id = NAME_TO_ID[name];
            if (id !== undefined) {
                this.boneIdMap[id] = bone;
            }

            // Hierarchy Logic
            if (depth === 0) {
                // Root bone
                this.scene.add(bone);
                rootBones.push(bone);
                boneStack.length = 0; // Reset stack
                boneStack.push(bone);
            } else {
                // Find parent
                while (boneStack.length > depth) {
                    boneStack.pop();
                }
                const parent = boneStack[boneStack.length - 1];
                
                // Attach: This method keeps the child's world transform while reparenting
                parent.attach(bone); 
                boneStack.push(bone);
            }
        });

        // Create Skeleton Helper
        if (rootBones.length > 0) {
            this.skeletonHelper = new THREE.SkeletonHelper(rootBones[0]);
            this.scene.add(this.skeletonHelper);
        }
    }

    applyFrame(frameData) {
        if (!frameData || !frameData.bones) return;

        frameData.bones.forEach(boneData => {
            const bone = this.boneIdMap[boneData.boneId];
            if (bone) {
                // Apply Animation Data
                // Assuming animation data is LOCAL to parent (standard for .anim/.bytes)
                // If the skeleton looks exploded, this assumption might need swapping.
                
                bone.position.set(
                    boneData.position[0],
                    boneData.position[1],
                    boneData.position[2]
                );
                
                bone.quaternion.set(
                    boneData.rotation[0],
                    boneData.rotation[1],
                    boneData.rotation[2],
                    boneData.rotation[3]
                );
            }
        });
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
