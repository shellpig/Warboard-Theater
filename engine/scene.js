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
  // 6-B:以 skydome ShaderMaterial 取代純色 scene.background
  scene.fog = new THREE.FogExp2(new THREE.Color(0xa8bfcc), 0.0004);

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

  // 天穹:大半球內側 + 天頂/地平線雙色 pow 漸層,fog:false 避免天空自己吃霧
  const skydome = new THREE.Mesh(
    new THREE.SphereGeometry(8000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop:     { value: new THREE.Color(0x7e95a8) },
        uHorizon: { value: new THREE.Color(0xa8bfcc) },
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        varying float vY;
        void main() {
          float t = pow(clamp(vY, 0.0, 1.0), 0.5);
          gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0);
        }
      `,
    })
  );
  skydome.frustumCulled = false;
  skydome.renderOrder = -1;
  scene.add(skydome);

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, camera, renderer, controls, lights: { hemi, sun }, skydome };
}
