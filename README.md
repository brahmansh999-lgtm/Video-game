# FLUX CITY

An architecture-focused open-world sandbox for the browser: a ~4 × 4 km futuristic city of
parametric buildings, generated deterministically from a seed, built with Vite, TypeScript,
three.js, Rapier and postprocessing. Every asset is procedural — no downloaded models,
textures or audio.

**Status: phases 1–4 of 8 complete.** Explore on foot, drive three classes of car and fly three
aircraft (light sports plane, jet, VTOL air taxi) with a full aerodynamic model and flight HUD.
Traffic, pedestrians, weather, missions and menus arrive in later phases.

## Run

```bash
npm install
npm run dev        # http://localhost:5173/
npm run typecheck
npm run lint
npm run build
```

Live build: https://video-game-ruby.vercel.app/ — Vercel redeploys on every push to `main`.
`.github/workflows/ci.yml` runs typecheck → lint → build on pushes and pull requests.

## Controls

Keyboard/mouse and controller work interchangeably; prompts follow the last-used device.

| Action | On foot | Car | Aircraft / VTOL | Keyboard |
|---|---|---|---|---|
| Left stick | Move | Steer | Roll / pitch | WASD |
| Right stick | Camera | Camera | Free-look | Mouse (click to lock) |
| RT / R2 | — | Accelerate | Throttle up | W (car) / R (air) |
| LT / L2 | Focus | Brake / reverse | Throttle down (at idle: wheel brakes) | S (car) / F (air), RMB focus |
| LB / RB | — | — | Rudder | Q / E |
| A / ✕ | Jump | Handbrake | Landing gear | Space / Space / G |
| B / ○ | Sprint | Horn | Flaps cycle | Shift / H / Z |
| X / □ | — | — | VTOL hover ⇄ cruise | X |
| Y / △ | Enter vehicle (within 3 m) | Exit | Exit (landed and stopped) | F |
| D-pad up | — | — | Camera: chase / cockpit / wing / orbit | V |
| View / Share | Controller test | Controller test | HUD: full / minimal / off | C |
| R3 | Free camera | Look back | Look back | P / B |
| L3 + R3 | Performance overlay | | | F3 |

Debug keys: F1 controller test, F2 cycle quality preset, `[` / `]` scrub time of day.

## Flight model

Per physics step (60 Hz) the aircraft gets lift `L = ½ρV²S·C_L(α)` with a linear lift curve that
stalls past ~15° AoA and blends into flat-plate behaviour; parasitic + induced drag (reduced in
ground effect), flap and gear drag; thrust (propeller thrust fades with speed, jet thrust gains
ram); and pitch/roll/yaw moments from static stability, control surfaces (kept alive at low speed
by propwash) and rate damping. Post-stall, roll damping collapses and yaw rate drives
autorotation, so a stall with rudder becomes a spin that is recoverable with opposite rudder and
forward stick. Landing gear are ray-cast spring/dampers with rolling, braking and lateral tyre
friction; the nose wheel steers at taxi speed. Touchdowns are scored on vertical speed and
centreline offset. Crashes (impacts, hard landings, ditching, wingtip strikes) respawn you at the
runway or the nearest vertiport. The VTOL has an altitude-holding hover mode with attitude
stabilisation and a gradual tilt transition to wing-borne flight.

Parked aircraft: light plane, jet and VTOL on the Aeroport apron; a VTOL on each of the six
rooftop vertiports.

## Quality presets

| Preset | Shadows | Post FX | Water reflections | Draw distance | LOD switch (m) |
|---|---|---|---|---|---|
| Low | off | tone mapping only | no | 1000 m | 260 / 520 |
| Medium | 1024² | bloom, SMAA | no | 1500 m | 340 / 700 |
| High | 2048² | bloom, SMAA | yes | 2100 m | 420 / 900 |
| Ultra | 4096² | bloom, SMAA, god rays | yes | 2800 m | 560 / 1200 |

## Architecture overview

```
src/
  main.ts                 bootstrap, loading screen, error overlay
  game.ts                 wires the subsystems together
  core/                   fixed-step loop, events, settings, seeded RNG/noise, Rapier wrapper
  input/                  InputManager, bindings, glyphs, rumble
  render/                 renderer + post FX, sky/day-night, quality presets,
                          procedural textures, material library, facade texture atlas
  world/                  layout (districts, water), terrain heightfield, highway profile,
                          road graph + meshes, city planner, chunk streaming, colliders, water
  world/architecture/     generators: loftTower, diagridSkin, ribbonBuilding, shellCanopy,
                          dome, terrace/block/hangar massing, bridges (cable/arch/catenary)
  player/                 character controller, procedural figure, camera rig, player state machine
  vehicles/               cars (Rapier ray-cast vehicle), aircraft, flightModel.ts, landing gear
  audio/                  WebAudio engine: synthesized engines, wind, horn, stall warning
  ui/                     HUD, flight HUD, toasts, perf overlay, controller test
```

**World.** Six districts — Flux Core, Ribbon Waterfront, Canopy Gardens, Maglev Ring,
Aeroport and Outer Hills — on a 513 × 513 (8 m) heightfield shared by rendering and physics.
A 160 m road grid, a hills highway (with terrain cut/fill and bridge decks), a coastal ribbon
drive and four river bridges form the road graph. Buildings are pure data specs that are meshed
per 256 m chunk at three detail levels (LOD2 collapses each chunk to one or two draw calls).
Every building has a simple Rapier collider (convex hull, boxes or cylinders), never a
render trimesh.

**Rendering budget.** All facade styles share one atlas material so each chunk costs a single
facade draw call; structural members and trees are instanced. Measured in the densest district
(Flux Core): ~200 draw calls and ~270k triangles on High, ~280 calls on Ultra at night.
