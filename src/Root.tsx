import React from 'react';
import { Composition } from 'remotion';
import { Video, durationOf } from './engine/Video';
import type { Timeline } from './engine/types';

// Every src/timelines/*.json becomes a composition named after meta.id.
declare const require: any;
const ctx = require.context('./timelines', false, /\.json$/);
const TIMELINES: Timeline[] = ctx.keys().map((k: string) => ctx(k) as Timeline);

export const RemotionRoot: React.FC = () => (
  <>
    {TIMELINES.map((tl) => {
      const fps = tl.meta.fps ?? 30;
      return (
        <Composition
          key={tl.meta.id}
          id={tl.meta.id}
          component={Video as any}
          defaultProps={{ timeline: tl }}
          durationInFrames={Math.round(durationOf(tl) * fps)}
          fps={fps}
          width={tl.meta.width ?? 1920}
          height={tl.meta.height ?? 1080}
        />
      );
    })}
  </>
);
