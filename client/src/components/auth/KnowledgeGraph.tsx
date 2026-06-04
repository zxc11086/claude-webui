import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const NODE_COUNT = 30;
const MAX_EDGES = 50;
const EDGE_MAX_DIST = 2.8;

function generateGraph(): { nodes: THREE.Vector3[]; edges: [number, number][] } {
  const nodes: THREE.Vector3[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 2 + Math.random() * 1.8;
    const x = Math.sin(phi) * Math.cos(theta) * r;
    const y = Math.sin(phi) * Math.sin(theta) * r * 0.6;
    const z = Math.cos(phi) * r;
    nodes.push(new THREE.Vector3(x, y, z));
  }

  const candidates: [number, number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = nodes[i].distanceTo(nodes[j]);
      if (dist < EDGE_MAX_DIST) {
        candidates.push([i, j, dist]);
      }
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);

  const edges: [number, number][] = [];
  const degree = new Array(NODE_COUNT).fill(0);
  for (const [i, j] of candidates) {
    if (edges.length >= MAX_EDGES) break;
    if (degree[i] < 5 && degree[j] < 5) {
      edges.push([i, j]);
      degree[i]++;
      degree[j]++;
    }
  }

  return { nodes, edges };
}

export function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Scene setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 20);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // --- Graph data ---
    const { nodes: nodePositions, edges } = generateGraph();

    // --- Node spheres ---
    const nodeGroup = new THREE.Group();
    const nodeMeshes: THREE.Mesh[] = [];
    
    // 多样化的颜色数组
    const nodeColors = [
      0x6366f1, // 靛蓝
      0x8b5cf6, // 紫色
      0xec4899, // 粉色
      0xf59e0b, // 琥珀色
      0x10b981, // 绿色
      0x06b6d4, // 青色
      0xef4444, // 红色
      0x3b82f6, // 蓝色
    ];

    for (let idx = 0; idx < nodePositions.length; idx++) {
      const pos = nodePositions[idx];
      const color = nodeColors[idx % nodeColors.length];
      
      const geo = new THREE.SphereGeometry(0.06, 16, 16);
      const nodeMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.4,
      });
      const mesh = new THREE.Mesh(geo, nodeMaterial);
      mesh.position.copy(pos);
      nodeGroup.add(mesh);
      nodeMeshes.push(mesh);
    }

    // --- Edge lines ---
    const edgeGroup = new THREE.Group();
    for (const [i, j] of edges) {
      const points = [nodePositions[i], nodePositions[j]];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0x4b5563,
        transparent: true,
        opacity: 0.4,
      });
      const line = new THREE.Line(geo, mat);
      edgeGroup.add(line);
    }

    // --- Flow particles along edges ---
    const flowGroup = new THREE.Group();
    const flowParticles: { mesh: THREE.Mesh; edgeIdx: number; t: number; speed: number }[] = [];
    const flowCount = 30;
    const flowGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const flowMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa });

    for (let k = 0; k < flowCount; k++) {
      const edgeIdx = Math.floor(Math.random() * edges.length);
      const mesh = new THREE.Mesh(flowGeo, flowMat.clone());
      mesh.userData = { brightness: 0.4 + Math.random() * 0.6 };
      flowGroup.add(mesh);
      flowParticles.push({
        mesh,
        edgeIdx,
        t: Math.random(),
        speed: 0.002 + Math.random() * 0.006,
      });
    }

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0x404060, 1.5));
    const pointLight1 = new THREE.PointLight(0x6366f1, 30, 15);
    pointLight1.position.set(3, 2, 4);
    scene.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0x8b5cf6, 25, 15);
    pointLight2.position.set(-3, -1, 3);
    scene.add(pointLight2);

    // --- Main group ---
    const mainGroup = new THREE.Group();
    mainGroup.add(nodeGroup);
    mainGroup.add(edgeGroup);
    mainGroup.add(flowGroup);
    scene.add(mainGroup);

    // --- Animation ---
    let animId: number;
    const clock = new THREE.Clock();

    function animate() {
      animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = performance.now() * 0.001;

      // Rotate main group
      mainGroup.rotation.y += dt * 0.15;
      mainGroup.rotation.x = Math.sin(elapsed * 0.3) * 0.15;
      mainGroup.rotation.z = Math.cos(elapsed * 0.25) * 0.08;

      // Animate flow particles
      for (const p of flowParticles) {
        p.t += p.speed;
        if (p.t > 1) {
          p.t = 0;
          p.edgeIdx = Math.floor(Math.random() * edges.length);
        }
        const [i, j] = edges[p.edgeIdx];
        const a = nodePositions[i];
        const b = nodePositions[j];
        const localA = a.clone().applyMatrix4(nodeGroup.matrixWorld);
        const localB = b.clone().applyMatrix4(nodeGroup.matrixWorld);
        // Interpolate in world space then convert to flowGroup local
        const worldPos = new THREE.Vector3().lerpVectors(
          new THREE.Vector3().copy(a).applyMatrix4(mainGroup.matrixWorld),
          new THREE.Vector3().copy(b).applyMatrix4(mainGroup.matrixWorld),
          p.t
        );
        flowGroup.worldToLocal(worldPos);
        p.mesh.position.copy(worldPos);

        // Fade based on position along edge (bright in middle)
        const brightness = 0.3 + Math.sin(p.t * Math.PI) * 0.7;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = brightness;
        p.mesh.material.transparent = true;
      }

      // Pulse node glow
      for (let i = 0; i < nodeMeshes.length; i++) {
        const pulse = 0.3 + Math.sin(elapsed * 3 + i * 0.7) * 0.3;
        (nodeMeshes[i].material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      }

      renderer.render(scene, camera);
    }
    animate();

    // --- Resize ---
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      scene.clear();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
