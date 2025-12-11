import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { animationParser } from './parser.js';
import { gltfHandler } from './gltf-handler.js';
import { SKELETON_DEFINITION, NAME_TO_ID } from './constants.js';

// --- Scene Logic ---
class SceneController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.bones = {}; 
        this.boneIdMap = {}; 
        this.skeletonVisible = false;
        this.skeletonHelper = null;
        this.rootGroup = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Grid & Helpers
        const grid = new THREE.GridHelper(500, 50, 0x333333, 0x111111);
        this.scene.add(grid);
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

        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });

        this.animate();
    }

    setSkeletonVisibility(visible) {
        if (visible && !this.skeletonVisible) {
            this.buildSkeleton();
            this.skeletonVisible = true;
        } else if (!visible && this.skeletonVisible) {
            this.clearSkeleton();
            this.skeletonVisible = false;
        }
    }

    clearSkeleton() {
        if (this.rootGroup) {
            this.scene.remove(this.rootGroup);
            this.rootGroup = null;
        }
        
        if (this.skeletonHelper) {
            this.scene.remove(this.skeletonHelper);
            this.skeletonHelper = null;
        }
        
        this.bones = {};
        this.boneIdMap = {};
    }

    buildSkeleton() {
        this.clearSkeleton();
        
        const lines = SKELETON_DEFINITION.split('\n').filter(l => l.trim().length > 0);
        const boneNodes = [];
        
        // First pass: parse all bones
        lines.forEach(line => {
            if (!line.trim()) return;
            
            const depth = line.search(/\S|$/) / 2;
            const nameMatch = line.match(/"([^"]+)"/);
            const posMatch = line.match(/G\.Pos:\(([^)]+)\)/);
            const rotMatch = line.match(/G\.Rot \(quat\):\(([^)]+)\)/);

            if (!nameMatch) return;
            const name = nameMatch[1];
            
            const pos = posMatch[1].split(',').map(parseFloat);
            const rot = rotMatch[1].split(',').map(parseFloat);

            if (pos.length === 3 && rot.length === 4) {
                boneNodes.push({
                    name: name,
                    level: depth,
                    globalPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
                    globalRot: new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3])
                });
            }
        });

        // Build hierarchy
        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);
        
        const stack = [];
        
        boneNodes.forEach(node => {
            const bone = new THREE.Bone();
            bone.name = node.name;
            
            // Store original global transform
            bone.userData = {
                originalGlobalPos: node.globalPos.clone(),
                originalGlobalRot: node.globalRot.clone()
            };
            
            this.bones[node.name] = bone;
            const id = NAME_TO_ID[node.name];
            if (id !== undefined) this.boneIdMap[id] = bone;
            
            // Find parent based on indentation level
            while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
                stack.pop();
            }
            
            if (stack.length > 0) {
                const parent = stack[stack.length - 1].bone;
                parent.add(bone);
                
                // Calculate local transform from global positions
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

        // Update all matrices
        this.rootGroup.updateMatrixWorld(true);
        
        if (boneNodes.length > 0 && this.rootGroup.children.length > 0) {
            this.skeletonHelper = new THREE.SkeletonHelper(this.rootGroup.children[0]);
            this.scene.add(this.skeletonHelper);
        }
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
        
        // Update matrices after applying animation
        this.rootGroup.updateMatrixWorld(true);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// --- Application Logic ---
class App {
    constructor() {
        this.sceneController = null;
        this.animationData = null;
        this.isPlaying = false;
        this.currentFrame = 0;
        this.fps = 30;
        this.lastTime = 0;
        
        this.els = {
            dropZone: document.getElementById('dropZone'),
            fileInput: document.getElementById('mainFileInput'),
            fileName: document.getElementById('fileName'),
            gltfInput: document.getElementById('gltfInput'),
            playBtn: document.getElementById('playBtn'),
            timeline: document.getElementById('timeline'),
            speed: document.getElementById('speed'),
            infoFrames: document.getElementById('infoFrames'),
            infoBones: document.getElementById('infoBones'),
            btnImport: document.getElementById('btnImportGltf'),
            btnExport: document.getElementById('btnExportGltf'),
            btnCompile: document.getElementById('btnCompile'),
            loader: document.getElementById('loader'),
            statusText: document.getElementById('statusText'),
            frameDisplay: document.getElementById('frameDisplay'),
            speedDisplay: document.getElementById('speedDisplay')
        };

        this.init();
    }

    init() {
        this.sceneController = new SceneController('canvasContainer');
        this.setupEvents();
        requestAnimationFrame(this.loop.bind(this));
    }

    setupEvents() {
        // Base File Input
        this.els.dropZone.onclick = (e) => {
            if(e.target !== this.els.fileInput) this.els.fileInput.click();
        };
        this.els.fileInput.onchange = (e) => this.handleBaseFile(e.target.files[0]);

        // GLTF Import
        this.els.btnImport.onclick = () => this.els.gltfInput.click();
        this.els.gltfInput.onchange = (e) => this.handleGltfImport(e.target.files[0]);

        // GLTF Export
        this.els.btnExport.onclick = async () => {
            if(!this.animationData) {
                this.setStatus('Error: No animation data to export', 'error');
                return;
            }
            this.setLoading(true);
            try {
                const blob = await gltfHandler.exportGLTF(this.animationData, this.fps);
                this.download(blob, 'sf3_animation_export.gltf');
                this.setStatus('Export Successful', 'success');
            } catch(e) {
                this.setStatus('Export Failed: ' + e.message, 'error');
            }
            this.setLoading(false);
        };

        // Compile
        this.els.btnCompile.onclick = () => {
            if(!this.animationData) {
                this.setStatus('Error: No animation data to compile', 'error');
                return;
            }
            try {
                const buffer = animationParser.repack(this.animationData);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                this.download(blob, 'compiled_animation.bytes');
                this.setStatus('Binary Compiled Successfully', 'success');
            } catch(e) {
                this.setStatus('Compile Error: ' + e.message, 'error');
            }
        };

        // Playback
        this.els.playBtn.onclick = () => this.togglePlay();
        this.els.timeline.oninput = (e) => {
            this.isPlaying = false;
            this.currentFrame = parseInt(e.target.value);
            this.updateUI();
            this.renderFrame();
        };
        this.els.speed.oninput = (e) => {
            this.fps = parseInt(e.target.value);
            this.els.speedDisplay.textContent = `${this.fps} FPS`;
        };
    }

    async handleBaseFile(file) {
        if (!file) return;
        this.setLoading(true);
        this.els.fileName.textContent = file.name;
        this.setStatus('Parsing Base File...', 'normal');

        try {
            const buffer = await file.arrayBuffer();
            this.animationData = await animationParser.parse(buffer);
            
            // Show skeleton only when file is successfully loaded
            this.sceneController.setSkeletonVisibility(true);
            
            this.resetPlaybackState();
            this.setStatus('Base File Loaded', 'success');
            this.enableControls(true);

        } catch (err) {
            console.error(err);
            this.setStatus('Error: ' + err.message, 'error');
            this.els.fileName.textContent = 'Load Failed';
            this.enableControls(false);
            // Hide skeleton if load failed
            this.sceneController.setSkeletonVisibility(false);
        }
        this.setLoading(false);
    }

    async handleGltfImport(file) {
        if (!file) return;
        
        if (!this.animationData || !animationParser.originalFileBuffer) {
            this.setStatus('Error: Load a Base File first!', 'error');
            return;
        }

        this.setLoading(true);
        this.setStatus('Importing GLTF...', 'normal');

        try {
            // Pass original animation data to handle trailing data multiplication
            const newData = await gltfHandler.importGLTF(file, this.fps, this.animationData);
            
            // Update animation data with new frames
            this.animationData.frames = newData.frames;
            this.animationData.framesCount = newData.framesCount;
            
            // Store trailing data if it exists
            if (newData.trailingData) {
                this.animationData.trailingData = newData.trailingData;
                if (newData.trailingDataMultiplied) {
                    this.setStatus(`Imported ${newData.framesCount} frames from GLTF (trailing data ×${newData.trailingDataMultiplied})`, 'success');
                } else {
                    this.setStatus(`Imported ${newData.framesCount} frames from GLTF`, 'success');
                }
            } else {
                this.setStatus(`Imported ${newData.framesCount} frames from GLTF`, 'success');
            }
            
            this.resetPlaybackState();

        } catch (err) {
            console.error(err);
            this.setStatus('Import Error: ' + err.message, 'error');
        }
        this.setLoading(false);
    }

    resetPlaybackState() {
        this.currentFrame = 0;
        this.isPlaying = true;
        if (this.animationData) {
            this.els.timeline.max = this.animationData.framesCount - 1;
            this.els.infoBones.textContent = this.animationData.bonesCount;
            this.els.infoFrames.textContent = this.animationData.framesCount;
        }
        this.updateUI();
        this.renderFrame();
    }

    enableControls(enabled) {
        this.els.btnExport.disabled = !enabled;
        this.els.btnCompile.disabled = !enabled;
        this.els.btnImport.disabled = !enabled;
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.updateUI();
    }

    updateUI() {
        if (this.animationData) {
            this.els.playBtn.innerHTML = this.isPlaying ? '<i class="fas fa-pause"></i> Pause' : '<i class="fas fa-play"></i> Play';
            this.els.playBtn.className = `btn-play ${this.isPlaying ? 'paused' : ''}`;
            this.els.timeline.value = this.currentFrame;
            this.els.frameDisplay.textContent = `${this.currentFrame} / ${this.animationData.framesCount}`;
        } else {
            this.els.frameDisplay.textContent = '0 / 0';
        }
    }

    renderFrame() {
        if (!this.animationData || !this.animationData.frames) return;
        const frame = this.animationData.frames[this.currentFrame];
        this.sceneController.applyFrame(frame);
    }

    loop(timestamp) {
        requestAnimationFrame(this.loop.bind(this));
        
        if (this.isPlaying && this.animationData && this.animationData.framesCount > 0) {
            const interval = 1000 / this.fps;
            if (timestamp - this.lastTime > interval) {
                this.currentFrame = (this.currentFrame + 1) % this.animationData.framesCount;
                this.renderFrame();
                this.updateUI();
                this.lastTime = timestamp;
            }
        }
    }

    download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    setStatus(msg, type) {
        this.els.statusText.textContent = msg;
        this.els.statusText.className = 'status-line ' + type;
    }

    setLoading(loading) {
        this.els.loader.style.display = loading ? 'flex' : 'none';
    }
}

new App();
