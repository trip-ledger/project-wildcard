import * as THREE from 'three';

function sweptPanel(span, thickness, chord, sweep, material, rootInset) {
  const geometry = new THREE.BoxGeometry(span, thickness, chord);
  geometry.translate(span * 0.5 - rootInset, 0, 0);
  geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, sweep, 0, 0, 0, 0));
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

function mirror(mesh) {
  const copy = mesh.clone();
  copy.scale.x = -1;
  copy.rotation.z = -mesh.rotation.z;
  copy.material = mesh.material;
  return copy;
}

export function createJet() {
  const jet = new THREE.Group();
  jet.name = 'aircraft';

  const paint = new THREE.MeshStandardMaterial({
    color: 0xf3f0e8,
    metalness: 0.22,
    roughness: 0.46,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb7bcc2,
    metalness: 0.72,
    roughness: 0.28,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a242e,
    metalness: 0.55,
    roughness: 0.16,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xd4652f,
    metalness: 0.08,
    roughness: 0.52,
  });
  const hot = new THREE.MeshBasicMaterial({ color: 0xffb15a });

  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 6.4, 20), paint);
  cabin.rotation.x = Math.PI / 2;
  cabin.position.set(0, 0, -0.15);
  jet.add(cabin);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.78, 3.05, 20), paint);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -4.85);
  jet.add(nose);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.78, 4.3, 20), paint);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.02, 4.05);
  jet.add(tail);

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    glass,
  );
  cockpit.scale.set(1.05, 0.7, 1.85);
  cockpit.position.set(0, 0.46, -3.05);
  jet.add(cockpit);

  for (const side of [1, -1]) {
    const windows = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 3.05), glass);
    windows.position.set(side * 0.76, 0.4, -0.45);
    jet.add(windows);
  }

  const rightWing = sweptPanel(7.5, 0.12, 2.25, 0.4, paint, 0.45);
  rightWing.position.set(0, -0.15, 0.15);
  rightWing.rotation.z = 0.06;
  jet.add(rightWing);
  jet.add(mirror(rightWing));

  const rightStab = sweptPanel(2.35, 0.09, 1.2, 0.42, paint, 0.7);
  rightStab.position.set(0, 0.28, 5.15);
  jet.add(rightStab);
  jet.add(mirror(rightStab));

  const finGeometry = new THREE.BoxGeometry(0.16, 2.15, 1.55);
  finGeometry.translate(0, 1.05, 0);
  finGeometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0.5, 0, 0));
  const fin = new THREE.Mesh(finGeometry, paint.clone());
  fin.material.side = THREE.DoubleSide;
  fin.position.set(0, 0.2, 4.45);
  jet.add(fin);

  const finMark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.28), accent);
  finMark.position.set(0, 1.55, 5.15);
  jet.add(finMark);

  function engine(side) {
    const group = new THREE.Group();
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 2.35, 14), metal);
    nacelle.rotation.x = Math.PI / 2;
    group.add(nacelle);

    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14), glass);
    intake.rotation.x = Math.PI / 2;
    intake.position.z = -1.12;
    group.add(intake);

    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 10), hot);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 1.42;
    group.add(exhaust);

    group.position.set(side * 0.95, 0.22, 3.55);
    return group;
  }

  jet.add(engine(1));
  jet.add(engine(-1));

  function lamp(color, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  }

  jet.add(lamp(0xd24a4a, -7.7, 0.25, 2.9));
  jet.add(lamp(0x3ecf73, 7.7, 0.25, 2.9));
  jet.add(lamp(0xf4f7fb, 0, 0.22, 6.25));

  return jet;
}
