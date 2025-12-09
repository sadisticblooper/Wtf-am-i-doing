import { animationParser } from './parser.js';
import { SceneController } from './scene.js';

class App {
    constructor() {
        this.sceneController = null;
        this.animationData = null;
        this.isPlaying = false;
        this.currentFrame = 0;
        this.fps = 30;
        this.lastFrameTime = 0;
        this.totalFrames = 0;
        
        // UI Elements
        this.els = {
            fileUploadArea: document.getElementById('fileUploadArea'),
            fileInput: document.getElementById('fileInput'),
            fileName: document.getElementById('fileName'),
            playButton: document.getElementById('playButton'),
            timelineSlider: document.getElementById('timelineSlider'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            frameCounter: document.getElementById('frameCounter'),
            bonesCount: document.getElementById('bonesCount'),
            framesCount: document.getElementById('framesCount'),
            exportButton: document.getElementById('exportButton'),
            statusMessage: document.getElementById('statusMessage'),
            waitingMessage: document.getElementById('waitingMessage'),
        };

        this.init();
    }

    init() {
        // Initialize Scene
        this.sceneController = new SceneController('canvasContainer');

        // Setup Event Listeners
        this.setupUI();

        // Start Animation Loop
        requestAnimationFrame(this.loop.bind(this));
    }

    setupUI() {
        // 1. File Upload Logic (Fixing the "Broken Button")
        this.els.fileUploadArea.addEventListener('click', (e) => {
            // Prevent triggering if clicking input itself (bubbling)
            if (e.target !== this.els.fileInput) {
                this.els.fileInput.click();
            }
        });

        this.els.fileInput.addEventListener('change', this.handleFileUpload.bind(this));

        // 2. Playback Controls
        this.els.playButton.addEventListener('click', this.togglePlay.bind(this));

        // 3. Sliders
        this.els.timelineSlider.addEventListener('input', (e) => {
            this.pause();
            this.currentFrame = parseInt(e.target.value) - 1;
            this.updateFrame();
        });

        this.els.speedSlider.addEventListener('input', (e) => {
            this.fps = parseInt(e.target.value);
            this.els.speedValue.textContent = `${this.fps} FPS`;
        });

        // 4. Export
        this.els.exportButton.addEventListener('click', () => {
            if (this.animationData) {
                animationParser.convertToCSV(this.animationData, this.els.fileInput.files[0]?.name || 'anim.bytes');
            }
        });
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.els.fileName.textContent = file.name;
        this.els.statusMessage.className = 'status-message status-loading';
        this.els.statusMessage.textContent = 'Parsing binary data...';
        this.els.waitingMessage.style.display = 'none';

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.animationData = await animationParser.parse(arrayBuffer);
            
            // Reset State
            this.totalFrames = this.animationData.framesCount;
            this.currentFrame = 0;
            this.pause();
            
            // Update UI
            this.els.timelineSlider.max = this.totalFrames;
            this.els.timelineSlider.value = 1;
            this.els.bonesCount.textContent = this.animationData.bonesCount;
            this.els.framesCount.textContent = this.totalFrames;
            this.els.exportButton.disabled = false;
            
            this.els.statusMessage.className = 'status-message';
            this.els.statusMessage.textContent = 'Ready';
            this.els.statusMessage.style.color = '#10b981'; // Green

            // Show first frame
            this.updateFrame();

        } catch (error) {
            console.error(error);
            this.els.statusMessage.className = 'status-message status-error';
            this.els.statusMessage.textContent = `Error: ${error.message}`;
            this.els.fileName.textContent = 'Load Failed';
        }
    }

    togglePlay() {
        if (!this.animationData) return;
        
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        this.isPlaying = true;
        this.els.playButton.classList.remove('play');
        this.els.playButton.classList.add('pause');
        this.els.playButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
    }

    pause() {
        this.isPlaying = false;
        this.els.playButton.classList.remove('pause');
        this.els.playButton.classList.add('play');
        this.els.playButton.innerHTML = '<i class="fas fa-play"></i> Play';
    }

    updateFrame() {
        if (!this.animationData) return;

        // Loop logic
        if (this.currentFrame >= this.totalFrames) {
            this.currentFrame = 0;
        }

        // Update Slider UI
        this.els.timelineSlider.value = this.currentFrame + 1;
        this.els.frameCounter.textContent = `${this.currentFrame + 1} / ${this.totalFrames}`;

        // Send data to Scene
        const frameData = this.animationData.frames[this.currentFrame];
        this.sceneController.applyFrame(frameData);
    }

    loop(timestamp) {
        requestAnimationFrame(this.loop.bind(this));

        if (this.isPlaying && this.animationData) {
            const interval = 1000 / this.fps;
            if (timestamp - this.lastFrameTime > interval) {
                this.currentFrame++;
                this.updateFrame();
                this.lastFrameTime = timestamp;
            }
        }
    }
}

// Initialize App
new App();
