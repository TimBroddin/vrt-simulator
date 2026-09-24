import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Camcorder look: soft tone curve, chroma fringe, tape wobble, grain, vignette.
const CamShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
    glitch: { value: 0 },
    fade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 res;
    uniform float glitch;
    uniform float fade;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 uv = 0.5 + c * (1.0 + 0.06 * dot(c, c));
      float line = floor(uv.y * res.y / 3.0);
      float band = step(0.985 - glitch * 0.2, hash(vec2(floor(time * 6.0), floor(uv.y * 12.0))));
      uv.x += (hash(vec2(line, floor(time * 24.0))) - 0.5) * (0.0008 + glitch * 0.01) + band * 0.004;
      float ca = 0.0012 + 0.0035 * dot(c, c) + glitch * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      col = 1.0 - exp(-col * 1.35);
      col = pow(col, vec3(0.92, 0.9, 0.96));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.82);
      col += vec3(0.012, 0.018, 0.014);
      col += (hash(uv * res + fract(time * 13.7) * 100.0) - 0.5) * 0.07;
      col *= 0.95 + 0.05 * sin(uv.y * res.y * 1.7);
      col *= mix(0.45, 1.0, smoothstep(0.82, 0.2, length(c)));
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
      gl_FragColor = vec4(col * fade, 1.0);
    }
  `,
};

export function makePost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.6, 0.55, 0.92);
  composer.addPass(bloom);
  const cam = new ShaderPass(CamShader);
  composer.addPass(cam);
  return {
    composer,
    cam,
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      cam.uniforms.res!.value.set(w * pr, h * pr);
    },
  };
}
