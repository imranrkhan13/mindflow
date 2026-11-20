import { useEffect, useRef, useState } from "react";
import {
  Video,
  Play,
  Download,
  Loader2,
  AlertTriangle,
  Volume2,
} from "lucide-react";
import {
  startVideoGeneration,
  getVideoStatus,
  videoDownloadUrl,
} from "../lib/api.js";

const VOICES = [
  ["narrator", "Michael, clear narrator"],
  ["friendly", "Heart, warm and natural"],
  ["calm", "Emma, calm British"],
];
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
  const cancel = useRef(false),
    object = useRef(""),
    active = useRef(false);
  useEffect(
    () => () => {
      cancel.current = true;
      if (object.current) URL.revokeObjectURL(object.current);
    },
    [],
  );
  async function previewVoice() {
    setPreviewBusy(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const r = await fetch(`${base}/api/voice/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Mindflow follows your source code across files. Open a citation to check the exact evidence.",
          voice,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail || "Voice preview unavailable");
      }
      const b = await r.blob();
      if (object.current) URL.revokeObjectURL(object.current);
      object.current = URL.createObjectURL(b);
      setPreview(object.current);
    } catch (e) {
      setError(e.message);
    } finally {
      setPreviewBusy(false);
    }
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
        const base = import.meta.env.VITE_API_URL || "";
        const r = await fetch(`${base}/api/video/generate-clip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Shared video demo unavailable");
        job_id = d.job_id;
      } else {
        const result = await startVideoGeneration(projectId, node.id, voice);
        job_id = result.job_id;
      }
      setJob(job_id);
      const deadline = Date.now() + 12 * 60 * 1000;
      while (!cancel.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        if (cancel.current) return;
        const s = await getVideoStatus(job_id);
        setStage(s.stage);
        setProgress(s.progress);
        if (s.status === "done") {
          setStatus("done");
          return;
        }
        if (s.status === "error")
          throw new Error(s.error || "Video generation failed");
      }
      if (!cancel.current)
        throw new Error(
          "This render is taking longer than 12 minutes. The job may still be finishing. Refreshing does not cancel the server job.",
        );
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
            <label className="block text-xs font-semibold text-umber-700">
              Neural voice
              <select
                aria-label="Video voice"
                value={voice}
                onChange={(e) => {
                  setVoice(e.target.value);
                  setPreview("");
                }}
                className="mt-2 block w-full rounded-xl border border-umber-200 bg-white p-3 text-xs font-normal"
              >
                {VOICES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="flex items-center gap-2 text-xs text-clay"
              disabled={previewBusy}
              onClick={previewVoice}
            >
              {previewBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
              Preview voice
            </button>
            {preview && (
              <audio
                aria-label="Voice preview"
                className="w-full"
                controls
                src={preview}
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
            <p className="text-[11px] leading-relaxed text-umber-500">
              {Math.round(progress * 100)}%. Shared CPU rendering can take
              several minutes. Keep this panel open. The rest of the app remains
              usable.
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
            <video
              aria-label="Generated source walkthrough"
              controls
              preload="metadata"
              className="w-full rounded-xl border border-umber-200"
              src={videoDownloadUrl(job)}
            />
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
