# FLUX CITY

An architecture-focused open-world sandbox for the browser: a ~4 × 4 km futuristic city of
parametric buildings, generated deterministically from a seed, built with Vite, TypeScript,
three.js, Rapier and postprocessing. Every asset is procedural — no downloaded models,
textures or audio.

**Status: phases 1–2 of 8 complete.** The current build is a streamed, explorable city with
a debug fly camera. Characters, vehicles, flight, missions and the full UI arrive in later phases.

## Run

```bash
npm install
npm run dev        # http://localhost:5173/Video-game/
npm run typecheck
npm run lint
npm run build
```

Pushing to `main` runs `.github/workflows/deploy.yml` (typecheck → lint → build → GitHub Pages).

## Debug controls (current build)

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Fly | WASD | Left stick |
| Look | Mouse (click to lock pointer) | Right stick |
| Up / down | R / F | RT / LT |
| Boost | Shift | B / ○ |
| Scrub time of day | Q / E | LB / RB |
| Cycle quality preset | V | D-pad up |
| Controller test screen | C | View / Share |
| Performance overlay | F3 | L3 + R3 |

Button prompts switch automatically between keyboard, Xbox and PlayStation glyphs based on the
last-used device.

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
  game.ts                 wires the subsystems together (phase 2: world + fly camera)
  core/                   fixed-step loop, events, settings, seeded RNG/noise, Rapier wrapper
  input/                  InputManager, bindings, glyphs, rumble
  render/                 renderer + post FX, sky/day-night, quality presets,
                          procedural textures, material library, facade texture atlas
  world/                  layout (districts, water), terrain heightfield, highway profile,
                          road graph + meshes, city planner, chunk streaming, colliders, water
  world/architecture/     generators: loftTower, diagridSkin, ribbonBuilding, shellCanopy,
                          dome, terrace/block/hangar massing, bridges (cable/arch/catenary)
  ui/                     toasts, perf overlay, controller test
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
