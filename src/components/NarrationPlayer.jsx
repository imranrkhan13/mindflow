import { useRef, useState } from 'react';
export default function NarrationPlayer({ src, label = 'Narration', download = 'mindflow-narration.wav' }) {
  const audio = useRef(null);
  const [rate, setRate] = useState(1);
  return <div className="mf-narration">
    <audio ref={audio} controls preload="metadata" src={src} aria-label={label} onLoadedMetadata={() => { audio.current.playbackRate = rate; }} />
    <div className="mf-narration-controls"><label>Listening pace <select aria-label={`${label} listening pace`} value={rate} onChange={e => { const value = Number(e.target.value); setRate(value); if(audio.current) { audio.current.preservesPitch = true; audio.current.playbackRate = value; } }}>{[[0.85,'Relaxed'],[1,'Natural'],[1.15,'Brisk']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><a href={src} download={download}>Download WAV</a></div>
  </div>;
}
