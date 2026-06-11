// scene:renderer、相機、燈光、OrbitControls、resize
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x93abc0);
  scene.fog = new THREE.Fog(0x93abc0, 1500, 3800);

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    1,
    6000
  );
  // z = 南:相機自南側上方望向戰場中心,畫面上方為北
  camera.position.set(0, 520, 840);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 60;
  controls.maxDistance = 2600;

  scene.add(new THREE.HemisphereLight(0xcfe0ee, 0x55503f, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.7);
  sun.position.set(-500, 700, -350);
  scene.add(sun);

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, camera, renderer, controls };
}
