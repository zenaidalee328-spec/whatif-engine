# What If Video Engine

Remotion + React Three Fiber. A video = one timeline JSON in `src/timelines/` + its soundtrack in `public/audio/`.
Every JSON in `src/timelines/` becomes a composition named after `meta.id`.

## On your PC (only Node.js needed, no Python)
1. **Once:** unzip `whatif-engine.zip` and keep that `whatif-engine` folder. Never replace it with a new full zip.
2. **Each new video:** Claude gives you a small **video pack** `<Name>-pack.zip` containing:
   - `src/timelines/<file>.json`: the timeline
   - `public/audio/<Name>.wav`: the soundtrack, made in the cloud
   - `RENDER-<Name>.bat`
3. Extract the pack **into** the `whatif-engine` folder (choose "replace files").
4. Double-click `RENDER-<Name>.bat`. It:
   - checks for Node.js;
   - runs `npm i` only if `node_modules` is missing (so only the first time);
   - runs `npx remotion render ... --gl=angle`;
   - opens the `out\` folder.
   - Extra flags pass through, e.g. `RENDER-<Name>.bat --frames=0-299` renders only the first 10 s.

Old packs can stay. To keep bundling fast, delete old `.json`/`.wav` files you no longer need.

## Cloud side (Claude)
```bash
npm i && npm i --no-save @sparticuz/chromium@153        # Chromium for this box -> /tmp/chromium
node -e "require('@sparticuz/chromium').default.executablePath().then(console.log)"
npx remotion bundle src/index.ts --out-dir build
npx remotion still build <CompId> s.jpg --frame=60 --browser-executable=/tmp/chromium --gl=swangle --scale=0.5
python3 tools/make_pack.py src/timelines/<file>.json  # builds the .wav + RENDER-<id>.bat + out/packs/<id>-pack.zip
```
Engine changes (new scenes or effects) need a new engine zip; tell the user to replace only the changed files, or send a small "engine update" zip with just those files.

## Timeline JSON (short reference; full types in `src/engine/types.ts`)
- **Val** = a number, or keyframes `[[t, value], ...]`. Inside a segment, `t` is local seconds.
- `meta`: `id`, `title`, `fps`, `music.keys` (intensity 0..1 over absolute time), `music.root` (Hz).
- `hud.clock`: the global counter (`label`, `keys` absolute t → value, `format` hms|hours|days|number, `sub`, `colorRamp`), plus `hud.start` / `hud.end`.
- `segments[]`:
  - `from` / `to` (absolute seconds), `scene`, `params` (scene-specific, Val allowed), `transitionIn` (cut|dip|whip|flash|glitch|wake)
  - `camera.path`: `pov-walk` (from, to, via, stepRate, bob, sway, droop, yaw, pitch, fov), `pov-stand` (pos, look, breathe, sway, droop, yaw, pitch), `orbit`, `dolly`, `keys`
  - `effects`: blur, doubleVision, chroma, eyelids {droop, blinks[]}, microsleep[{at,dur}], shake, redPulse, warp, vignette, glare, desaturate, flash[], tunnel
  - `hud`: location, stats[], alerts[], meters[], next[] (`at` = clock value → live "in ~N hours"), tags[], compare[] (you vs record), hidden
  - `captions[]`: {from, to, text, hl[], style bottom|center|big}
  - `sfx[]`: {at, type, dur, gain, rate, pan}. Types: footsteps, cart, whoosh, boom, heartbeat, screech, horn, beep, glitch, riser, tick, thud, crash, whisper, warble, hum
  - `ambience`: overrides the scene's default ambience (street, city, room, office, supermarket, brain, none)

## Scenes (`src/engine/scenes.tsx`; each has an `about` line with its coordinates)
street, room (bed/office/kitchen), city, brain, supermarket, black.
To add one: write `src/scenes/<Name>.tsx`, register it in `SCENES`, and add its ambience in `audio/build_audio.py`.
