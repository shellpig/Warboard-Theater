// scene:renderer、相機、燈光、OrbitControls、resize
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7e95a8);
  scene.fog = new THREE.Fog(0x7e95a8, 3000, 7600);

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    1,
    12000
  );
  // 斜角俯視:自東南側望向戰場中心,地圖呈菱形感
  camera.position.set(900, 1040, 1500);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 120;
  controls.maxDistance = 2400;

  // 6-A:hemi 壓暗讓陰影面有體積感;sun 維持暖色與 hemi 冷色形成對比
  const hemi = new THREE.HemisphereLight(0xcfe0ee, 0x55503f, 0.52);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.position.set(-500, 700, -350);
  scene.add(sun);

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, camera, renderer, controls, lights: { hemi, sun } };
}
