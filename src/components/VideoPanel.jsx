import { API_BASE, apiErrorMessage } from "../lib/apiConfig.js";
import { useEffect, useRef, useState } from "react";
import {
  Video,
  Play,
  Download,
  Loader2,
  AlertTriangle,
  Volume2,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  startVideoGeneration,
  getVideoStatus,
  videoDownloadUrl,
} from "../lib/api.js";

import { cachedNarration, warmNarration } from "../lib/narration.js";
import NarrationPlayer from "./NarrationPlayer.jsx";

const VOICES = [
  ["friendly", "Heart · warm and natural"],
  ["narrator", "Michael · clear narrator"],
  ["calm", "Emma · calm British"],
];
// One short, representative line. Warmed for every voice so a click plays
// immediately instead of waiting ~3 s for Kokoro.
const SAMPLE_TEXT =
  "Here is how this works: a request arrives, the code checks it, then the response goes back.";
const JOB_KEY = "mindflow.video.job";
export default function VideoPanel({ projectId, node, standalone }) {
  const [mode, setMode] = useState("walkthrough"),
    [prompt, setPrompt] = useState(
      "A slow cinematic close-up of warm copper circuit traces illuminating one by one on a cream colored computer board, soft studio lighting, no text, smooth camera movement.",
    );
  const [voice, setVoice] = useState("friendly"),
    [status, setStatus] = useState("idle"),
    [stage, setStage] = useState(""),
    [progress, setProgress] = useState(0),
    [job, setJob] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [previewBusy, setPreviewBusy] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [previewVoiceId, setPreviewVoiceId] = useState("");
  const [jobStartedAt, setJobStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [resumeAvailable, setResumeAvailable] = useState("");
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const previewController = useRef(null);
  const cancel = useRef(false),
    object = useRef(""),
    active = useRef(false);
  useEffect(
    () => { cancel.current = false; return () => {
      cancel.current = true;
      previewController.current?.abort();
      if (object.current) URL.revokeObjectURL(object.current);
    }; },
    [],
  );

  // Fetch a sample for every voice in the background, once. Loading it after a
  // click was the main reason previews felt broken.
  useEffect(() => { warmNarration(SAMPLE_TEXT, VOICES.map(([id]) => id)); }, []);

  // Reconnect to a render that was started before this tab reloaded. The server
  // keeps the job, so a reload must not look like "nothing happened".
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(JOB_KEY) || "null");
      // A job older than the server's render window cannot still exist.
      if (saved?.job_id && saved.project === projectId && Date.now() - (saved.at || 0) < 30 * 60 * 1000)
        setResumeAvailable(saved.job_id);
      else if (saved?.project === projectId) localStorage.removeItem(JOB_KEY);
    } catch { /* ignore corrupt storage */ }
  }, [projectId]);

  // Elapsed timer for a running render: honest, unlike a frozen percentage.
  useEffect(() => {
    if (status !== "running" || !jobStartedAt) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Date.now() - jobStartedAt), 1000);
    return () => clearInterval(id);
  }, [status, jobStartedAt]);

  async function previewVoice(nextVoice = voice) {
    setPreviewBusy(true);
    setPreviewVoiceId(nextVoice);
    setError("");
    try {
      previewController.current?.abort();
      const controller = new AbortController();
      previewController.current = controller;
      const b = await cachedNarration(SAMPLE_TEXT, nextVoice);
      if (cancel.current || controller.signal.aborted) return;
      if (object.current) URL.revokeObjectURL(object.current);
      object.current = URL.createObjectURL(b);
      setPreview(object.current);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setPreviewBusy(false);
    }
  }

  function pickVoice(nextVoice) {
    previewController.current?.abort();
    setVoice(nextVoice);
    setPreview("");
    if (!preview) return;
    previewVoice(nextVoice);
  }

  function stepVoice(direction) {
    const index = VOICES.findIndex(([id]) => id === voice);
    pickVoice(VOICES[(index + direction + VOICES.length) % VOICES.length][0]);
  }

  async function resumeJob(jobId) {
    localStorage.setItem(JOB_KEY, JSON.stringify({ job_id: jobId, project: projectId, at: Date.now() }));
    setJob(jobId);
    setResumeAvailable("");
    setStatus("running");
    setJobStartedAt(Date.now() - 1000);
    setStage("Reconnecting to the running render");
    setProgress(0);
    try {
      const first = await getVideoStatus(jobId);
      if (first.status === "done") {
        setStatus("done");
        localStorage.removeItem(JOB_KEY);
        return;
      }
      if (first.status === "error" || first.status === "missing" || !first.status) {
        localStorage.removeItem(JOB_KEY);
        setStatus("idle");
        setError("That render is no longer on the server. Start a new one.");
        return;
      }
      // Reset the clock to the server's reported progress instead of guessing.
      setJobStartedAt(Date.now());
      setStage(first.stage || "Rendering");
      setProgress(Math.max(0, Math.min(1, Number(first.progress) || 0)));
    } catch (e) {
      localStorage.removeItem(JOB_KEY);
      setStatus("idle");
      setError(`Could not reconnect: ${e.message}`);
      return;
    }
    try {
      await poll(jobId);
    } catch (e) {
      setStatus("error");
      setError(e.message);
    }
  }

  async function poll(job_id) {
    const deadline = Date.now() + 12 * 60 * 1000;
    while (!cancel.current && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      if (cancel.current) return;
      const s = await getVideoStatus(job_id);
      setStage(s.stage);
      setProgress(Math.max(0, Math.min(1, Number(s.progress) || 0)));
      if (s.status === "done") {
        setStatus("done");
        localStorage.removeItem(JOB_KEY);
        return;
      }
      if (s.status === "error") {
        localStorage.removeItem(JOB_KEY);
        throw new Error(s.error || "Video generation failed");
      }
    }
    if (!cancel.current)
      throw new Error(
        "This render is taking longer than 12 minutes. The job may still be finishing. Refreshing does not cancel the server job.",
      );
  }

  async function generate() {
    if (active.current) return;
    active.current = true;
    cancel.current = false;
    setError("");
    setStatus("running");
    setProgress(0);
    setStage("Writing an evidence-based script");
    try {
      let job_id;
      if (mode === "clip") {
        const r = await fetch(`${API_BASE}/video/generate-clip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(apiErrorMessage(r.status, d.detail, "/api/video/generate-clip"));
        job_id = d.job_id;
      } else {
        const result = await startVideoGeneration(projectId, node.id, voice);
        job_id = result.job_id;
      }
      localStorage.setItem(JOB_KEY, JSON.stringify({ job_id, project: projectId, at: Date.now() }));
      setJob(job_id);
      setJobStartedAt(Date.now());
      setResumeAvailable("");
      await poll(job_id);
    } catch (e) {
      if (!cancel.current) {
        setStatus("error");
        setError(e.message);
      }
    } finally {
      active.current = false;
    }
  }
  return (
    <div className="flex flex-col">
      <div className="border-b border-umber-200 bg-umber-100/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-clay" />
          <h2 className="text-base font-bold text-umber-900">
            {mode === "clip"
              ? "AI-generated visual clip"
              : "Animated source walkthrough"}
          </h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-umber-500">
          {mode === "clip"
            ? "Actual LTX neural video generation through the publisher's shared public demo. A short conceptual visual, not source-code evidence."
            : "Code-based script, animated diagrams and real Kokoro neural narration, rendered into a downloadable MP4 on our existing CPU."}
        </p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="mf-studio-card"><Video size={22}/><h3>Your code, told clearly.</h3><p>Choose a voice, listen to a sample, then create a source-grounded walkthrough.</p><div className="mf-studio-stage"><span>Source script</span><span>Neural narration</span><span>Animated diagrams</span></div></div>

        {resumeAvailable && status !== "running" && (
          <div className="mf-video-resume" role="status">
            <RefreshCw className="h-3.5 w-3.5" />
            <div>
              <p>An earlier render for this project is still on the server.</p>
              <p className="mf-video-resume-actions">
                <button onClick={() => resumeJob(resumeAvailable)}>Reconnect</button>
                <button onClick={() => { localStorage.removeItem(JOB_KEY); setResumeAvailable(""); }}>
                  Discard
                </button>
              </p>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            disabled={status === "running"}
            onClick={() => {
              setMode("walkthrough");
              setStatus("idle");
              setError("");
              setJob("");
            }}
            className={`flex-1 rounded-lg border p-2 text-xs ${mode === "walkthrough" ? "border-clay text-clay" : "border-umber-200"}`}
          >
            Narrated code video
          </button>
          <button
            disabled={status === "running"}
            onClick={() => {
              setMode("clip");
              setStatus("idle");
              setError("");
              setJob("");
            }}
            className={`flex-1 rounded-lg border p-2 text-xs ${mode === "clip" ? "border-clay text-clay" : "border-umber-200"}`}
          >
            AI visual clip
          </button>
        </div>
        <div className="rounded-xl border border-umber-200 bg-paper p-3 text-[11px] leading-relaxed text-umber-600">
          <strong>
            {mode === "clip"
              ? "LTX 0.9.8 distilled · experimental"
              : "Source-grounded narration"}
          </strong>
          <p className="mt-1">
            {mode === "clip"
              ? "Generates a real 2-second, 512 × 384 silent MP4. Only the visual prompt is sent to the official Lightricks demo, not your repository or account token. Free shared queues and quotas can fail or change. No paid fallback. Generated footage is illustrative, never proof of how code runs."
              : "The restored walkthrough animates source diagrams and reads an evidence-based script with local Kokoro speech. Choose AI visual clip for actual model-generated footage instead."}
          </p>
        </div>
        {mode === "clip" && (
          <label className="block text-xs font-semibold text-umber-700">
            Describe the visual
            <textarea
              aria-label="AI video visual prompt"
              value={prompt}
              maxLength={900}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={status === "running"}
              className="mt-2 h-28 w-full rounded-xl border border-umber-200 bg-white p-3 text-xs font-normal leading-relaxed"
            />
            <span className="mt-1 block text-[10px] font-normal text-umber-400">
              Do not include secrets or private source code in this public-demo
              prompt.
            </span>
          </label>
        )}
        {mode === "walkthrough" && status !== "running" && (
          <>
            <div className="text-xs font-semibold text-umber-700">
              Neural voice
              <div className="mf-voice-row">
                <button type="button" className="mf-voice-step" aria-label="Previous voice" onClick={() => stepVoice(-1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <select
                  aria-label="Video voice"
                  value={voice}
                  onChange={(e) => pickVoice(e.target.value)}
                  className="mf-voice-select"
                >
                  {VOICES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="button" className="mf-voice-step" aria-label="Next voice" onClick={() => stepVoice(1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="mf-voice-sample"
                  disabled={previewBusy}
                  onClick={() => previewVoice()}
                >
                  {previewBusy && previewVoiceId === voice ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Volume2 className="h-3 w-3" />
                  )}
                  {previewBusy && previewVoiceId === voice ? "Preparing" : "Sample"}
                </button>
              </div>
              <span className="mf-voice-hint">
                Samples are fetched ahead for every voice, so “Sample” plays straight away.
              </span>
            </div>
            {preview && (
              <NarrationPlayer
                key={`${previewVoiceId}-${preview}`}
                src={preview}
                label={`Voice preview, ${VOICES.find(([id]) => id === previewVoiceId)?.[1] || voice}`}
                download="mindflow-voice-sample.wav"
                autoPlay
              />
            )}
          </>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-clay/25 bg-clay/5 p-3 text-xs leading-relaxed text-clay"
          >
            <AlertTriangle className="mb-2 h-4 w-4" />
            {error}
          </div>
        )}
        {status === "running" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-umber-700">
              <Loader2 className="h-4 w-4 animate-spin text-clay" />
              {stage}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-umber-100">
              <div
                className="h-full bg-clay"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mf-video-progress-meta">
              <span>{Math.round(progress * 100)}%</span>
              <span className="mf-video-elapsed">
                <Clock className="h-3 w-3" />
                {elapsed >= 1000 ? `${Math.floor(elapsed / 60000)}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")} elapsed` : "starting"}
              </span>
            </div>
            <ol className="mf-video-steps">
              {["Script from cited source", "Narration audio", "Diagrams", "Encode MP4"].map((label, i) => {
                const at = Math.min(3, Math.floor((Number(progress) || 0) * 4));
                return (
                  <li key={label} className={i < at ? "done" : i === at ? "active" : ""}>
                    {i < at ? <CheckCircle2 className="h-3 w-3" /> : i === at ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="dot" />}
                    {label}
                  </li>
                );
              })}
            </ol>
            <p className="text-[11px] leading-relaxed text-umber-500">
              Rendering is a shared CPU job, so the percentage can pause. If you
              reload, this panel offers to reconnect instead of losing the render.
              The rest of the app stays usable.
            </p>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-umber-900 py-3 text-sm font-semibold text-white"
            onClick={generate}
          >
            <Play className="h-4 w-4" />
            {status === "done"
              ? "Make another video"
              : mode === "clip"
                ? "Generate AI clip"
                : "Generate narrated MP4"}
          </button>
        )}
        {status === "done" && job && (
          <>
            <div className="mf-video-preview"><video
              ref={videoRef}
              onLoadedMetadata={() => { videoRef.current.playbackRate = playbackRate; }}
              playsInline
              aria-label={mode === "clip" ? "Generated AI visual clip" : "Generated source walkthrough"}
              controls
              preload="metadata"
              className="w-full rounded-xl border border-umber-200"
              src={videoDownloadUrl(job)}
            /></div>
            <label className="mf-video-speed">Preview pace <select aria-label="Video preview pace" value={playbackRate} onChange={e => { const rate = Number(e.target.value); setPlaybackRate(rate); if(videoRef.current) { videoRef.current.preservesPitch = true; videoRef.current.playbackRate = rate; } }}><option value={0.85}>Relaxed · 0.85×</option><option value={1}>Natural · 1×</option><option value={1.15}>Brisk · 1.15×</option></select></label>
            <p className="text-xs text-umber-500">Preview pace does not change the downloaded MP4. Voice samples use balanced audio levels; the MP4 narration is rendered by the server.</p>
            <a
              href={videoDownloadUrl(job)}
              download="mindflow-walkthrough.mp4"
              className="flex items-center gap-2 text-xs text-clay"
            >
              <Download className="h-4 w-4" />
              Download MP4
            </a>
          </>
        )}
        <p className="text-[10px] leading-relaxed text-umber-400">
          Local speech has no per-character bill. Script generation uses the
          same free-only shared quota as chat. If voice or script fails, the
          error is shown, never replaced with silence or a made-up script.
          Generated media is temporary and disappears on restart.
        </p>
      </div>
    </div>
  );
}
