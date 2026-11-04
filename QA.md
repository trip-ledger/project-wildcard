# QA

Measured on this branch against `vite preview` of `npm run build`. Lighthouse 12.8.2, headless Chrome, software WebGL (SwiftShader). The URL was `http://127.0.0.1:4173/?date=2026-06-15`. Desktop uses the Lighthouse desktop preset. Mobile uses the default mobile preset (slow 4G, 4× CPU). Each score is one lab run. A point or two of movement between runs is normal.

The "before" column is the parent branch `cursor/qa-ghost-replay-5294` at `5fc133c`, same tool and flags.

## Lighthouse

| Form | | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | Before | 69 | 100 | 100 | 0.4 s | 0.4 s | 1,700 ms | 0 | 1.1 s |
| Desktop | After | 95 | 100 | 100 | 0.4 s | 0.4 s | 180 ms | 0 | 0.5 s |
| Mobile | Before | 77 | 100 | 100 | 1.7 s | 1.7 s | 1,010 ms | 0 | 1.7 s |
| Mobile | After | 83 | 100 | 100 | 1.7 s | 1.7 s | 650 ms | 0 | 1.7 s |

Desktop Performance, Accessibility, and Best Practices are all above 85. Mobile Accessibility and Best Practices are 100. Mobile Performance is 83. The remaining blocking time is one script-evaluation task for the three.js bundle. Under the mobile 4× CPU simulation that task is about 650 ms, which is most of the Total Blocking Time. The prebuilt `three` module is a single script, so it evaluates as one task.

Repeat the run with `npm run build` and `npm run test:lighthouse`.

## Browser matrix

`npm run test:smoke` after `npm run build`. One worker. About one minute locally. Passed with no console errors and no page errors.

| Project | Browser | Viewport | Touch | Journey | Ghost round-trip |
| --- | --- | --- | --- | --- | --- |
| chromium | Chromium | 1280×720 | no | passed | passed (two tests) |
| firefox | Firefox | 1280×720 | no | passed | skipped (covered by the journey toggle) |

Firefox in GitHub Actions has no GPU and no bundled SwiftShader. CI installs `libgl1-mesa-dri`, starts the smoke test under Xvfb, and the Firefox project forces Mesa's software rasterizer with the content and GPU sandboxes off. Without that, WebGL never starts and the menu never appears.

On a slow runner each flight step is capped at 50 ms, so the opening ring can take longer than 15 s of wall clock. The journey waits up to 40 s for that ring.
| webkit | WebKit | 1280×720 | no | passed | skipped |
| mobile-chrome | Chromium | Pixel 5 (393×851, device scale 2.625) | yes | passed | skipped |

The journey, on every project:

- Title screen, with Tab and Shift+Tab through Play, Today's Route, Controls, Settings, and About
- Fly for about 10 seconds and pass the opening ring
- On the phone project, the stick and throttle are visible and a tap hits the throttle
- Pause and resume
- Settings: mute, reduced motion on, hide the ghost
- Results card from the debug finish path, then Fly again and Main menu

Frame-time sample while flying (median / p95), software WebGL. The test fails only if the median stalls past 500 ms.

| Project | Median | p95 |
| --- | ---: | ---: |
| chromium | 33.4 ms | 50.1 ms |
| firefox | 17.1 ms | 33.3 ms |
| webkit | 30.0 ms | 34.0 ms |
| mobile-chrome | 16.7 ms | 16.7 ms |

`npm test` (ghost recording) and `npm run test:budget` also passed. The built JavaScript is 614,483 bytes, gzip 159,187, under the 800,000 byte budget.

## What changed

- Menus no longer run the flight loop. The title, pause, and results views paint one still. The loop runs while flying and during the short crash reset.
- That still is capped at 1× and does not render shadows. Entering flight restores the quality preset, including shadows on High.
- Startup yields between the heavier scene stages, and terrain yields between islands, so construction is not one unbroken task.
- `index.html` has a description meta tag. The viewport tag was already present.
- Playwright covers Chromium, Firefox, WebKit, and a Pixel 5 project. The two longer ghost recording tests stay on Chromium so the matrix stays about a minute.
- `npm run test:lighthouse` runs the desktop and mobile labs. `.github/workflows/lighthouse.yml` is `workflow_dispatch` only, so pull-request CI does not wait on it.

## Remaining

- Mobile Lighthouse Performance is 83, short of 85, because evaluating three.js is one long task under 4× CPU. Cutting that further means shipping three.js as separately evaluated pieces. A source-barrel build did not shrink the bundle (it went from about 614 KB to about 620 KB).
- The menu views do not animate. The sky, ocean, and clouds move again in flight.
- Lighthouse still reports roughly 55 KB of unused JavaScript and no source maps. Those diagnostics are not part of the Performance score.
- Scores above are one run each. `npm run test:lighthouse` prints a fresh pair.
