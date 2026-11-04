import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform mat4 inverseProjection;
  uniform mat4 inverseView;
  varying vec3 vRay;

  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0);
    vec4 viewPosition = inverseProjection * vec4(position.xy, 1.0, 1.0);
    viewPosition /= viewPosition.w;
    vRay = mat3(inverseView) * viewPosition.xyz;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform float time;
  varying vec3 vRay;

  void main() {
    vec3 direction = normalize(vRay);
    float height = direction.y;

    vec3 zenith = vec3(0.16, 0.31, 0.58);
    vec3 upper = vec3(0.45, 0.58, 0.78);
    vec3 horizon = vec3(0.97, 0.68, 0.42);
    vec3 below = vec3(0.55, 0.40, 0.32);

    float above = clamp(height, 0.0, 1.0);
    vec3 color = mix(horizon, upper, smoothstep(0.0, 0.22, above));
    color = mix(color, zenith, smoothstep(0.12, 0.72, above));
    color = mix(color, below, clamp(-height * 3.5, 0.0, 1.0));

    float sunDot = max(dot(direction, normalize(sunDirection)), 0.0);
    color += vec3(1.0, 0.78, 0.42) * pow(sunDot, 6.0) * 0.55;
    color += vec3(1.0, 0.92, 0.75) * smoothstep(0.9992, 0.9998, sunDot);

    float band = direction.x * 7.5 + direction.z * 5.5 + time * 0.03;
    float cloud = sin(band) * sin(band * 0.37 + 2.0);
    float cloudMask = smoothstep(0.25, 0.95, cloud * 0.5 + 0.5);
    cloudMask *= smoothstep(0.02, 0.18, height) * (1.0 - smoothstep(0.45, 0.8, height));
    vec3 cloudColor = mix(vec3(0.95, 0.62, 0.42), vec3(1.0, 0.9, 0.82), sunDot);
    color = mix(color, cloudColor, cloudMask * 0.42);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSky() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3),
  );

  const elevation = 7.5;
  const azimuth = 205;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection.clone() },
      time: { value: 0 },
      inverseProjection: { value: new THREE.Matrix4() },
      inverseView: { value: new THREE.Matrix4() },
    },
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, material, sunDirection };
}

export function updateSky(sky, camera) {
  camera.updateMatrixWorld();
  sky.material.uniforms.inverseView.value.copy(camera.matrixWorld);
  sky.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
}
