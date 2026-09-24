import * as THREE from "three";

export function makeWorldMaterial(atlas: THREE.DataArrayTexture) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      atlas: { value: atlas },
      time: { value: 0 },
      fogColor: { value: new THREE.Color(0.02, 0.022, 0.024) },
      fogDensity: { value: 0.045 },
      lampPos: { value: new THREE.Vector3() },
      lampDir: { value: new THREE.Vector3(0, 0, -1) },
      lampOn: { value: 0 },
      exposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
      in float layer;
      in vec3 light;
      in vec2 flick;
      out vec2 vUv;
      out float vLayer;
      out vec3 vLight;
      out vec3 vWorld;
      uniform float time;
      float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      float flickerAt(float t, float ph) {
        float slot = floor(t * 0.9 + ph);
        float unstable = step(0.55, h1(slot * 7.13 + ph));
        float fast = step(0.4, h1(floor(t * 17.0) + ph * 13.0));
        float hum = 0.93 + 0.07 * h1(floor(t * 50.0) + ph);
        return mix(hum, mix(0.12, 1.0, fast), unstable);
      }
      void main() {
        vUv = uv;
        vLayer = layer;
        float f = flick.x > 0.0 ? flickerAt(time, flick.y) : 1.0;
        vLight = light * (1.0 - flick.x + flick.x * f);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray atlas;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform vec3 lampPos;
      uniform vec3 lampDir;
      uniform float lampOn;
      uniform float exposure;
      in vec2 vUv;
      in float vLayer;
      in vec3 vLight;
      in vec3 vWorld;
      out vec4 fragColor;
      void main() {
        vec4 t = texture(atlas, vec3(vUv, floor(vLayer + 0.5)));
        if (t.a < 0.5) discard;
        vec3 col = t.rgb * vLight;
        if (lampOn > 0.0) {
          vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          vec3 Lv = lampPos - vWorld;
          float d = length(Lv);
          Lv /= d;
          float cone = smoothstep(0.78, 0.97, dot(-Lv, lampDir));
          col += t.rgb * vec3(1.0, 0.93, 0.8) * lampOn * cone * abs(dot(N, Lv)) * 1.3 / (0.9 + d * d * 0.14);
        }
        col *= exposure;
        float fd = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-pow(fogDensity * fd, 2.0));
        fragColor = vec4(mix(col, fogColor, fog), 1.0);
      }
    `,
  });
}

export function makeGlassMaterial(world: THREE.ShaderMaterial) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { fogColor: world.uniforms.fogColor!, fogDensity: world.uniforms.fogDensity! },
    vertexShader: /* glsl */ `
      in vec4 rgba;
      out vec4 vCol;
      out vec3 vWorld;
      void main() {
        vCol = rgba;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fogColor;
      uniform float fogDensity;
      in vec4 vCol;
      in vec3 vWorld;
      out vec4 fragColor;
      void main() {
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        float fr = pow(1.0 - abs(dot(N, V)), 3.0);
        float a = clamp(vCol.a + fr * 0.45, 0.0, 0.9);
        float fd = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-pow(fogDensity * fd, 2.0));
        fragColor = vec4(mix(vCol.rgb * 0.5 + fr * 0.3, fogColor, fog), a * (1.0 - fog));
      }
    `,
  });
}

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: { bright: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float bright;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.80, 0.81, 0.80);
        vec3 zenith = vec3(0.55, 0.62, 0.72);
        vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.7, h));
        c = mix(c, vec3(0.62, 0.63, 0.62), smoothstep(0.0, -0.2, vDir.y));
        gl_FragColor = vec4(c * bright, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// The Reyers tower: always on the horizon, never any closer.
export function makeTower() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.52, 0.54, 0.56), fog: false });
  const dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.44, 0.46), fog: false });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(11, 150, 11), mat);
  shaft.position.y = 75;
  g.add(shaft);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(26, 20, 9, 32), dark);
  saucer.position.y = 150;
  g.add(saucer);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 2, 32), mat);
  lip.position.y = 155;
  g.add(lip);
  for (let k = 0; k < 6; k++) {
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.2, 12), mat);
    const a = (k / 6) * Math.PI * 2;
    dish.position.set(Math.cos(a) * 16, 159, Math.sin(a) * 16);
    dish.rotation.z = Math.PI / 2;
    dish.rotation.y = -a;
    g.add(dish);
  }
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 30, 1.2), mat);
  mast.position.y = 172;
  g.add(mast);
  g.renderOrder = -5;
  return g;
}
