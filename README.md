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
| Esc / P | Pause |

The title screen is Play, Today's Route, Controls, Settings, and About. About shows `CREDITS.md`. Settings cover mute, volume, graphics quality (Low, Medium, High), invert pitch, reduced motion, and the ghost jet. Reduced motion follows the system setting until you choose otherwise, and it tones down camera shake and the sun/ring glow.

On a phone, or any window narrower than about 820px, a stick on the left pitches and rolls, and the slider on the right sets throttle. Keyboard still works beside those controls. A standard gamepad maps the left stick to pitch and roll, the right stick and bumpers to yaw, and the triggers to throttle. Start pauses. In a menu, the D-pad or left stick moves, A activates, and B goes back.

Menus are buttons. Tab and the arrow keys move between them, and the focused control draws a visible ring.

Banking also turns the nose (yaw follows bank). The readout is indicated airspeed in knots, altitude in feet, and heading in degrees. The bar under the numbers is throttle. The instruments sit on a dark panel so the type stays readable over the sky.

Click the view if the keys do nothing; the page has to be focused. There is also a Mute button and a Pause button on the view.

## Daily rings

Each local day (`YYYY-MM-DD`) builds one course of 6–10 glowing rings among the islands. The same date is the same course. The last ring is the finish. A small marker at the top points toward the next ring.

The clock starts when the first ring is resolved. It pauses while the pause menu is open. Flying through a ring scores 1,200. Missing one costs 500. Each second costs 20. A smooth flight, with little sudden pitch or bank, adds up to 300. The finish card shows time, rings hit, and score. Fly again restarts the same course. Main menu returns to the title screen.

The page does not talk to a server. This browser keeps today's best and an all-time best in localStorage, along with the settings. Refresh starts over at the title screen; the course for that date stays put.

Finishing a run stores a short recording when that score beats the ghost already saved for the route seed. The next attempt of the same route draws it as a pale translucent jet. Hide it from Settings. Samples are position and rotation about eight times a second, quantized, and capped so one route stays under about 16KB. This browser keeps two seeds. A best score from before recordings existed has no ghost until a run is finished.

Sound is synthesized in the page: an engine hum that follows the throttle, wind that follows airspeed, a soft chime for a ring, and a short thud if you hit terrain. It stays silent until a click or a key press.

`?date=YYYY-MM-DD` pins the course. `?complete=1` finishes it immediately. `?play=1` skips the title screen. `?debug=1` adds `window.__debug()`, `window.__selfTest()`, and helpers that plant or save a ghost recording.

## Notes

Flight is an arcade approximation: thrust, drag, gravity, and a lift term that holds altitude near cruise speed and lets you sink in a steep bank or when you get slow. The chase camera sits behind the aircraft.

Island height for the aircraft and the camera is sampled from the triangles that are actually drawn. Hitting that ground crashes the flight, shows a short message, and resets today's route. The camera is lifted so it does not sit inside the terrain. Over open water the aircraft still rides a few metres above the waves.

The view starts at the display resolution, capped by the graphics setting (about 720p on Low, 1080p on High). Phones aim at about 30fps and desktops at about 60. If frames stay slow, it steps the pixel ratio down, then turns shadows off, then thins the clouds. Shadows are part of the High setting. Rendering pauses while the tab is hidden.

The page title is the placeholder `Untitled`.

## Test

Node 22 or newer. The smoke test builds nothing by itself; run the build first. It serves `dist/` and drives headless Chromium (software WebGL is enough).

```bash
npm test
npm run build
npm run test:budget
npm run test:smoke
```

`npm test` checks the ghost recording format. `npm run test:budget` fails if the built JavaScript exceeds the byte budget in `tests/bundle-budget.mjs`. The smoke test loads the title screen with no console errors, flies for a few seconds, checks that the HUD moves, opens and closes the pause menu, checks a phone-sized viewport for the touch controls, and checks the ghost jet. It logs a frame-time sample. That sample fails the run only if frames stall.
