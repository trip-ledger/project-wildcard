import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float time;
  varying vec3 vWorldPos;
  varying float vHeight;

  float waveHeight(vec2 p) {
    float h = sin(p.x * 0.04 + time * 0.7) * 0.5;
    h += sin(p.y * 0.031 - time * 0.55) * 0.38;
    h += sin((p.x + p.y) * 0.02 + time * 0.35) * 0.72;
    return h;
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float height = waveHeight(world.xz);
    world.y += height;
    vWorldPos = world.xyz;
    vHeight = height;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 fogColor;
  uniform float fogDensity;
  varying vec3 vWorldPos;
  varying float vHeight;

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    if (normal.y < 0.0) normal = -normal;
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6);

    float shoal = sin(vWorldPos.x * 0.0026 + vWorldPos.z * 0.00215);

    vec3 deep = vec3(0.012, 0.045, 0.07);
    vec3 mid = vec3(0.035, 0.14, 0.15);
    vec3 col = mix(deep, mid, shoal * 0.25 + 0.5);

    vec3 sunDir = normalize(sunDirection);
    float sunFace = max(dot(reflect(-viewDir, normal), sunDir), 0.0);
    vec3 reflection = mix(vec3(0.42, 0.36, 0.34), vec3(0.62, 0.34, 0.16), sunFace);
    col = mix(col, reflection, fresnel * 0.62);

    float spec = max(dot(normal, normalize(viewDir + sunDir)), 0.0);
    spec = spec * spec;
    spec = spec * spec;
    spec = spec * spec;
    col += vec3(1.0, 0.78, 0.48) * spec * 0.85;

    float foam = smoothstep(0.9, 1.5, vHeight);
    col = mix(col, vec3(0.85, 0.8, 0.74), foam * 0.18);

    float dist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    col = mix(col, fogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createOcean(fogColor, fogDensity) {
  const geometry = new THREE.PlaneGeometry(16000, 16000, 48, 48);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      fogColor: { value: fogColor.clone() },
      fogDensity: { value: fogDensity },
    },
    vertexShader,
    fragmentShader,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}
