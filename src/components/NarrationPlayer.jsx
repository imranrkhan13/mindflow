import { useEffect, useRef, useState } from 'react';
export default function NarrationPlayer({ src, label = 'Narration', download = 'mindflow-narration.wav', autoPlay = false }) {
  const audio = useRef(null);
  const [rate, setRate] = useState(1);
  const [blocked, setBlocked] = useState(false);
  const [state, setState] = useState(autoPlay ? 'loading' : 'idle');

  // Auto-play is attempted as soon as metadata arrives. Browsers that refuse
  // (no user gesture) get an obvious Play button instead of silence.
  useEffect(() => {
    if (!autoPlay || !audio.current) return;
    const el = audio.current;
    el.playbackRate = 1;
    el.play().catch(() => setBlocked(true));
  }, [autoPlay, src]);

  return (
    <div className="mf-narration">
      <audio
        ref={audio}
        controls
        preload="auto"
        src={src}
        aria-label={label}
        onLoadedMetadata={() => {
          if (audio.current) audio.current.playbackRate = rate;
          if (state === 'loading') setState('ready');
        }}
        onPlay={() => { setBlocked(false); setState('playing'); }}
        onPause={() => setState((s) => (s === 'playing' ? 'ready' : s))}
        onEnded={() => setState('ready')}
        onError={() => setState('error')}
      />
      <div className="mf-narration-controls">
        {blocked && (
          <button
            type="button"
            className="mf-play-button"
            onClick={() => audio.current?.play().catch(() => setBlocked(true))}
          >
            ▶ Play sample
          </button>
        )}
        {state === 'error' && <span className="mf-narration-error">This audio could not be played here. Use Download WAV.</span>}
        <label>
          Listening pace{' '}
          <select
            aria-label={`${label} listening pace`}
            value={rate}
            onChange={(e) => {
              const value = Number(e.target.value);
              setRate(value);
              if (audio.current) {
                audio.current.preservesPitch = true;
                audio.current.playbackRate = value;
              }
            }}
          >
            {[[0.85, 'Relaxed'], [1, 'Natural'], [1.15, 'Brisk']].map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
        <a href={src} download={download}>Download WAV</a>
      </div>
    </div>
  );
}
