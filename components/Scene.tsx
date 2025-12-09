import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SKELETON_DEFINITION, BONE_MAP } from '../constants';
import { AnimationData } from '../utils/parser';

interface SceneProps {
  animationData: AnimationData | null;
  isPlaying: boolean;
  playbackSpeed: number;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onMaxFrameSet: (max: number) => void;
}

const NAME_TO_ID = Object.entries(BONE_MAP).reduce((acc, [id, name]) => {
  acc[name] = parseInt(id);
  return acc;
}, {} as Record<string, number>);

const Scene: React.FC<SceneProps> = ({ 
  animationData, 
  isPlaying, 
  playbackSpeed,
  currentFrame,
  onFrameChange,
  onMaxFrameSet
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const boneIdMapRef = useRef<Record<number, THREE.Bone>>({});
  
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827); // Tailwind gray-900
    scene.fog = new THREE.Fog(0x111827, 200, 1000);
    sceneRef.current = scene;

    // Helpers
    const gridHelper = new THREE.GridHelper(500, 50, 0x374151, 0x1f2937);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(30);
    scene.add(axesHelper);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(50, 200, 100);
    scene.add(dirLight);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    camera.position.set(0, 150, 350);
    camera.lookAt(0, 100, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 100, 0);

    // Load Skeleton (Run once)
    loadSkeleton();

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    const animate = (time: number) => {
      requestRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Skeleton Building
  const loadSkeleton = () => {
    if (!sceneRef.current) return;
    
    // Cleanup existing
    if (rootGroupRef.current) {
      sceneRef.current.remove(rootGroupRef.current);
      rootGroupRef.current = null;
    }
    if (skeletonHelperRef.current) {
      sceneRef.current.remove(skeletonHelperRef.current);
      skeletonHelperRef.current = null;
    }
    
    boneIdMapRef.current = {};
    const lines = SKELETON_DEFINITION.split('\n');
    
    interface BoneNode {
        name: string;
        level: number;
        globalPos: THREE.Vector3;
        globalRot: THREE.Quaternion;
    }

    const boneNodes: BoneNode[] = [];

    lines.forEach(line => {
        if (!line.trim()) return;
        const boneMatch = line.match(/"(.*?)"\s*\[(BONE|Group)\]\s*\|\s*G\.Pos:\((.*?)\)\s*\|\s*G\.Rot \(quat\):\((.*?)\)/);
        if (boneMatch) {
            const name = boneMatch[1];
            const posArr = boneMatch[3].split(',').map(Number);
            const rotArr = boneMatch[4].split(',').map(Number);
            if (posArr.length === 3 && rotArr.length === 4) {
                // Calculate level based on indentation (2 spaces = 1 level)
                const level = line.search(/\S/) / 2;
                boneNodes.push({
                    name: name,
                    level: level,
                    globalPos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
                    globalRot: new THREE.Quaternion(rotArr[0], rotArr[1], rotArr[2], rotArr[3])
                });
            }
        }
    });

    const rootGroup = new THREE.Group();
    sceneRef.current.add(rootGroup);
    rootGroupRef.current = rootGroup;

    const stack: { bone: THREE.Bone; level: number }[] = [];

    boneNodes.forEach(node => {
        const bone = new THREE.Bone();
        bone.name = node.name;
        // Store original transform for debugging if needed
        bone.userData = { originalGlobalPos: node.globalPos.clone(), originalGlobalRot: node.globalRot.clone() };

        // Add visual box
        const size = node.name === "pelvis" ? 4 : 1.5;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshLambertMaterial({ color: 0x22c55e }); // Tailwind green-500
        const cube = new THREE.Mesh(geometry, material);
        bone.add(cube);

        // Map to ID
        if (Object.prototype.hasOwnProperty.call(NAME_TO_ID, node.name)) {
            boneIdMapRef.current[NAME_TO_ID[node.name]] = bone;
        }

        // Parent logic
        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }

        if (stack.length > 0) {
            const parent = stack[stack.length - 1].bone;
            parent.add(bone);

            // Calculate local transform
            // P_world = Parent_world * Local
            // Local = Parent_world_inv * P_world
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
            rootGroup.add(bone);
            bone.position.copy(node.globalPos);
            bone.quaternion.copy(node.globalRot);
        }

        stack.push({ bone: bone, level: node.level });
    });

    const skeletonHelper = new THREE.SkeletonHelper(rootGroup);
    sceneRef.current.add(skeletonHelper);
    skeletonHelperRef.current = skeletonHelper;
  };

  // Helper to normalize
  const normalizeQuaternion = (q: THREE.Quaternion) => {
    const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (length > 0) {
        return new THREE.Quaternion(q.x / length, q.y / length, q.z / length, q.w / length);
    }
    return new THREE.Quaternion(0, 0, 0, 1);
  };

  // Logic to apply a specific frame
  const applyFrame = (frameIndex: number) => {
    if (!animationData || !rootGroupRef.current) return;
    
    // Note: frameIndex is 1-based in UI, but array is 0-based
    const frameData = animationData.frames[frameIndex - 1]; 
    if (!frameData) return;

    for (const boneData of frameData.bones) {
        const bone = boneIdMapRef.current[boneData.boneId];
        if (bone) {
            bone.position.set(boneData.position[0], boneData.position[1], boneData.position[2]);
            const [x, y, z, w] = boneData.rotation;
            // The parser returns [x,y,z,w] or [d, a, b, c] logic.
            // Let's assume the order from parser is correct for Three.js (x,y,z,w)
            const quat = normalizeQuaternion(new THREE.Quaternion(x, y, z, w));
            bone.quaternion.copy(quat);
        }
    }
    
    rootGroupRef.current.updateMatrixWorld(true);
  };

  // Effect to handle animation data change
  useEffect(() => {
    if (animationData) {
        onMaxFrameSet(animationData.framesCount);
        applyFrame(1);
        onFrameChange(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationData]);

  // Effect for playback loop
  useEffect(() => {
    if (!animationData) return;

    let animationFrameId: number;

    const loop = (time: number) => {
      animationFrameId = requestAnimationFrame(loop);
      
      if (isPlaying) {
        const interval = 1000 / playbackSpeed;
        if (time - lastTimeRef.current > interval) {
            lastTimeRef.current = time;
            
            let nextFrame = currentFrame + 1;
            if (nextFrame > animationData.framesCount) {
                nextFrame = 1;
            }
            onFrameChange(nextFrame); // update React state
            applyFrame(nextFrame); // update Three.js
        }
      }
    };
    
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, playbackSpeed, currentFrame, animationData, onFrameChange]); // Dependencies ensure loop uses fresh state

  // Effect to sync manual slider change to Three.js
  useEffect(() => {
    if (!isPlaying && animationData) {
        applyFrame(currentFrame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, isPlaying]);

  return (
    <div ref={mountRef} className="w-full h-full cursor-move relative" />
  );
};

export default Scene;