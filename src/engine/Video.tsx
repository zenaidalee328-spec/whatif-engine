import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Segment, Timeline } from './types';
import { evalCamera } from './camera';
import { FxOverlay, FxScene, fxState } from './Effects';
import { Captions, ClockPanel, SegmentHudView, nextText } from './Hud';
import { Telemetry } from './Telemetry';
import { Crack, EndCard, Phone } from './Overlays';
import { SCENES } from './scenes';
import { evalParams, v } from './val';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const SegmentView: React.FC<{ seg: Segment; tl: Timeline }> = ({ seg, tl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const T = seg.from + t;
  const dur = seg.to - seg.from;
  const fx = seg.effects;
  const scene = SCENES[seg.scene];
  if (!scene) throw new Error(`Unknown scene "${seg.scene}" in segment ${seg.id}. Known: ${Object.keys(SCENES).join(', ')}`);
  const cam = evalCamera(seg.camera, t, dur, v(fx?.shake, t, 0));
  if (cam && tl.meta.fovScale) cam.fov = Math.min(110, cam.fov * tl.meta.fovScale);
  const p = evalParams(seg.params, t);
  const s = fxState(fx, t, seg.transitionIn);
  const Comp = scene.component;

  // global clock (rendered inside the HUD stack so alerts sit under it)
  const c = tl.hud?.clock;
  const hudOn = !seg.hud?.hidden && c && T >= (tl.hud?.start ?? 0) && T <= (tl.hud?.end ?? 1e9);
  // per-shot counter: same look as the global clock, new label/value every segment
  const sc = seg.hud?.counter;
  const scSpec = sc && {
    label: sc.label,
    keys: (typeof sc.value === 'number' ? [[0, sc.value]] : sc.value).map(([k, x]) => [seg.from + k, x] as [number, number]),
    format: sc.format === 'text' ? 'number' : sc.format ?? 'number',
    unit: sc.unit,
    decimals: sc.decimals,
    sub: sc.sub,
    text: sc.format === 'text' ? sc.text : undefined,
    style: 'minimal' as const,
    colorRamp: [1e15, 2e15] as [number, number], // always white
  };
  const clockVal = c ? v(c.keys, T, 0) : 0;
  const hudIn = c ? interpolate(T, [(tl.hud?.start ?? 0), (tl.hud?.start ?? 0) + 0.4], [0, 1], clamp) : 0;
  const h = seg.hud && {
    ...seg.hud,
    next: seg.hud.next?.map((n) => ({ ...n, text: n.text ?? (n.at !== undefined ? nextText(n.unit, n.at - clockVal) : undefined) })),
  };

  return (
    <AbsoluteFill style={{ background: 'black' }}>
      <FxScene id={seg.id} t={t} s={s}>
        <Comp t={t} dur={dur} p={p} cam={cam} warp={v(fx?.warp, t, 0)} />
      </FxScene>
      <FxOverlay fx={fx} t={t} dur={dur} tr={seg.transitionIn} glare={s.glare} />
      {!seg.hud?.hidden && <SegmentHudView h={h || undefined} t={t} frame={frame} clock={scSpec ? <ClockPanel c={scSpec} T={T} opacity={1} /> : hudOn ? <ClockPanel c={c!} T={T} opacity={hudIn} /> : undefined} />}
      {tl.hud?.telemetry && !seg.hud?.hidden && seg.hud?.telemetry !== false && T >= (tl.hud.telemetry.start ?? 0) && T <= (tl.hud.telemetry.end ?? 1e9) && (
        <Telemetry s={v(tl.hud.telemetry.keys, T, 0)} opacity={interpolate(T, [tl.hud.telemetry.start ?? 0, (tl.hud.telemetry.start ?? 0) + 0.5], [0, 1], clamp)} />
      )}
      {fx?.crack && <Crack cracks={fx.crack} t={t} />}
      {fx?.phone && <Phone ph={fx.phone} t={t} />}
      {seg.hud?.endcard && <EndCard e={seg.hud.endcard} t={t} />}
      <Captions caps={seg.captions} t={t} />
    </AbsoluteFill>
  );
};

export const Video: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const { fps } = useVideoConfig();
  const audio = timeline.meta.audio ?? `audio/${timeline.meta.id}.wav`;
  return (
    <AbsoluteFill style={{ background: 'black' }}>
      {timeline.segments.map((seg) => (
        <Sequence key={seg.id} from={Math.round(seg.from * fps)} durationInFrames={Math.max(1, Math.round((seg.to - seg.from) * fps))} name={seg.id}>
          <SegmentView seg={seg} tl={timeline} />
        </Sequence>
      ))}
      {audio !== 'none' && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};

export const durationOf = (tl: Timeline) => Math.max(...tl.segments.map((s) => s.to));
