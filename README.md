# Untitled

A small browser flight scene: one aircraft, open water, a few low-poly islands, clouds, and keyboard or touch controls.

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
| M | Mute or unmute |

On a phone, or any window narrower than about 820px, a stick on the left pitches and rolls, and the slider on the right sets throttle. Keyboard still works beside those controls. A standard gamepad maps the left stick to pitch and roll, the right stick and bumpers to yaw, and the triggers to throttle.

Banking also turns the nose (yaw follows bank). The readout is indicated airspeed in knots, altitude in feet, and heading in degrees. The bar under the numbers is throttle.

Click the view if the keys do nothing; the page has to be focused. There is also a Mute button on the view.

## Daily rings

Each local day (`YYYY-MM-DD`) builds one course of 6–10 glowing rings among the islands. The same date is the same course. The last ring is the finish. A small marker at the top points toward the next ring.

The clock starts when the first ring is resolved. Flying through a ring scores 1,200. Missing one costs 500. Each second costs 20. A smooth flight, with little sudden pitch or bank, adds up to 300. The finish card shows time, rings hit, and score. Fly again restarts the same course.

The page does not talk to a server. This browser keeps today's best and an all-time best in localStorage. Refresh starts the flight over; the course for that date stays put.

Sound is synthesized in the page: an engine hum that follows the throttle, wind that follows airspeed, and a soft chime for a ring. It stays silent until a click or a key press.

`?date=YYYY-MM-DD` pins the course. `?complete=1` finishes it immediately. `?debug=1` adds `window.__debug()` for checks.

## Notes

Flight is an arcade approximation: thrust, drag, gravity, and a lift term that holds altitude near cruise speed and lets you sink in a steep bank or when you get slow. The chase camera sits behind the aircraft. Islands are a height field; the aircraft is held just above the surface instead of falling through it. Over open water it still rides a few metres above the waves.

The view starts at the display resolution, capped so the framebuffer stays around 1080p. If frames run long, it steps the internal resolution down until the scene is near 60fps.
