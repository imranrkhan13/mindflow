import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiErrorMessage } from "../lib/apiConfig.js";
import {
  GitPullRequest,
  Loader2,
  Check,
  X,
  ArrowUpRight,
  FileDiff,
  ShieldQuestion,
  Sparkles,
  RotateCcw,
} from "lucide-react";

const BASE = `${API_BASE}/repository`;

export const reviewUrlError = (value) => {
  const url = (value || "").trim();
  if (!url) return "Paste a pull request URL, for example https://github.com/owner/repo/pull/42";
  if (!/^https:\/\/github\.com\//i.test(url))
    return "Only https://github.com/owner/repo/pull/123 links are supported";
  const m = url.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]{0,9})(?:\.(?:diff|patch))?\/?$/);
  if (!m) return "Use a pull request URL: https://github.com/owner/repo/pull/123 (not files, branches or comments)";
  return "";
};

const QUESTION_KEYS = [
  ["review", "What changed and what could break"],
  ["risk", "Where is it most likely to break"],
  ["tests", "Which changes lack tests"],
];

/* Stages run in the browser only to describe what the server is doing; the
   server sends one `pr_stage` per real step, so these never claim progress. */
function StageList({ stage, files }) {
  const order = ["fetching", "diff", "search", "checks", "model", "done"];
  const reached = Math.max(0, order.indexOf(stage));
  const labels = [
    "Fetching the pull request diff from GitHub",
    files ? `${files.files.length} changed file${files.files.length === 1 ? "" : "s"} parsed` : "Parsing changed files",
    "Searching the pinned baseline for related source",
    "Deriving review checks from the diff",
    stage === "model" ? "Free model writing the review (background)" : "Free model writing the review",
  ];
  return (
    <ol className="mf-stages mf-pr-stages">
      {labels.map((label, i) => (
        <li
          key={label}
          className={
            i < Math.min(reached, 4) ? "done" : i === Math.min(reached, 4) ? "active" : ""
          }
        >
          {i < Math.min(reached, 4) ? (
            <Check size={11} />
          ) : i === Math.min(reached, 4) ? (
            <Loader2 size={11} className="mf-spin" />
          ) : (
            <span className="dot" />
          )}
          {label}
        </li>
      ))}
    </ol>
  );
}

function DiffEntry({ entry, onOpen }) {
  const [open, setOpen] = useState(false);
  const { changes = {} } = entry;
  return (
    <div className="mf-pr-file">
      <button className="head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`tag ${changes.kind || "modified"}`}>{changes.kind || "file"}</span>
        <code title={entry.path}>{entry.path}</code>
        <span className="counts">
          {changes.added != null && <em className="add">+{changes.added}</em>}
          {changes.removed != null && <em className="del">-{changes.removed}</em>}
        </span>
        <span className="id">{entry.id}</span>
      </button>
      {open && (
        <div className="body">
          {entry.symbols?.length > 0 && (
            <p className="symbols">
              added:{" "}
              {entry.symbols.map((s) => (
                <code key={s}>{s}</code>
              ))}
            </p>
          )}
          {entry.added_code ? (
            <pre className="diff">{entry.added_code}</pre>
          ) : (
            <p className="symbols">No text lines were returned for this file (binary or rename only).</p>
          )}
          <button className="open" onClick={() => onOpen?.(entry.path)}>
            <FileDiff size={12} /> Open in repository <ArrowUpRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewPanel({ project, onSource }) {
  const [url, setUrl] = useState("");
  const [questionKey, setQuestionKey] = useState("review");
  const [state, setState] = useState("idle"); // idle | running | done | failed
  const [stage, setStage] = useState("fetching");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [diffs, setDiffs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [files, setFiles] = useState(null);
  const [checks, setChecks] = useState([]);
  const [sources, setSources] = useState([]);
  const [timing, setTiming] = useState(null);
  const abort = useRef(null);
  const resultRef = useRef(null);
  const startedAt = useRef(0);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (state === "done") resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [state]);

  const validation = url ? reviewUrlError(url) : "";
  const ready = useMemo(() => Boolean(url) && !validation && state !== "running", [url, validation, state]);

  function reset() {
    abort.current?.abort();
    setState("idle");
    setError("");
    setText("");
    setDiffs([]);
    setSummary(null);
    setFiles(null);
    setChecks([]);
    setSources([]);
    setTiming(null);
  }

  async function run(nextUrl = url, key = questionKey) {
    const problem = reviewUrlError(nextUrl);
    if (problem) {
      setError(problem);
      return;
    }
    abort.current?.abort();
    abort.current = new AbortController();
    startedAt.current = performance.now();
    setState("running");
    setStage("fetching");
    setError("");
    setText("");
    setDiffs([]);
    setSummary(null);
    setFiles(null);
    setChecks([]);
    setSources([]);
    setTiming(null);

    try {
      const response = await fetch(`${BASE}/${project.id}/pull-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl.trim(), question_key: key }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(response.status, detail.detail, `/api/repository/${project.id}/pull-request`));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const packet = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const type = packet.match(/^event: (.+)$/m)?.[1];
          const raw = packet.match(/^data: (.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (type === "status") setStage((s) => (s === "fetching" ? "diff" : s === "diff" ? "search" : "model"));
          if (type === "pr") setStage("fetching");
          if (type === "pr_files") {
            setFiles(data);
            setStage("search");
          }
          if (type === "sources") setSources(data.sources || []);
          if (type === "review_checks") {
            setChecks(data.checks || []);
            setStage("model");
          }
          if (type === "review") {
            setText(data.answer || "");
            setDiffs(data.diffs || []);
            setSummary(data);
            setStage("done");
            setState("done");
            setTiming({ server: data.elapsed, client: (performance.now() - startedAt.current) / 1000 });
            finished = true;
          }
          if (type === "failed") {
            setError(data.text);
            setState("failed");
            finished = true;
          }
          if (type === "error" || type === "invalid") {
            setError(data.text);
            setState((s) => (s === "running" ? "failed" : s));
            finished = true;
          }
          if (type === "done" && !finished) setStage("done");
        }
        if (done) break;
      }
      if (!finished) {
        // Diff + checks are already on screen; only the model part is missing.
        setState("failed");
        setError("The review stream ended before the model finished. The diff summary and checks above are complete.");
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setState("failed");
      setError(e.message);
    }
  }

  const hasPartial = Boolean(files);

  return (
    <div className="mf-review">
      {/* ── Form ─────────────────────────────────────────────── */}
      {state === "idle" && (
        <div className="mf-review-form">
          <div className="heading">
            <span className="icon">
              <GitPullRequest size={16} />
            </span>
            <div>
              <p className="eyebrow">PULL REQUEST REVIEW</p>
              <p className="sub">
                Paste a public pull request. The diff is parsed, the baseline is searched, and the
                written review lands here in one piece — no empty stream waiting.
              </p>
            </div>
          </div>

          <label htmlFor="pr-url" className="field-label">
            Pull request URL
          </label>
          <div className={`field ${validation ? "invalid" : url ? "valid" : ""}`}>
            <GitPullRequest size={14} />
            <input
              id="pr-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="https://github.com/owner/repo/pull/123"
              spellCheck={false}
              autoComplete="off"
            />
            {url && !validation && <Check size={14} className="ok" />}
          </div>
          <p className={`hint ${validation ? "bad" : ""}`}>
            {validation || "Same repository as the loaded snapshot · public pull requests only"}
          </p>

          <p className="field-label">What should the review focus on?</p>
          <div className="choices">
            {QUESTION_KEYS.map(([key, label]) => (
              <button
                key={key}
                className={questionKey === key ? "active" : ""}
                onClick={() => setQuestionKey(key)}
                aria-pressed={questionKey === key}
              >
                {questionKey === key && <Check size={11} />}
                {label}
              </button>
            ))}
          </div>

          <button className="run" disabled={!ready} onClick={() => run()}>
            <Sparkles size={14} />
            Review this pull request
          </button>
          <p className="fine">
            Runs searches first, then calls the free model once in the background. Working code is
            never executed; the diff is treated as untrusted text.
          </p>
          {error && <p className="err"><X size={12} /> {error}</p>}
        </div>
      )}

      {/* ── Running ──────────────────────────────────────────── */}
      {state === "running" && (
        <div className="mf-review-progress">
          <div className="heading">
            <span className="icon active">
              <GitPullRequest size={16} />
            </span>
            <div>
              <p className="eyebrow">REVIEWING IN THE BACKGROUND</p>
              <p className="sub">
                {files ? `${files.files.length} changed files` : "Reading the diff"} · you can
                switch tabs, the review keeps going.
              </p>
            </div>
          </div>
          <StageList stage={stage} files={files} />
          {files?.truncated && (
            <p className="note">
              Only the first {files.files.length} changed files are reviewed; the diff was larger
              than the review budget.
            </p>
          )}
          {checks.length > 0 && (
            <div className="mf-review-checks">
              <p className="eyebrow">CHECKS ALREADY DERIVED</p>
              {checks.map((c, i) => (
                <div key={i} className={`check ${c.kind}`}>
                  <ShieldQuestion size={12} />
                  <code>{c.path}</code>
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <button
            className="ghost"
            onClick={() => {
              abort.current?.abort();
              reset();
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Result / partial failure ─────────────────────────── */}
      {(state === "done" || hasPartial || state === "failed") && (
        <div className="mf-review-result" ref={resultRef}>
          <div className="result-head">
            <span className="icon done"><GitPullRequest size={16} /></span>
            <div>
              <p className="eyebrow">PULL REQUEST</p>
              <p className="sub">
                {summary
                  ? `${summary.files} files · +${summary.added} / -${summary.removed} · ${summary.tests_touched} test file${summary.tests_touched === 1 ? "" : "s"} touched`
                  : `${files?.files?.length || 0} changed files parsed`}
              </p>
            </div>
            <button className="ghost" onClick={() => { reset(); }}>
              <RotateCcw size={12} /> New review
            </button>
          </div>

          {summary?.kinds && (
            <div className="mf-review-kinds">
              {Object.entries(summary.kinds).map(([kind, count]) =>
                count ? (
                  <span key={kind} className={kind}>
                    {count} {kind}
                  </span>
                ) : null,
              )}
              {summary.new_symbols?.length > 0 && (
                <span className="novel">{summary.new_symbols.length} new symbol{summary.new_symbols.length === 1 ? "" : "s"}</span>
              )}
            </div>
          )}

          {state === "done" ? (
            <>
              <div className="mf-review-answer" dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
              {timing && (
                <p className="timing">
                  {timing.server ? `${Math.round(timing.server)}s server` : ""}
                  {timing.server && timing.client ? " · " : ""}
                  {timing.client ? `${Math.round(timing.client)}s from click` : ""}
                </p>
              )}
            </>
          ) : (
            <div className="partial">
              <p className="err"><X size={12} /> {error || "The review could not be completed."}</p>
              <p className="note">Only the written review is missing. The checks and the changed-file list below are derived from the real diff.</p>
              <button className="run" onClick={() => run()}>
                <Sparkles size={13} /> Try the review again
              </button>
            </div>
          )}

          {checks.length > 0 && (
            <div className="mf-review-checks">
              <p className="eyebrow">CHECKS FROM THE DIFF</p>
              {checks.map((c, i) => (
                <div key={i} className={`check ${c.kind}`}>
                  <ShieldQuestion size={12} />
                  <code>{c.path}</code>
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mf-review-files">
            <p className="eyebrow">CHANGED FILES · CITED IN THE REVIEW</p>
            {diffs.map((d) => (
              <DiffEntry key={d.id} entry={d} onOpen={onSource} />
            ))}
            {!diffs.length &&
              (files?.files || []).map((f) => (
                <div key={f.path} className="mf-pr-file">
                  <div className="head static">
                    <span className={`tag ${f.kind}`}>{f.kind}</span>
                    <code>{f.path}</code>
                    <span className="counts">
                      <em className="add">+{f.added}</em>
                      <em className="del">-{f.removed}</em>
                    </span>
                  </div>
                </div>
              ))}
          </div>
          <p className="fine">
            Citation IDs are checked against the diff and retrieved source. Presence of a citation
            does not prove every sentence; open the cited code.
          </p>
        </div>
      )}
    </div>
  );
}

/* Minimal inline renderer for the review: **bold**, `code`, [S1]/[D2] chips.
   All text is escaped first; only our own tags are introduced afterwards. */
function renderInline(text) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chip = (id) => `<span class="mf-pr-cite" title="${id}">${id}</span>`;
  return esc(text || "")
    .split("\n")
    .map((line) => {
      let out = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
      // Only bracketed IDs, so prose like "HTTP 4xx" or "S3 buckets" is left alone.
      out = out.replace(/\[((?:S|D)\d+)\]/g, (m, id) => chip(id));
      if (/^\s*#{1,6}\s+/.test(line)) return `<h4>${out.replace(/^\s*#{1,6}\s+/, "")}</h4>`;
      if (/^\s*[-*]\s+/.test(line)) return `<div class="li">• ${out.replace(/^\s*[-*]\s+/, "")}</div>`;
      if (!line.trim()) return "<div class='gap'></div>";
      return `<div>${out}</div>`;
    })
    .join("");
}
