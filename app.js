
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
            
            this.resetPlaybackState();
            this.setStatus('Base File Loaded', 'success');
            this.enableControls(true);

        } catch (err) {
            console.error(err);
            this.setStatus('Error: ' + err.message, 'error');
            this.els.fileName.textContent = 'Load Failed';
            this.enableControls(false);
        }
        this.setLoading(false);
    }

    async handleGltfImport(file) {
        if (!file) return;
        
        // Check if we have parsed a base file
        if (!this.animationData || !animationParser.originalFileBuffer) {
            this.setStatus('Error: Load a Base File first!', 'error');
            return;
        }

        this.setLoading(true);
        this.setStatus('Importing GLTF...', 'normal');

        try {
            const newData = await gltfHandler.importGLTF(file, this.fps);
            
            // Merge new frames into existing structure
            this.animationData.frames = newData.frames;
            this.animationData.framesCount = newData.framesCount;
            // Note: We keep bonesCount and IDs from base file to ensure compatibility
            
            this.resetPlaybackState();
            this.setStatus(`Imported ${newData.framesCount} frames from GLTF`, 'success');

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
        // GLTF import should be available if we have a base file
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
