'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/lib/theme-provider';

interface ThreeViewerProps {
  data?: Record<string, unknown>;
  className?: string;
}

export function ThreeViewer({ 
  data,
  className = '' 
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!mountRef.current) return;

    // Capture the mount element reference to avoid React hook warnings
    const currentMount = mountRef.current;
    const rect = currentMount.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 300;

    // Scene setup
    const scene = new THREE.Scene();
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    scene.background = new THREE.Color(isDark ? 0x0a0a0a : 0xfafafa);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75, 
      width / height, 
      0.1, 
      1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    currentMount.appendChild(renderer.domElement);

    // Basic lighting
    const ambientLight = new THREE.AmbientLight(isDark ? 0x404040 : 0x606060, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Grid helper for spatial reference
    const gridHelper = new THREE.GridHelper(
      10, 
      20, 
      isDark ? 0x444444 : 0x888888, 
      isDark ? 0x222222 : 0xcccccc
    );
    scene.add(gridHelper);

    // Basic controls (mouse interaction)
    let mouseX = 0;
    let mouseY = 0;
    let isMouseDown = false;

    const onMouseMove = (event: MouseEvent) => {
      if (!isMouseDown) return;
      
      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;
      
      camera.position.x += deltaX * 0.01;
      camera.position.y -= deltaY * 0.01;
      camera.lookAt(0, 0, 0);
      
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onMouseDown = (event: MouseEvent) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onMouseUp = () => {
      isMouseDown = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      
      if (currentMount && renderer.domElement && currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [theme]);

  // Update scene when data changes
  useEffect(() => {
    if (!sceneRef.current || !data) return;

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Clear previous robot/sensor data
    const objectsToRemove = sceneRef.current.children.filter(
      child => child.userData.isRobotData
    );
    objectsToRemove.forEach(obj => sceneRef.current?.remove(obj));

    // Handle point cloud data
    if (data.points && Array.isArray(data.points) && data.points.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.points as number[], 3));
      
      const material = new THREE.PointsMaterial({ 
        color: isDark ? 0x60a5fa : 0x3b82f6,
        size: 0.02,
        sizeAttenuation: true
      });
      
      const points = new THREE.Points(geometry, material);
      points.userData.isRobotData = true;
      sceneRef.current.add(points);
    }

    // Handle trajectory/path data
    if (data.trajectory && Array.isArray(data.trajectory) && data.trajectory.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.trajectory as number[], 3));
      
      const material = new THREE.LineBasicMaterial({
        color: isDark ? 0xef4444 : 0xdc2626,
        linewidth: 2
      });
      
      const line = new THREE.Line(geometry, material);
      line.userData.isRobotData = true;
      sceneRef.current.add(line);
    }
  }, [data, theme]);

  return (
    <div className={`w-full h-full ${className}`}>
      <div ref={mountRef} className="w-full h-full rounded-lg overflow-hidden border bg-background" />
    </div>
  );
}