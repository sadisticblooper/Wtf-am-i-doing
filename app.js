import { animationParser } from './parser.js';
import { gltfHandler } from './gltf-handler.js';
import { SceneController } from './scene.js';

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
            infoFrames: document.getElementById('totalFrames'),
            infoBones: document.getElementById('boneCount'),
            btnImport: document.getElementById('btnImportGltf'),
            btnExport: document.getElementById('btnExportGltf'),
            btnCompile: document.getElementById('btnCompile'),
            loader: document.getElementById('loader'),
            toast: document.getElementById('toast'),
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
        // Main File Input
        this.els.dropZone.onclick = (e) => {
            if(e.target !== this.els.fileInput) this.els.fileInput.click();
        };
        this.els.fileInput.onchange = (e) => this.handleFile(e.target.files[0]);

        // GLTF Import
        this.els.btnImport.onclick = () => this.els.gltfInput.click();
        this.els.gltfInput.onchange = (e) => this.handleFile(e.target.files[0]);

        // GLTF Export
        this.els.btnExport.onclick = async () => {
            if(!this.animationData) return;
            this.showLoader(true);
            try {
                const blob = await gltfHandler.exportGLTF(this.animationData, this.fps);
                this.download(blob, 'animation_export.gltf');
                this.showToast('GLTF Exported Successfully');
            } catch(e) {
                this.showToast(e.message, true);
            }
            this.showLoader(false);
        };

        // Compile
        this.els.btnCompile.onclick = () => {
            if(!this.animationData) return;
            try {
                const buffer = animationParser.repack(this.animationData);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                this.download(blob, 'compiled_animation.bytes');
                this.showToast('Binary Compiled Successfully');
            } catch(e) {
                this.showToast("Compile Error: " + e.message, true);
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

    async handleFile(file) {
        if (!file) return;
        this.showLoader(true);
        this.els.fileName.textContent = file.name;

        try {
            if (file.name.endsWith('.gltf') || file.name.endsWith('.glb')) {
                // Import GLTF
                this.animationData = await gltfHandler.importGLTF(file, this.fps);
                this.showToast(`Imported ${this.animationData.framesCount} frames from GLTF`);
            } else {
                // Load Binary
                const buffer = await file.arrayBuffer();
                this.animationData = await animationParser.parse(buffer);
                this.showToast('Binary Loaded Successfully');
            }

            // Reset
            this.currentFrame = 0;
            this.isPlaying = true;
            this.els.timeline.max = this.animationData.framesCount - 1;
            this.els.infoBones.textContent = this.animationData.bonesCount;
            this.els.infoFrames.textContent = this.animationData.framesCount;
            this.els.btnExport.disabled = false;
            this.els.btnCompile.disabled = false;
            
            this.updateUI();

        } catch (err) {
            console.error(err);
            this.showToast(err.message, true);
            this.els.fileName.textContent = 'Error Loading File';
        }
        this.showLoader(false);
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.updateUI();
    }

    updateUI() {
        this.els.playBtn.innerHTML = this.isPlaying ? '<i class="fas fa-pause"></i> Pause' : '<i class="fas fa-play"></i> Play';
        this.els.playBtn.className = `play-btn ${this.isPlaying ? 'pause' : 'play'}`;
        this.els.timeline.value = this.currentFrame;
        this.els.frameDisplay.textContent = `${this.currentFrame} / ${this.animationData ? this.animationData.framesCount : 0}`;
    }

    renderFrame() {
        if (!this.animationData) return;
        const frame = this.animationData.frames[this.currentFrame];
        this.sceneController.applyFrame(frame);
    }

    loop(timestamp) {
        requestAnimationFrame(this.loop.bind(this));
        
        if (this.isPlaying && this.animationData) {
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

    showToast(msg, isError = false) {
        this.els.toast.textContent = msg;
        this.els.toast.classList.toggle('error', isError);
        this.els.toast.classList.add('show');
        setTimeout(() => this.els.toast.classList.remove('show'), 3000);
    }

    showLoader(show) {
        this.els.loader.style.display = show ? 'flex' : 'none';
    }
}

new App();
