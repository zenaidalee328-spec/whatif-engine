// Timeline JSON schema for the What If video engine.
// All times inside a segment are LOCAL seconds (0 = segment start).
// Top-level `hud.clock` and `music` use ABSOLUTE seconds.

/** A number, or keyframes [[t, value], ...] (smooth interpolation, held at the ends). */
export type Val = number | [number, number][];
export type Vec3 = [number, number, number];
/** A fixed vector, or keyframes [[t, [x,y,z]], ...]. */
export type VecVal = Vec3 | [number, Vec3][];

export type CameraSpec =
  | {
      // first-person walk in a straight line (or through waypoints) with head bob, sway and fatigue droop
      path: 'pov-walk';
      from: Vec3;
      to: Vec3;
      via?: Vec3[];
      eye?: number; // eye height, default 1.68
      bob?: Val; // 0..1 head-bob amount, default 1
      stepRate?: Val; // steps per second, default 1.9
      sway?: Val; // 0..1 drunk sway
      droop?: Val; // 0..1 head drooping down
      yaw?: Val; // look left/right (degrees, + = left)
      pitch?: Val; // look up/down (degrees, + = up)
      fov?: Val;
      ease?: 'linear' | 'inout';
    }
  | {
      path: 'pov-stand';
      pos: VecVal;
      look: VecVal;
      breathe?: Val; // idle head motion, default 1
      sway?: Val;
      droop?: Val;
      yaw?: Val;
      pitch?: Val;
      fov?: Val;
    }
  | { path: 'orbit'; center: Vec3; radius: Val; height: Val; startDeg?: number; degPerSec?: number; fov?: Val }
  | { path: 'dolly'; from: { pos: Vec3; look: Vec3 }; to: { pos: Vec3; look: Vec3 }; fov?: Val; ease?: 'linear' | 'inout' }
  | { path: 'keys'; pos: VecVal; look: VecVal; fov?: Val; roll?: Val; ease?: 'linear' | 'inout' }; // linear for dense generated keys

export type Blink = { at: number; amount?: number; close?: number; hold?: number; open?: number };
export type Microsleep = { at: number; dur: number };

export type Effects = {
  blur?: Val; // px
  doubleVision?: Val; // 0..1
  chroma?: Val; // 0..1 chromatic aberration
  eyelids?: { droop?: Val; blinks?: Blink[] };
  microsleep?: Microsleep[];
  shake?: Val; // 0..1 camera shake
  redPulse?: Val; // 0..1
  warp?: Val; // 0..1, forwarded to scenes that support it
  vignette?: Val; // 0..1 (default 0.5)
  glare?: Val; // 0..1 light bloom / overexposure
  desaturate?: Val; // 0..1
  flash?: { at: number; dur?: number; color?: string }[];
  tunnel?: Val; // 0..1 tunnel vision
  tint?: { color: string; amount: Val }; // colour grade (e.g. cold blue slow-motion look)
  fade?: { color: string; amount: Val }; // full-frame colour overlay, e.g. a slow white-out between worlds
  speedLines?: Val; // 0..1 radial anime speed lines
  crack?: { at: number; x?: number; y?: number }[]; // glass-crack overlay on the lens from `at` (x,y = centre, 0..1 of frame)
  phone?: { from: number; to: number; title: string; body?: string; time?: string }; // POV hands holding a phone with an emergency alert
  impact?: { at: number; dur?: number }[]; // manga 'impact frames': 2-4 frames of black/white high-contrast with radial lines
};

export type Caption = { from: number; to: number; text: string; hl?: string[]; style?: 'bottom' | 'center' | 'big' | 'subtle' | 'top' }; // subtle/top = small cinematic serif, can overlap others

export type HudStat = {
  from: number;
  to: number;
  label: string;
  value: string; // may contain {n} -> replaced by `count`
  count?: Val; // animated number for {n}
  decimals?: number;
  sub?: string;
  color?: string;
  side?: 'left' | 'right';
};
export type HudAlert = { from: number; to: number; text: string; count?: Val; decimals?: number; color?: string; blink?: boolean };
export type HudMeter = { from: number; to: number; label: string; value: Val; color?: string; side?: 'left' | 'right'; suffix?: string; noValue?: boolean /* show an arrow instead of a number */ };
export type HudNext = { from: number; to: number; title: string; at?: number; unit?: 'hours' | 'minutes' | 'days'; text?: string };
export type HudTag = { from: number; to: number; text: string; sub?: string };
export type HudCompare = {
  // "You vs record" tracker: a bar of `value` against `target`
  from: number;
  to: number;
  label: string;
  value: Val;
  target: number;
  youLabel?: string;
  targetLabel: string;
  unit?: string;
};

export type SegmentHud = {
  location?: string; // top-centre chip, e.g. "SUPERMARKET · 23:40"
  stats?: HudStat[];
  alerts?: HudAlert[];
  meters?: HudMeter[];
  next?: HudNext[];
  tags?: HudTag[];
  compare?: HudCompare[];
  hidden?: boolean;
  telemetry?: boolean; // false hides the global telemetry panel in this segment
  counter?: SegmentCounter; // replaces the global clock in this segment: a new label + value per shot ("BURGERS THAT SURVIVED 0 OUT OF 4")
  endcard?: { title: string; lines?: string[]; cta?: string }; // closing card: title, small lines, call to action
};

export type SegmentCounter = {
  label: string;
  value: Val; // local-time keyframes ok
  format?: 'hms' | 'hours' | 'days' | 'number' | 'countdown' | 'text';
  text?: string; // format 'text': shown instead of a number (e.g. "HERE")
  unit?: string;
  decimals?: number;
  sub?: string;
};

export type SfxCue = {
  at: number;
  type: string; // footsteps, whoosh, boom, heartbeat, screech, horn, beep, glitch, riser, tick, thud, whisper, crash, scan
  dur?: number;
  gain?: number;
  rate?: number; // e.g. footsteps per second
  pan?: number;
};

export type Segment = {
  id: string;
  from: number; // absolute seconds
  to: number;
  scene: string;
  params?: Record<string, unknown>; // numbers may be Val keyframes; scenes read them with v()
  camera?: CameraSpec;
  effects?: Effects;
  transitionIn?: 'cut' | 'dip' | 'whip' | 'flash' | 'glitch' | 'wake';
  hud?: SegmentHud;
  captions?: Caption[];
  sfx?: SfxCue[];
  ambience?: string; // overrides the scene's default ambience in the audio builder
};

export type ClockSpec = {
  label: string; // "AWAKE FOR"
  keys: [number, number][]; // absolute t -> value (seconds when format = hms)
  format?: 'hms' | 'hours' | 'days' | 'number' | 'countdown'; // countdown = m:ss.mmm (value in seconds)
  sub?: string; // e.g. "SLEPT: 0 MIN"
  colorRamp?: [number, number]; // value range for white -> amber -> red
  labelKeys?: [number, string][]; // change the label over time (absolute t), e.g. 'DISAPPEARS IN' -> 'RETURNS IN'
  subKeys?: [number, string][]; // change the sub line over time (absolute t)
  style?: 'panel' | 'minimal'; // minimal = no box, thin digits (cinematic)
  unit?: string; // appended to the number, e.g. ' km/h'
  decimals?: number; // for format 'number'
};

/** fall-through-Earth telemetry panel: story seconds since the jump vs absolute video time */
export type TelemetrySpec = { keys: [number, number][]; start?: number; end?: number; side?: 'left' | 'right' };

export type Timeline = {
  meta: {
    id: string; // composition id (letters, numbers, '-')
    title: string;
    fps?: number;
    width?: number;
    height?: number;
    audio?: string; // file in public/, default "audio/<id>.wav"
    fovScale?: number; // multiplies every camera fov (vertical videos: ~1.3 keeps scenes from feeling cropped)
    music?: { keys: [number, number][]; root?: number }; // intensity 0..1 over absolute time
  };
  hud?: { clock?: ClockSpec; start?: number; end?: number; telemetry?: TelemetrySpec };
  segments: Segment[];
};
