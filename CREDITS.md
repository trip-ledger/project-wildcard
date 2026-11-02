# Credits

Everything drawn in the scene so far is procedural or written for this project.

- The aircraft is built from Three.js primitives (cylinders, cones, boxes, spheres). There is no imported model.
- The ocean color, waves, and sun glint are an original shader.
- The sky is an original gradient with a sun disc and simple cloud bands.
- Islands are an original low-poly height field: placed domes, value noise, and height-based vertex colours. No heightmap image is included.
- Cloud puffs are an original canvas texture (soft radial blobs) drawn onto instanced cards. No cloud photograph or sprite sheet is included.
- Course rings are Three.js torus meshes with original colours. No imported model.
- The engine hum, wind, gate chime, and crash thud are synthesized in the browser with the Web Audio API. No audio files are included.
- The ghost jet is the same procedural aircraft, drawn with a translucent material. No extra model is included.
- The share image (`public/og.png`, 1200×630) is drawn by `scripts/share-card.mjs` from the same golden-hour colours as the sky. No photograph is included. The build writes that file again.
- No photographs, downloaded fonts, logos, or third-party art packs are included.

Third-party software:

- [three.js](https://github.com/mrdoob/three.js) — MIT License
- [Vite](https://github.com/vitejs/vite) — MIT License
- [Playwright](https://github.com/microsoft/playwright) — Apache License 2.0. Development dependency used by the browser tests. It is not part of the game page.
- [Lighthouse](https://github.com/GoogleChrome/lighthouse) — Apache License 2.0. Development dependency used by `npm run test:lighthouse`. It is not part of the game page.
