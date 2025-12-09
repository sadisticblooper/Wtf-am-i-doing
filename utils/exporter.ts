import * as THREE from 'three';
import { AnimationData } from './parser';
import { BONE_MAP, SKELETON_DEFINITION } from '../constants';

export async function exportAnimationToFBX(data: AnimationData, originalFileName: string, fps: number = 30): Promise<void> {
  
  let FBXExporter;
  
  try {
      // Dynamic import relying on index.html import map "three/examples/"
      // This maps to unpkg.com/three@0.160.0/examples/jsm/exporters/FBXExporter.js
      const module = await import('three/examples/jsm/exporters/FBXExporter.js');
      FBXExporter = module.FBXExporter;
  } catch (e) {
      console.error("Importer Error:", e);
      throw new Error(`Failed to load FBXExporter. Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!FBXExporter) {
      throw new Error("FBXExporter class was not found in the imported module.");
  }

  // 1. Reconstruct Skeleton Hierarchy from Scratch
  const rootGroup = new THREE.Group();
  rootGroup.name = "Root";

  const lines = SKELETON_DEFINITION.split('\n');
  interface BoneNode {
      name: string;
      level: number;
      globalPos: THREE.Vector3;
      globalRot: THREE.Quaternion;
  }
  const boneNodes: BoneNode[] = [];

  // Parse text definition
  lines.forEach(line => {
      if (!line.trim()) return;
      const boneMatch = line.match(/"(.*?)"\s*\[(BONE|Group)\]\s*\|\s*G\.Pos:\((.*?)\)\s*\|\s*G\.Rot \(quat\):\((.*?)\)/);
      if (boneMatch) {
          const name = boneMatch[1];
          const posArr = boneMatch[3].split(',').map(Number);
          const rotArr = boneMatch[4].split(',').map(Number);
          if (posArr.length === 3 && rotArr.length === 4) {
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

  // Build Hierarchy
  const stack: { bone: THREE.Bone; level: number }[] = [];
  const nameToBoneMap: Record<string, THREE.Bone> = {};

  boneNodes.forEach(node => {
      const bone = new THREE.Bone();
      bone.name = node.name;
      nameToBoneMap[node.name] = bone;

      // Find parent
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
          stack.pop();
      }

      if (stack.length > 0) {
          const parentEntry = stack[stack.length - 1];
          const parent = parentEntry.bone;
          
          // Get Parent Global Transforms (stored in userData for convenience during build)
          const parentGlobalPos = parent.userData.globalPos as THREE.Vector3;
          const parentGlobalRot = parent.userData.globalRot as THREE.Quaternion;

          // Calculate Local Transform: Child_Local = Parent_Global_Inverse * Child_Global
          const parentMatrix = new THREE.Matrix4().compose(
              parentGlobalPos,
              parentGlobalRot,
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
          
          parent.add(bone);
      } else {
          // Root bone
          bone.position.copy(node.globalPos);
          bone.quaternion.copy(node.globalRot);
          rootGroup.add(bone);
      }

      // Store globals for children to calculate their locals
      bone.userData.globalPos = node.globalPos.clone();
      bone.userData.globalRot = node.globalRot.clone();

      stack.push({ bone: bone, level: node.level });
  });

  // 2. Prepare Animation Tracks
  const tracks: THREE.KeyframeTrack[] = [];
  const frameDuration = 1 / fps;
  const boneTracks: Record<string, { times: number[], pos: number[], rot: number[] }> = {};
  
  data.frames.forEach((frame, frameIndex) => {
    const time = frameIndex * frameDuration;
    
    // Sort bones to ensure hierarchy order doesn't matter, though map access is direct
    frame.bones.forEach(boneData => {
      const boneName = BONE_MAP[boneData.boneId];
      // Only animate bones that exist in our skeleton definition
      if (!boneName || !nameToBoneMap[boneName]) return;
      
      if (!boneTracks[boneName]) {
        boneTracks[boneName] = { times: [], pos: [], rot: [] };
      }
      
      boneTracks[boneName].times.push(time);
      boneTracks[boneName].pos.push(...boneData.position);
      boneTracks[boneName].rot.push(...boneData.rotation);
    });
  });

  // Convert to Three.js KeyframeTracks
  Object.entries(boneTracks).forEach(([boneName, trackData]) => {
    tracks.push(new THREE.VectorKeyframeTrack(
      `${boneName}.position`,
      trackData.times,
      trackData.pos
    ));
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      trackData.times,
      trackData.rot
    ));
  });

  // 3. Create Animation Clip
  const duration = (data.framesCount - 1) * frameDuration;
  const clip = new THREE.AnimationClip('ExtractedAnimation', duration, tracks);

  // 4. Export
  const exporter = new FBXExporter();
  const options = {
    animations: [clip],
    binary: true
  };
  
  const fbxData = exporter.parse(rootGroup, options);
  
  // 5. Download
  const blob = new Blob([fbxData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const cleanName = originalFileName.replace(/\.[^/.]+$/, "");
  link.download = `${cleanName}_animated.fbx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}