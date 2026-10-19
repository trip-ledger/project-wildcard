# Untitled

A small browser flight scene: one aircraft, open water, and keyboard controls.

## Run

Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open the URL Vite prints, usually http://localhost:5173.

```bash
npm run build
npm run preview
```

`npm run build` writes a static bundle to `dist/`. `npm run preview` serves that bundle locally.

## Controls

| Key | Action |
| --- | --- |
| W / S | Pitch up / pitch down |
| A / D | Roll left / roll right |
| Q / E | Yaw left / yaw right |
| Shift | Increase throttle |
| Ctrl | Decrease throttle |

Banking also turns the nose (yaw follows bank). The readout in the lower-left is indicated airspeed in knots, altitude in feet, and heading in degrees. The bar under the numbers is throttle.

Click the view if the keys do nothing; the page has to be focused.

## Notes

Flight is an arcade approximation: thrust, drag, gravity, and a lift term that holds altitude near cruise speed and lets you sink in a steep bank or when you get slow. The chase camera sits behind the aircraft.

The page does not talk to a server, save progress, or collect data. Refresh to start again.

The view starts at the display resolution, capped so the framebuffer stays around 1080p. If frames run long, it steps the internal resolution down until the scene is near 60fps.
