# HANDOFF: "What If" video engine (full overview up to 21 Oct 2026)

Give this file to any new Claude session (together with the engine folder) and it can continue the work.

---

## 1. Who the user is and what they want

- Makes faceless "What if…" science videos for **YouTube (long, 16:9)** and **TikTok (≈60 s, 1080×1920 vertical)**.
- **Language rules:**
  - Talk to the user in **Roman Urdu**, keep replies short (the user cares about tokens and limits).
  - All on-screen text, captions and document text are in **English**.
- **Hard rules from the user:**
  1. **No voiceover.** Text captions + HUD + SFX + music bed only.
  2. **Rendering happens on the user's Windows PC** (about 25× faster than the cloud). Never render full videos in the cloud; render only stills or short checks.
  3. **Always show a short demo first** (10 s, or the first part) and get an OK before building or rendering the full video.
  4. **When asked to watch a reference video, view EVERY frame at 30 fps.** Never sample at 2 fps or "do it your own way". The user was very upset when this was skipped.
  5. **Physics must be real** ("deep physics"). Every number in a caption is computed, and false claims are softened or removed.
  6. Quality bar is **"close to perfect"**: dramatic, cinematic, the viewer must not leave. The user will provide any resources needed.
  7. **Original visuals only.** No copyrighted characters or logos.
- **No Python on the user's PC.** Audio (.wav) is made in the cloud and shipped inside the pack.

## 2. Delivery workflow ("video pack")

- The user keeps **ONE engine folder** on the PC (they extracted it once and keep it; it is `D:\remotioj\...`, a Remotion project).
- For each video Claude delivers a small **pack zip**: `out/packs/<Id>-pack.zip`. It contains:
  - `src/timelines/<file>.json` (the video),
  - `public/audio/<Id>.wav` (synthesised in the cloud),
  - `RENDER-<Id>.bat` (full render),
  - `RENDER-<Id>-10s-DEMO.bat` (first 10 s),
  - with `--engine`: also `src/engine`, `src/scenes`, `src/data`, `public/models`, `public/tex`, `public/hdr`, `public/draco`, `Root.tsx`, `index.ts`, `README.md`, `package.json`, `tsconfig.json`.
- **What the .bat does:**
  1. Checks it is inside the engine folder (package.json exists).
  2. Checks Node.js.
  3. Runs `npm i` only if `node_modules` is missing.
  4. Runs `npx remotion render src/index.ts <Id> out\<Id>.mp4 --gl=angle`.
  5. Opens `out\`.
- **The user's steps:** extract the pack INTO the engine folder (replace files), then double-click the .bat.
- **Build a pack (cloud):** `python3 tools/make_pack.py src/timelines/<file>.json [--engine]`.

## 3. Engine (Remotion 4.0.536 + React Three Fiber 8.18 + three 0.169)

Project root: `whatif-engine/`.

- **`src/timelines/*.json`:** every file automatically becomes a composition (require.context in `Root.tsx`).
- **Timeline schema (`src/engine/types.ts`):**
  - `meta` {id, title, fps, width, height, fovScale, music{keys, root}}
  - `hud.clock` {label, keys[[t,v]], format number|hms|countdown…, unit, decimals, style minimal, sub}
  - `segments[]` {id, from, to, scene, params, camera, effects, transitionIn, captions, sfx, ambience, hud}
- **Values (`Val`):** a number, or keyframes `[[t,v],…]` (linear; times are LOCAL to the segment).
- **Cameras:**
  - pov-walk, pov-stand, orbit, dolly, keys (pos/look keyframes, `ease:'linear'`, roll).
  - Run scenes use `params.rig` {mode front|low|side|rear|aerial|top|up, dist, height, side, ahead, look, fov}, relative to the hero.
- **Effects:**
  - blur, doubleVision, chroma, eyelids, microsleep, shake, vignette, glare, desaturate, flash[], tunnel, tint, fade.
  - **speedLines** (anime radial lines).
  - **impact[{at,dur}]** (manga impact frames: black/white inverted with radial lines).
- **Captions:**
  - `style:'subtle'` = cinematic serif with fade.
  - `'|'` = line break; the 2nd line is italic.
  - `'top'` style is for the title.
  - Fades are guarded for short captions (a 0.55 s caption crashed a render once; now fixed).
- **HUD clock:** minimal serif speed counter ("SPEED ×2 EVERY 2 SECONDS", km/h; decimals only below 1000).
- **Audio:** `audio/build_audio.py` (numpy/scipy).
  - Music bed follows `meta.music.keys`.
  - Ambience per scene, including `wind`, `roar`, `space`, `slowmo`, `street`.
  - SFX: footsteps, whoosh, boom, crash, riser, hum, thud, glitch, beep, heartbeat, screech, horn, warble…

### Key engine files

- `src/engine/scenes.tsx`: SCENES registry. Each scene has `about` text describing its params. Helper `evo()` evaluates keyframes inside object params (e.g. `params.hero.x`).
- `src/scenes/fx3d.tsx`:
  - `useGLB` (Draco supported; decoder in `public/draco/`).
  - `Env` (HDR image-based lighting).
  - `useTex`.
  - `Post`: bloom + depth of field (EffectComposer, no extra npm deps).
  - **`Redraw`:** IMPORTANT fix. Remotion only advances R3F on frame change, so assets that load late were missing from frames. Every canvas includes `<Redraw deps={[assets]}/>`, and `continueRender` fires only after commit.
- `src/scenes/hero.tsx`: **the HERO** (see §4).
- `src/scenes/City2.tsx`: realistic city v2.
  - Physical Sky (darkened ×0.42) and reflective glass facades.
  - Trees, lamp posts, real cars, pedestrians (hero clones in other suit colours).
  - Effects: papers/leaves in the wake, window shards (`shockV`), footstep **blasts** (fireball, smoke, debris, crater; they throw cars).
  - Aura, cone, trail, flames.
- `src/scenes/Land2.tsx`: treadmill countryside v2. The hero stays at the origin and the world scrolls +z.
  - biome road | water | highway | rails | farm.
  - Real sky panorama (Poly Haven kloofendal, CC0) plus quarry HDR lighting.
  - three `Water.js` with reflections.
  - Procedural grass, asphalt and farm shaders.
  - Train, jet, highway cars.
  - Water splashes per footstep, road **craters** per footstep, vapour cone, sonic-boom domes, fire, flames, burn trail.
- `src/scenes/cars.tsx`: car factory (three.js ferrari.glb, recoloured body).
- `src/scenes/runner.tsx`: shared effects:
  - `Puffs` (soft particles with per-point size/alpha, optional texture), `sprayData`.
  - `Trail`, `ShockDomes`, `MachCone` (particle condensation cone), `Aura`, `FeetFire`, `rigCam`.
- **Old scenes (still present):**
  - Street, Room, City, Brain, Supermarket, Bus, Meeting, NightStreet, Hospital, FrictionCity, Planet, RunCity, RunLand.
  - `Planet.tsx` (Earth, radius 10) has:
    - ring of fire (`ring`, `ringArc`, `ringHead`, `ringA`/`ringB` lon/lat or `ringNormal`),
    - ISS, Moon foreground, plate-boundary glow.
    - It still uses a procedural Earth texture; the real textures in `public/tex/` are NOT wired in yet.
- **Dev tools:**
  - `stills.mjs` (cloud check): `node stills.mjs <CompId> <outDir> <frame…>`, using Chromium at `/tmp/chromium` (@sparticuz/chromium) with `--gl=swangle`; `LOG=1` prints the browser console.
  - Bundle first: `npx remotion bundle src/index.ts --out-dir build`.
  - Test timelines `src/timelines/zz-*.json` (HeroTest, City2Test, Land2Test) are dev-only.

### Assets (in `public/`)

- `models/man.glb`: Ready Player Me avatar from the three.js examples.
- `models/Xbot.glb`: the animation source.
- `models/car.glb`: ferrari, Draco-compressed.
- `tex/`:
  - earth_day/night/clouds/normal/specular, moon_1024,
  - waternormals, smoke1.png,
  - kloofendal panorama, firetorch, cloud.
- `hdr/`: pedestrian_overpass_1k, quarry_01_1k.
- **Source:** github.com/mrdoob/three.js r169 `examples/` (fetched with a blobless sparse git clone; GitHub raw works from the cloud, other sites are blocked).
- Avoid `grasslight-big` (CC-BY, needs attribution).

## 4. The hero (`hero.tsx`)

- Realistic bearded Victorian-style man with a moustache, bowler hat and suit.
  - Suit recoloured from peach tweed to **navy (#222b44)** by shader; the purple vest, white shirt, bow tie and rose are kept.
- **Retargeting:**
  - Xbot's Mixamo walk/run clips are retargeted at load time in world space: rest directions are aligned first, then `Wt = Ws·Rs⁻¹·Rt`.
  - Clips: walk, run, and **sprint** (run with ×1.3 amplitude).
- `poseHero(h, phase, run, sprint, lean)`: lean = torso pitch into the wind.
- `hatHero(h, fly)`: the hat blows off. The headwear mesh is split by shader into hat and hair; under the hat he is **bald with side curls** (a funny reveal).
- `heatHero(h, heat, t)`:
  - 0–0.5: charring + glowing embers + hot rim.
  - 0.5–1: white-hot plasma.
- `bodyFireData`: flames streaming back off the bones.
- **A single unified shader patch** (`patchMat`) handles suit recolour, hat split and heat.

## 5. Videos made so far

1. **"What if you stopped sleeping"**: YouTube 5:18 (done; the user rendered it, and YouTube SEO metadata and chapters were given). Plus a **TikTok 66 s vertical** cut (`stopped-sleeping-short`).
2. **"What if friction disappeared for 5 seconds"**: TikTok. The user **rejected** it as boring and slow, and "human only". Lesson: show the effect on EVERYTHING (buildings, surroundings, world), make it dramatic, and match the reference.
3. **"What if you ran twice as fast every 2 seconds?"** (`Run2x`, TikTok ≈62 s). This is the **current project**:
   - Built to match the user's 2nd reference video (that video was made with Claude, not with AI video tools).
   - **v1:** a full 62 s was delivered. The user said it **doesn't make sense**: bad physics, the runner invisible in many shots, the camera stuck inside objects, cheap looks.
   - **v2 (now):**
     - Realistic hero, City2 + Land2 scenes, physics-checked captions.
     - **The first 25.5 s were delivered as a pack** (with `--engine`).
     - Waiting for the user's feedback on this demo.

### Run2x v2: physics model (`tools/gen/run2x.py`; v1 is kept as `run2x_v1.py`)

- **Speed:** v(T) = 5·2^((T−3)/2) km/h. The walk starts at T = 3 s and the speed doubles every 2 s; the story clock is the video clock. Light speed is reached at T ≈ 58.37 s (55.4 s of running).
- **Drag:** ½ρv²·CdA (ρ = 1.225, CdA = 0.6 m², ×1.5 wave drag above Mach 1.2).
- **Push force:** m·a + drag (m = 80 kg, a = v·ln2/2).
- **Stagnation temperature:** T0 = 288(1 + 0.2M²) − 273 °C.
- **Lean:** min(0.6, 0.04 + 0.5·atan(F/mg)).
- **Heat:** smouldering by stagnation temperature (500–1700 °C), then plasma from 15,000 to 30,000 km/h.
- **Energy per step:** m·v²·ln2 / (4·cadence), in tons of TNT (4.184e9 J).
- The generator computes for each segment: hero phase, run/sprint/lean/heat keyframes, scroll keyframes, and the HUD clock every 1/30 s. `--until` limits the length.

### v2 shot list (first 25.5 s, DONE)

| Time | Scene | Content |
|---|---|---|
| 0–1.2 | city2 | **Hook:** flash-forward (T = 33.5, 194,840 km/h). Glowing man, a blast at every step, cars thrown, impact frame, tracking camera. Title: "What if you ran twice as fast / every 2 seconds?" |
| 1.2–3 | city2 | Aerial reveal down to the hero |
| 3–6 | city2 | Walk, front view: "It starts with a walk." |
| 6–8 | city2 | Side jog: "Every 2 seconds, twice as fast." then "20 km/h. A good jog." |
| 8–10.4 | city2 | Low camera: "44.7 km/h. Faster than Usain Bolt." |
| 10.4–11.9 | city2 | Hat blows off (10.45): "66 km/h. The wind takes your hat." then "86 km/h. Behind you, a gale." Papers and leaves fly. |
| 11.9–13.9 | land2 water | "111 km/h. Fast enough to run on water." |
| 13.9–15 | land2 highway | "222 km/h. The highway looks parked." |
| 15–16.6 | land2 rails | "320 km/h. Overtaking a bullet train." |
| 16.6–18 | land2 road | Lean into the wind: "640 km/h. The air pushes back with 1.2 tons of force." |
| 18–18.9 | land2 | Jet overhead: "905 km/h. Faster than a jet airliner." |
| 18.9–20.6 | land2 | Vapour cone + sonic boom domes + impact: "1,258 km/h. You break the sound barrier." |
| 20.6–22.2 | city2 | Hero passes at Mach 2, windows burst: "Mach 2. Every window you pass shatters." |
| 22.2–23.6 | land2 | Footstep craters: "4,017 km/h. Each step pushes with 73 tons. The road breaks." |
| 23.6–25.5 | land2 | Fire: "6,414 km/h. The air ahead hits 1,600 °C." then "Your suit catches fire." |

**Known weak spots:**
- The jet looks like a toy.
- The train is a white box with a weak nose.
- Water footstep splashes are faint.
- Explosion fireballs are somewhat flat blobs.

### v2 plan for 25.5 s → end (TO DO after the user OKs the demo)

| Speed | Physics | Scene |
|---|---|---|
| 10,000–25,000 km/h | You become a **meteor**: plasma sheath like spacecraft re-entry | Glowing hero over the ocean, steam where the feet strike |
| 28,000 km/h (T ≈ 27.9) | Orbital speed: the ground curves away faster than you fall | Caption: "Physics says you'd fly off into space. Let's say you don't." |
| 40,270 km/h (T ≈ 28.9) | Escape velocity | — |
| ≈ 69,000 km/h (T ≈ 30.8) | As fast as the Chelyabinsk meteor (~19 km/s) | — |
| T ≈ 33.5 | Energy per step ≈ 3 t TNT, computed | City blasts (same as the hook) |
| 692,000 km/h (T ≈ 37.2) | Faster than the Parker Solar Probe (fastest spacecraft) | — |
| ≈ 1.85M km/h (T = 40) | ≈ 67× the ISS speed | ISS shot |
| ≈ 4.5M km/h | Energy per step ≈ one Hiroshima (63 TJ); recompute with the formula | Ring of explosions around Earth |
| 21M km/h (T = 47) | Paris → New York (5,837 km) in 1 s | Head of the fire ring crosses the Atlantic exactly in 1 s |
| — | One lap of Earth (40,075 km): 28 s at T = 42.9, once per second at T ≈ 53 | — |
| — | From the Moon: Earth wears a ring of fire | — |
| 0.5c (T ≈ 56.4) | γ = 1.155 (clocks −13%); kinetic energy ≈ 1.1e18 J ≈ 265 Mt ≈ 5 Tsar Bombas | **Relativistic look:** blue ahead, red behind, view squeezed forward. NOT "the world freezes" (that was wrong in v1). |
| c (T = 58.37) | Needs infinite energy | Impact frame, white-out, final lines: "55 seconds in: the speed of light." / "Physics says you can never get here." |

- **Planned new scene:** "orbit chase": the glowing hero in a chase camera over a giant real-textured Earth (as in the reference), with real Earth/Moon textures from `public/tex`.
- **The hero must be visible in every shot.** No camera inside or behind objects (v1 failed here: a parked car blocked the frame and a tree filled it).

## 6. Lessons / mistakes to avoid

- Watch references at full 30 fps, every frame (ffmpeg tile sheets with frame numbers work well).
- Check the composition of every shot with stills before shipping. Look for: hero visible, nothing occluding, sky not blown out, the effect readable.
- In side mode, `side` shifts both camera and target. Large values push the hero out of frame.
- `CityScene` parked cars once sat on the camera path, so keep parked cars away from the shots.
- Additive white fireballs read as fog. Use normal-blended orange puffs with a smoke texture plus dark smoke.
- The Sky shader is too bright under ACES, so scale its output (×0.42).
- The physics captions are the brand. No false "a city flattened" claims; compute the energy.
- The user is limit-constrained. Keep replies short and avoid unnecessary renders and long checks.

## 7. Immediate next step

1. Wait for the user's verdict on the 25.5 s v2 demo (they render it on the PC with `RENDER-Run2x.bat`).
2. Fix what they point out (and the weak spots above).
3. Build 25.5 s → 62.5 s following §5, using the real Earth textures.
4. Check with stills.
5. Ship the full pack with `--engine`.
6. Then: YouTube/TikTok metadata if asked. Optional: README update for the City2/Land2/hero APIs.

---

## 8. Session 22 Oct 2026 (cloud) — what changed

- Repo is now on GitHub (private). The cloud session restores the engine with `git clone` instead of uploads.
- `public/` assets were re-downloaded from three.js r169 (Poly Haven is blocked from the cloud):
  `tex/kloofendal_48d_partly_cloudy.jpg` is a PLACEHOLDER (three.js equirect photo) — the user's PC has the real one. Never ship it in a pack.
- New engine features: `hud.counter` (per-shot HUD label/value, replaces the clock in that segment), `hud.endcard`,
  `effects.crack`, `effects.phone` (src/engine/Overlays.tsx). Audio: ambiences wind/roar/space/slowmo, sfx crack/alert/impact/subdrop,
  auto impact on `flash` cuts. `tools/make_pack.py --files a b c` ships changed engine files.
- Reference analysis: docs/ref1-oxygen-5s-notes.md (frame by frame) and docs/ref2-men-5s-notes.md (1 fps). Style = fast montage:
  new shot every ~1.5-2 s, each with its own HUD metric + one short caption, humour, a twist, POV moment, slowed last second, Part 2 end card.
- The user's cloud credit is limited: avoid frame-by-frame video reviews; use 1 fps sheets and few stills.
- Current: EarthHoleShort 11 s demo (tools/gen/earthhole_short.py) sent as a pack; waiting for the user's OK.
  Plan: full 60 s short, then the long YouTube version in the same style.
