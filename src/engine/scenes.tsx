import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Cam } from './camera';
import { v, vv } from './val';
import { StreetScene } from '../scenes/Street';
import { RoomScene } from '../scenes/Room';
import { CityScene } from '../scenes/City';
import { BrainScene } from '../scenes/Brain';
import { SupermarketScene } from '../scenes/Supermarket';
import { BusScene } from '../scenes/Bus';
import { MeetingScene } from '../scenes/Meeting';
import { NightStreetScene } from '../scenes/NightStreet';
import { HospitalScene } from '../scenes/Hospital';
import { FrictionCityScene } from '../scenes/FrictionCity';
import { PlanetScene } from '../scenes/Planet';
import { RunCityScene } from '../scenes/RunCity';
import { RunLandScene } from '../scenes/RunLand';
import { HeroTestScene } from '../scenes/HeroTest';
import { City2Scene } from '../scenes/City2';
import { Land2Scene } from '../scenes/Land2';
import { TunnelScene } from '../scenes/Tunnel';
import { EarthCutScene } from '../scenes/EarthCut';
import { NorthPoleScene } from '../scenes/NorthPole';

/** Every scene gets local time, duration, evaluated params and the camera (null = scene default). */
export type SceneProps = { t: number; dur: number; p: Record<string, any>; cam: Cam | null; warp: number };

/** evaluate keyframed numbers one level deep inside an object param (e.g. params.hero.x) */
const evo = (o: any, t: number) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, Array.isArray(x) && Array.isArray((x as any)[0]) ? v(x as any, t) : x])) : o);

const DEF = (pos: [number, number, number], look: [number, number, number], fov: number): Cam => ({ pos, look, fov, roll: 0 });

type Mover = { x: number; z: number | [number, number][]; speed?: number; color?: string; shirt?: string; rotY?: number; lights?: number };

import { RooftopScene } from '../scenes/Rooftop';
export const SCENES: Record<string, { component: React.FC<SceneProps>; ambience: string; about: string }> = {
  street: {
    ambience: 'street',
    about: 'Suburban street along -z. Road x∈[-3.5,3.5], sidewalks |x|≈4.7, crosswalk z=-40. params: clock, cars[{x,z (number or keyframes),speed,color,lights}], walkers[{x,z,speed,shirt}]',
    component: ({ t, p, cam }) => (
      <StreetScene
        clock={p.clock ?? 9.5}
        cam={cam ?? DEF([4.7, 1.68, 6], [4.2, 1.5, -4], 64)}
        cars={((p.cars ?? []) as Mover[]).map((c) => ({ x: c.x, z: typeof c.z === 'number' ? c.z + (c.speed ?? 0) * t : v(c.z, t), rotY: c.rotY ?? ((c.speed ?? 0) < 0 ? Math.PI : 0), color: c.color ?? '#ecf0f1', lights: c.lights }))}
        walkers={((p.walkers ?? []) as Mover[]).map((w, i) => ({ x: w.x, z: (w.z as number) + (w.speed ?? 1.3) * t, rotY: w.rotY ?? ((w.speed ?? 1.3) < 0 ? Math.PI : 0), phase: t * 7 + i, shirt: w.shirt ?? '#e2483d' }))}
      />
    ),
  },
  room: {
    ambience: 'room',
    about: 'Room 6x3x5 (x -3..3, z -2.5..2.5), camera from +z. Bed variant: bed x≈0.9 z -2.4..-0.25 (pillow z≈-2.1), nightstand x≈-0.35 z≈-2.1, window x=-1.5 back wall, wall clock x=1.15. Lying POV: pos [0.45,0.8,-1.95] look [-0.3,0.66,-2.0]. params: variant bed|office|kitchen, clock, lamp, warp, crawl, red, shadow, shadowStretch, people[PersonProps], fridgeOpen, exposure, digital (LED clock on nightstand)',
    component: ({ t, p, cam, warp }) => (
      <RoomScene
        t={t}
        variant={p.variant ?? 'bed'}
        clock={p.clock ?? 23}
        lamp={p.lamp ?? 0.6}
        warp={p.warp ?? warp}
        crawl={p.crawl}
        red={p.red}
        shadow={p.shadow}
        shadowStretch={p.shadowStretch}
        people={p.people ?? []}
        fridgeOpen={p.fridgeOpen}
        exposure={p.exposure}
        digital={p.digital}
        cam={cam ?? DEF([0, 1.6, 2.3], [0, 1.3, -2.5], 55)}
      />
    ),
  },
  city: {
    ambience: 'city',
    about: 'Procedural city grid around origin, hero building at centre (h≈14). params: clock, lightsOff 0..1, hero 0..1',
    component: ({ p, cam }) => <CityScene clock={p.clock ?? 23} lightsOff={p.lightsOff ?? 0} hero={p.hero ?? 0} cam={cam ?? DEF([20, 14, 26], [0, 4, 0], 45)} />,
  },
  brain: {
    ambience: 'brain',
    about: 'Point-cloud brain at origin (radius ≈1). params: offline 0..1. Default camera orbits.',
    component: ({ t, p, cam }) => <BrainScene t={t} offline={p.offline ?? 0} cam={cam ?? undefined} />,
  },
  supermarket: {
    ambience: 'supermarket',
    about: 'Long aisle along -z, shelves at x=±1.45, walkable z 10..-40, ceiling 3.6. params: glare 0..1, flicker 0..1, cart bool, shoppers[{x,z,speed,shirt,rotY}], signs[{z,text,sub}]',
    component: ({ t, p, cam }) => (
      <SupermarketScene t={t} cam={cam ?? DEF([0, 1.68, 8], [0, 1.5, -2], 64)} glare={p.glare} flicker={p.flicker} cart={p.cart ?? true} shoppers={p.shoppers} signs={p.signs} />
    ),
  },
  bus: {
    ambience: 'bus',
    about: 'Bus interior x∈[-1.25,1.25], z∈[-6,6] (front -z), ceiling 2.3; world scrolls past. Window seat POV: pos [0.95,1.2,0.9] look [0.2,1.15,-6]. params: clock, speed, passengers[seat idx 0..39]',
    component: ({ t, p, cam }) => <BusScene t={t} cam={cam ?? DEF([0.95, 1.2, 0.9], [0.2, 1.15, -6], 62)} clock={p.clock} speed={p.speed} passengers={p.passengers} />,
  },
  meeting: {
    ambience: 'meeting',
    about: 'Meeting room x∈[-3.5,3.5], z∈[-5,3], h 2.8; table along z, 8 coworkers seated, presenter + screen at z=-5, window wall x=+3.5. POV seat: pos [0,1.2,2.3] look [0,1.1,-5]. params: clock, stare 0..1, spill 0..1, talk 0..1',
    component: ({ t, p, cam }) => <MeetingScene t={t} cam={cam ?? DEF([0, 1.2, 2.3], [0, 1.1, -5], 58)} clock={p.clock} stare={p.stare} spill={p.spill} talk={p.talk} />,
  },
  nightstreet: {
    ambience: 'nightstreet',
    about: 'City street at night along -z. Road |x|<4, sidewalks |x| 4..7 (y 0.15), lamp posts x=±4.6 every 14 m, facades |x|≥7.5. Walk right sidewalk x≈5.5 from z 10 to -60. params: clock, bend 0..1, flicker 0..1, shadows[{x,z|follow,opacity,stretch}] (follow = metres behind camera), cars[{x,z,speed,color}]',
    component: ({ t, p, cam }) => (
      <NightStreetScene t={t} cam={cam ?? DEF([5.5, 1.68, 10], [5.2, 1.5, 0], 62)} clock={p.clock} bend={p.bend} flicker={p.flicker} shadows={p.shadows} cars={p.cars} />
    ),
  },
  hospital: {
    ambience: 'hospital',
    about: 'Hospital room x∈[-2.5,2.5], z∈[-3,3]; bed along z (head z=-2.4); monitor at x 0.95, z -1.3 (from lying POV: yaw +54, pitch +20), IV pole left, door/window on far wall z=3. Lying POV: pos [0,1.0,-2.0] look [0,1.2,3]. params: bpm (audio beeps follow it), temp, dim 0..1, flicker 0..1',
    component: ({ t, p, cam }) => <HospitalScene t={t} cam={cam ?? DEF([0, 1.0, -2.0], [0, 1.2, 3], 60)} bpm={p.bpm} temp={p.temp} dim={p.dim} flicker={p.flicker} />,
  },
  frictioncity: {
    ambience: 'street',
    about: 'Golden-hour city. Main street along z (road |x|<5, sidewalks |x| 5..8.5 at y 0.15), cross street z∈[-28,-12], crosswalk z=-10.5, café table + cup (7.1,-6), hanging CAFÉ sign (8.45,3.4,-9), basket (7.9,-12.2), hill climbs from z=-120 (8°). Left: terraced houses with tiled roofs (x -8.5..-16.5, z 30..-8 and -29..-59) whose tiles slide off; right z 15..-1: construction site with scaffolding that collapses; skyline towers z≈-150..-190 sway; hills from z≈-260 slump into landslides. Everything moves from param pt = physical seconds since friction vanished (<0 normal, 0..5 frictionless, >5 skids to a stop). params: pt, clock, glow 0..1 (friction-vision contact points), dust 0..1, hand (POV phone), meX, meZ, meSpread, meFall, meShow (your own legs)',
    component: ({ t, p, cam }) => (
      <FrictionCityScene
        t={t}
        pt={p.pt ?? -1}
        clock={p.clock}
        hand={!!p.hand}
        glow={p.glow ?? 0}
        dust={p.dust ?? 0}
        me={{ x: p.meX ?? 6.2, z: p.meZ ?? 0, spread: p.meSpread ?? 0, fall: p.meFall ?? 0, show: !!p.meShow }}
        cam={cam ?? DEF([6.2, 1.83, 2], [6.0, 1.6, -8], 64)}
      />
    ),
  },
  planet: {
    ambience: 'space',
    about: 'Earth from space: radius 10 at origin (north +y, axial tilt applied), real continents (Natural Earth 110m), clouds, atmosphere rim, glowing approximate plate boundaries. params: faults 0..1 (boundaries light up and flicker), quake 0..1 (surface jitter), clouds 0..1, spin (deg), ring 0..1 glowing great-circle trail (ringArc fraction lit behind ringHead deg; through ringA/ringB [lon,lat] in earth frame, default Paris->New York, or ringNormal [x,y,z] in world frame), ringR, iss [x,y,z] world pos of a small space station, moon 1 = lunar surface in the foreground (camera ~[0,0.4,158] looking at origin). Good camera: orbit/dolly at distance 25..60, fov ~40',
    component: ({ t, p, cam }) => <PlanetScene t={t} cam={cam ?? DEF([0, 4, 38], [0, 0, 0], 40)} faults={p.faults} quake={p.quake} clouds={p.clouds} spin={p.spin} ring={p.ring} ringArc={p.ringArc} ringHead={p.ringHead} ringA={p.ringA} ringB={p.ringB} ringNormal={p.ringNormal} ringR={p.ringR} ringW={p.ringW} iss={p.iss} moon={p.moon} />,
  },
  runcity: {
    ambience: 'street',
    about: 'Downtown avenue along -z: road |x|<7 (lanes ±1.6, ±4.8), sidewalks 7..12, building fronts from |x|=12, crosswalks z=-30,-110,-190,-270. Animated runner (Mixamo Xbot in a navy suit + red tie) starts at z=0 and runs -z with speed v0*2^(rt/2) km/h. Camera follows via params.rig {mode front|low|side|rear|aerial, dist, height, side, ahead, fov — numbers may be keyframes} (overrides segment camera). params: rt, v0, laneX (9 = sidewalk, 2 = road), hook (1 = flash-forward streak that throws cars), hookSpeed (km/h), hookT, bloom, aperture (depth of field), clock',
    component: ({ t, p, cam }) => (
      <RunCityScene t={t} cam={cam} rt={p.rt ?? 0} v0={p.v0} rig={p.rig && Object.fromEntries(Object.entries(p.rig).map(([k, x]) => [k, Array.isArray(x) ? v(x as any, t) : x])) as any} laneX={p.laneX} hook={p.hook} hookSpeed={p.hookSpeed} hookT={p.hookT} bloom={p.bloom} aperture={p.aperture} clock={p.clock} terrace={p.terrace} shards={p.shards} freeze={p.freeze} runZ={p.runZ} phase={p.phase} aura={p.aura} trail={p.trail} cone={p.cone} domes={p.domes} dust={p.dust} />
    ),
  },
  runland: {
    ambience: 'wind',
    about: 'Treadmill world for the fast part of the run: runner at (runX,0,0) facing -z, world scrolls +z by `scroll` m (keyframe linearly). biome road|forest|water|ocean|highway|rails|farm, sky day|golden|dusk|high. Camera via rig {mode front|low|side|rear|aerial|top|up, dist,height,side,ahead,look,fov}. params: scroll, phase (gait cycles), runMix, fire, aura, trail, trailLen, burn, cone, spray, sprayH, dust, bend, domes[t], wake, split, jet [x,y,z], trainZ, carRel, bloom, aperture, runner',
    component: ({ t, p, cam }) => (
      <RunLandScene t={t} cam={cam} biome={p.biome} scroll={p.scroll ?? 0} phase={p.phase ?? t} runMix={p.runMix} runX={p.runX} sky={p.sky}
        rig={p.rig && (Object.fromEntries(Object.entries(p.rig).map(([k, x]) => [k, Array.isArray(x) ? v(x as any, t) : x])) as any)}
        fire={p.fire} aura={p.aura} trail={p.trail} trailLen={p.trailLen} burn={p.burn} cone={p.cone} spray={p.spray} sprayH={p.sprayH} dust={p.dust} bend={p.bend} domes={p.domes} wake={p.wake} split={p.split}
        jet={p.jet && (Array.isArray(p.jet[0]) ? vv(p.jet, t, [0, 0, 0], false) : p.jet)} trainZ={p.trainZ} carRel={p.carRel} bloom={p.bloom} aperture={p.aperture} runner={p.runner} trailW={p.trailW} />
    ),
  },
  city2: {
    ambience: 'street',
    about: 'Photoreal downtown avenue (City v2). Road |x|<7 (lanes ±1.6, ±4.8), sidewalks 7..12, facades |x|>=12, crosswalks z=-30,-110,-190,-270,-350. Realistic hero (bearded man, navy suit, bowler hat) + realistic cars. params: hero {x,z,rotY,phase,run,sprint,lean,hatFly,heat,show,y} (keyframes ok), rig {mode,dist,height,side,ahead,look,fov}, freeze, wind, shockV (m/s, windows burst as hero passes), blasts [{t,x,z,e tons TNT}], cars [{x,z,v,c,rot}], peds, sunElev, sunAz, bloom, aperture, exposure, aura, cone, trail, fire, domes, dust',
    component: ({ t, p, cam }) => (
      <City2Scene t={t} cam={cam} rig={evo(p.rig, t)} hero={{ x: 9, z: 0, rotY: Math.PI, phase: t, run: 0, sprint: 0, lean: 0, hatFly: -1, heat: 0, show: 1, ...evo(p.hero, t) }}
        freeze={p.freeze} wind={p.wind} shockV={p.shockV} blasts={p.blasts} cars={p.cars} peds={p.peds} sunElev={p.sunElev} sunAz={p.sunAz} bloom={p.bloom} aperture={p.aperture} exposure={p.exposure}
        aura={p.aura} cone={p.cone} trail={p.trail} fire={p.fire} flames={p.flames} domes={p.domes} dust={p.dust} />
    ),
  },
  land2: {
    ambience: 'wind',
    about: 'Treadmill countryside v2 (real sky panorama, IBL). Hero at (runX,0,0) facing -z; world scrolls +z by scroll (m). biome road|water|highway|rails|farm. params: scroll, vis (scroll m/s), cad (gait cycles/s), hero {phase,run,sprint,lean,hatFly,heat,show,y}, rig, splash, craters, dust, cone, domes[t], fire, burn, aura, trail, jet [x,y,z] (keyframes ok), trainZ, carRel, bloom, aperture, exposure, sunElev',
    component: ({ t, p, cam }) => (
      <Land2Scene t={t} cam={cam} rig={evo(p.rig, t)} biome={p.biome} scroll={p.scroll ?? 0} vis={p.vis} cad={p.cad} runX={p.runX}
        hero={{ phase: t * 3, run: 1, sprint: 1, lean: 0, hatFly: -1, heat: 0, show: 1, ...evo(p.hero, t) }}
        splash={p.splash} craters={p.craters} dust={p.dust} cone={p.cone} domes={p.domes} fire={p.fire} burn={p.burn} aura={p.aura} trail={p.trail} flames={p.flames}
        jet={p.jet && (Array.isArray(p.jet[0]) ? vv(p.jet, t, [0, 0, 0], false) : p.jet)} trainZ={p.trainZ} carRel={p.carRel} bloom={p.bloom} aperture={p.aperture} exposure={p.exposure} sunElev={p.sunElev} />
    ),
  },
  tunnel: {
    ambience: 'none',
    about: 'Inside the pole-to-pole vacuum tunnel (radius 3.5 m, axis y). Hero floats at the origin (weightless), walls stream past showing the real layer at that depth (ocean behind glass, sediments, basalt/gabbro, peridotite, ringwoodite, lower mantle, liquid iron outer core, crystalline inner core) with blackbody glow from the real temperature. params: s (story seconds since the jump, keyframes; physics from engine/fall.ts), view below|above|side|close (or a segment camera), bloom, exposure, depthKm/speedKmh (override, e.g. the air chapter), haze 0..1 (air), panic 0..1 (arm flailing). Far side (after the centre) automatically shows the South Pole column: continental crust + 2,835 m of ice.',
    component: ({ t, p, cam }) => <TunnelScene t={t} cam={cam} s={p.s ?? 0} view={p.view} bloom={p.bloom} exposure={p.exposure} depthKm={p.depthKm} speedKmh={p.speedKmh} haze={p.haze} panic={p.panic} />,
  },
  earthcut: {
    ambience: 'space',
    about: 'Earth cut in half along the polar axis (radius 10 = 6,371 km), true-scale PREM layers on the cut face, tunnel = vertical axis, glowing dot = the faller. params: s (story seconds), labels 0..1, spin, trail, mark (1 crust,2 upper mantle,3 TZ,4 lower mantle,5 outer core,6 inner core), dot. Good camera: [0,0,34] look origin fov 40',
    component: ({ t, p, cam }) => <EarthCutScene t={t} cam={cam} s={p.s} labels={p.labels} spin={p.spin} trail={p.trail} mark={p.mark} dot={p.dot} />,
  },
  rooftop: {
    ambience: 'rooftop',
    about: 'Rooftop bar at dusk 28 m above a river, low-poly skyline on the far bank. Deck y=0 x -12..12, parapet z=-8.1 (rail 1.07), fire pit (1.5,0,-1), bar x≈-8.6 z -2..6, red-brick wall x>12.5, woman at the railing (-0.6,0,-7.3). River y=-28 z -22..-68. params: fire, lights, flicker, clutch (hands to heads, staggered), river (0 water, 0.5 white froth, 1 drained), haze (sepia), dusk, bloom, focus, aperture, glass (panes/drinks to dust), crumble (skyline collapses), fireZ + fireball (hydrogen fire front), spark (ignition at (0,-16,-60)), debris (rocks at the lens)',
    component: ({ t, p, cam }) => <RooftopScene t={t} cam={cam} fire={p.fire} lights={p.lights} flicker={p.flicker} clutch={p.clutch} river={p.river} haze={p.haze} dusk={p.dusk} bloom={p.bloom} focus={p.focus} aperture={p.aperture} glass={p.glass} crumble={p.crumble} fireZ={p.fireZ} fireball={p.fireball} spark={p.spark} debris={p.debris} />,
  },
  northpole: {
    ambience: 'wind',
    about: 'North Pole sea ice in polar summer with the 7 m steel-rimmed tunnel shaft at the origin. Hero walks toward -z to the rim (walk 0..1, z 7 -> 3.8), then steps off (drop = seconds since, free fall). params: walk, drop, sunElev, bloom',
    component: ({ t, p, cam }) => <NorthPoleScene t={t} cam={cam} walk={p.walk} drop={p.drop} sunElev={p.sunElev} bloom={p.bloom} showHero={p.showHero} />,
  },
  herotest: { ambience: 'none', about: 'dev: hero turntable', component: ({ t, p }) => <HeroTestScene t={t} p={p} /> },
  black: {
    ambience: 'none',
    about: 'Plain background for title cards. params: color',
    component: ({ p }) => <AbsoluteFill style={{ background: p.color ?? 'radial-gradient(ellipse at center, #141a33 0%, #03040a 75%)' }} />,
  },
};
