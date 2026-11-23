import { API_BASE, apiErrorMessage } from "./lib/apiConfig.js";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  Code2,
  FileCode2,
  GitBranch,
  GitPullRequest,
  Github,
  Layers3,
  Loader2,
  Search,
  ShieldCheck,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import LegacyApp from "./LegacyApp.jsx";
import Landing from "./pages/Landing.jsx";
import VideoPanel from "./components/VideoPanel.jsx";
import ReviewPanel from "./components/ReviewPanel.jsx";
import NarrationPlayer from "./components/NarrationPlayer.jsx";
import { requestNarrationLong, narrationText } from "./lib/narration.js";
import {
  BookOpen,
  MessageSquare,
  GraduationCap,
  Video,
  Volume2,
} from "lucide-react";
import "./repository.css";

const BASE = `${API_BASE}/repository`;
async function api(path, options) {
  const r = await fetch(BASE + path, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      apiErrorMessage(r.status, data.detail, `/api/repository${path}`),
    );
  return data;
}
const post = (value) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

function Logo() {
  return (
    <span className="mf-logo">
      <span className="mf-mark">
        <GitBranch size={19} />
      </span>{" "}
      mindflow<span className="mf-version">/ code</span>
    </span>
  );
}
/* Verified build plan, shown before the prose so the order is never the
   model's invention. Clicking a step opens the exact lines. */
function PlanSteps({ plan, sources, onSource }) {
  const [open, setOpen] = useState(true);
  const steps = plan?.steps || [];
  if (!steps.length) return null;
  return (
    <div className="mf-plan">
      <button className="mf-plan-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <GitBranch size={13} />
        <span>
          {steps.length}-step build plan
          {plan.feature ? <> for <em>{plan.feature}</em></> : null}
        </span>
        <small>{open ? "hide" : "show"}</small>
      </button>
      {open && (
        <ol className="mf-plan-steps">
          {steps.map((step, i) => {
            const snippet = (sources || []).find(
              (s) => s.path === step.path && s.start === step.anchor[0],
            );
            return (
              <li key={`${step.path}-${step.anchor[0]}`}>
                <span className="n">{i + 1}</span>
                <div className="body">
                  <p className="file">
                    <code>{step.path}</code>
                    <button
                      className="lines"
                      onClick={() => onSource(step.path, step.anchor[0], step.anchor[1])}
                    >
                      L{step.anchor[0]}-{step.anchor[1]}
                    </button>
                    {snippet && <span className="cite">{snippet.id}</span>}
                  </p>
                  {step.declarations?.length > 0 && (
                    <p className="decl">{step.declarations.map((d) => <code key={d}>{d}</code>)}</p>
                  )}
                  <p className="wire">
                    {step.imports?.length ? `imports ${step.imports.join(", ")}` : "no in-snapshot imports"}
                    {step.used_by?.length ? ` · used by ${step.used_by.slice(0, 3).join(", ")}` : ""}
                    {step.route ? ` · route ${step.route}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Answer({ text, sources, onSource, blueprint }) {
  function inline(value) {
    return value
      .split(/(\[S\d+\]|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
      .map((part, i) => {
        const source = sources.find((s) => `[${s.id}]` === part);
        if (source)
          return (
            <button
              key={i}
              className="mf-citation"
              onClick={() => onSource(source.path, source.start, source.end)}
              title={`${source.path}:${source.start}-${source.end}`}
            >
              {source.id}
              <ArrowUpRight size={10} />
            </button>
          );
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code
              key={i}
              style={{
                background: "#f3ece2",
                padding: "1px 4px",
                borderRadius: 3,
                overflowWrap: "anywhere",
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i}>{inline(part.slice(1, -1))}</em>;
        return <span key={i}>{part}</span>;
      });
  }
  // Code blocks are grouped so they can be labelled with language, anchored to
  // the real file lines, and copied — a run of grey lines is not usable code.
  const lines = text.split("\n");
  const blocks = [];
  let fenced = false;
  let currentBlock = null;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      if (fenced) { blocks.push(currentBlock); currentBlock = null; }
      else currentBlock = { start: i, lang: line.replace(/^\s*```/, "").trim(), code: [] };
      fenced = !fenced;
      return;
    }
    if (fenced) currentBlock.code.push(line);
    else blocks.push({ line, index: i });
  });
  if (currentBlock) blocks.push(currentBlock);
  return (
    <div className="mf-answer" style={{ whiteSpace: "normal" }}>
      {blocks.map((block, i) => {
        if (block.code) return <CodeBlock key={`c${i}`} block={block} blueprint={blueprint} onSource={onSource} inline={inline} />;
        const line = block.line;
        if (!line.trim()) return <div key={block.index} style={{ height: 8 }} />;
        const heading = line.match(/^#{1,6}\s+(.+)/);
        if (heading)
          return (
            <h4
              key={block.index}
              style={{
                fontSize: 13,
                fontWeight: 650,
                margin: "12px 0 5px",
                lineHeight: 1.5,
              }}
            >
              {inline(heading[1])}
            </h4>
          );
        if (/^\s*[-*]\s+/.test(line))
          return (
            <div
              key={block.index}
              style={{ paddingLeft: 13, textIndent: -10, margin: "4px 0" }}
            >
              • {inline(line.replace(/^\s*[-*]\s+/, ""))}
            </div>
          );
        if (/^\s*\d+[.)]\s+/.test(line))
          return (
            <div key={block.index} style={{ paddingLeft: 12, margin: "4px 0" }}>
              {inline(line)}
            </div>
          );
        if (/^\s*---+\s*$/.test(line))
          return (
            <hr
              key={block.index}
              style={{
                border: 0,
                borderTop: "1px solid #e8e1d4",
                margin: "12px 0",
              }}
            />
          );
        return (
          <div key={block.index} style={{ margin: "3px 0" }}>
            {inline(line)}
          </div>
        );
      })}
    </div>
  );
}
function CodeBlock({ block, blueprint, onSource, inline }) {
  const [copied, setCopied] = useState(false);
  const code = block.code.join("\n");
  // Match the block back to a plan step by a declaration it contains, so the
  // snippet can be anchored to the file and lines it really came from.
  const step = (blueprint?.steps || []).find(
    (s) => (s.declarations || []).some((d) => code.includes(d)) && s.language === (block.lang || s.language),
  ) || (blueprint?.steps || []).find((s) => (s.declarations || []).some((d) => code.includes(d)));
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="mf-codeblock">
      <div className="mf-codeblock-head">
        <span className="lang">{block.lang || "code"}</span>
        {step && (
          <button className="anchor" onClick={() => onSource(step.path, step.anchor[0], step.anchor[1])}>
            <FileCode2 size={11} />
            {step.path} L{step.anchor[0]}-{step.anchor[1]}
          </button>
        )}
        <button className="copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function looksLikeBuildQuestion(text) {
  const value = (text || "").trim();
  if (!/(^|\s)how\s+(do|can|would|should)\s+(i|we)\b/i.test(value) &&
      !/build\s+(this|that|it|a|an|my|our)\b/i.test(value)) return false;
  return /\b(build|implement|add|create|make|write|support|replicate|recreate|ship)\b/i.test(value);
}

function formatMs(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/* Prompts derived from the snapshot itself, so the first question is one click
   away and already points at real paths in this repository. */
function StarterPrompts({ project, selected, onPick, onAsk }) {
  const prompts = useMemo(() => {
    const files = project?.files || [];
    const tests = files.filter((f) => /(^|\/)(tests?|__tests__|spec)\//i.test(f.path) || /\.(test|spec)\.[a-z]+$/i.test(f.path));
    const entry = files.find((f) => /(^|\/)(main|app|index|server|cli|program)\.[a-z]+$/i.test(f.path));
    const firstTest = tests[0];
    return [
      "Give me an overview of this repository and its entry points.",
      entry ? `Walk me through ${entry.path}, starting at its top-level definitions.` : null,
      firstTest ? `What does ${firstTest.path} check, and which source files does it import?` : null,
      "Trace the main data flow across files.",
      selected
        ? `How do I build a feature modelled on ${selected}?`
        : "How do I build a feature like the main entry point here?",
      "Where are errors handled, and what tests cover them?",
    ].filter(Boolean);
  }, [project]);

  return (
    <div className="mf-starters">
      <div className="mf-starters-head">
        <span className="mf-eyebrow">TRY ONE</span>
        <span>
          {"tap to fill the box, then send · build questions get a step-by-step plan"}
        </span>
      </div>
      {prompts.map((q, i) => (
        <div key={q} className="mf-starter">
          <button className="label" onClick={() => onPick(q)} title="Put this in the question box">
            {q}
          </button>
          <button className="go" onClick={() => onAsk(q)} aria-label={`Ask: ${q}`}>
            <ArrowUpRight size={15} />
          </button>
          {i === 0 && <span className="mf-starter-tag">start here</span>}
        </div>
      ))}
    </div>
  );
}

/* Shows what is actually happening while the answer is still empty, so a slow
   free model reads as progress instead of a frozen panel. */
const STAGES = [
  ["Reading the saved snapshot"],
  ["Searching every indexed source file"],
  ["Sending the closest excerpts to the free model", "Writing the answer from the cited code"],
  ["Checking source IDs"],
];

function RetrievalStages({ status, sources }) {
  const reached = !status
    ? 0
    : /Checking source IDs|Writing the answer/i.test(status)
      ? 3
      : /Sending the retrieved|asking the free model|Found \d+/i.test(status)
        ? 2
        : /Searching/i.test(status)
          ? 1
          : 0;
  const labels = [
    "Snapshot opened",
    sources?.length != null
      ? `${sources.length} matching excerpt${sources.length === 1 ? "" : "s"} found`
      : "Searching every indexed file…",
    sources?.length === 0 ? "No excerpt matched" : "Free model is composing the answer",
    "Source IDs checked before display",
  ];
  return (
    <ol className="mf-stages" aria-live="polite">
      {labels.map((label, i) => (
        <li key={STAGES[i][0]} className={i < reached ? "done" : i === reached ? "active" : ""}>
          {i < reached ? (
            <Check size={11} />
          ) : i === reached ? (
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

function SourceNode({ data }) {
  return (
    <div className={`mf-node ${data.active ? "active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="mf-node-top">
        <FileCode2 size={15} />
        <span>{data.label}</span>
        <span className="mf-node-dot" />
      </div>
      <div className="mf-node-path">{data.path}</div>
      <div className="mf-node-foot">
        {data.citations.join(" · ")}
        <span>view source ↗</span>
      </div>
    </div>
  );
}
function QuestionNode({ data }) {
  return <div className="mf-question-node"><Handle type="source" position={Position.Right} /><span>QUESTION</span><strong>{data.label}</strong><small>Connected to retrieved source evidence</small></div>;
}
const nodeTypes = { source: SourceNode, question: QuestionNode };
function Diagram({ nodes, edges, onSource, active, fitKey }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 70);
    return () => clearTimeout(id);
  }, [nodes.length, fitKey, fitView]);
  useEffect(() => {
    let timer;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 150);
    };
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [fitView]);
  const rendered = useMemo(() => {
    // A compact reading-order layout, not a claim about runtime sequence.
    const columns = Math.max(1, Math.ceil(nodes.length / 4)),
      rows = Math.ceil(nodes.length / columns);
    return nodes.map((n, i) => ({
      id: n.id,
      type: n.kind === "question" ? "question" : "source",
      position: n.kind === "question" ? { x: 0, y: 160 } : { x: 360 + Math.floor((i - 1) / rows) * 310, y: ((i - 1) % rows) * 145 },
      data: { ...n, active: active === n.path },
    }));
  }, [nodes, edges, active]);
  return (
    <ReactFlow
      nodes={rendered}
      edges={edges.map((e) => ({
        ...e,
        animated: true,
        label: e.kind === "evidence" ? "source evidence" : `imports · L${e.line}`,
        style: { stroke: "#b07a57", strokeWidth: 1.6 },
        labelStyle: { fill: "#745b47", fontSize: 10 },
        labelBgStyle: { fill: "#fbf8f1" },
      }))}
      onNodeClick={(_, n) => n.data.path && onSource(n.data.path)}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.25}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
    >
      <Background gap={22} size={1} color="#e8e1d4" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
function SourceSheet({ source, close }) {
  const target = useRef(null);
  useEffect(() => {
    target.current?.scrollIntoView({ block: "center" });
  }, [source.path, source.start]);
  return (
    <div className="mf-overlay" onClick={close}>
      <section
        className="mf-source-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Source code"
      >
        <div className="mf-sheet-header">
          <div>
            <span className="mf-eyebrow">EXACT CODE · PINNED COMMIT</span>
            <h3>{source.path}</h3>
          </div>
          <button onClick={close} aria-label="Close source">
            <X size={20} />
          </button>
        </div>
        <div className="mf-source-meta">
          <span>
            {source.sha.slice(0, 8)} · {source.lines} lines
          </span>
          <a href={source.url} target="_blank" rel="noreferrer">
            Open on GitHub <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="mf-code">
          {source.text.split("\n").map((line, i) => (
            <div
              key={i}
              ref={i + 1 === source.start ? target : null}
              className={
                i + 1 >= source.start && i + 1 <= (source.end || source.start)
                  ? "highlight"
                  : ""
              }
            >
              <span>{i + 1}</span>
              <code>{line || " "}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function Coverage({ project, close }) {
  return (
    <div className="mf-overlay" onClick={close}>
      <section
        className="mf-coverage-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Repository coverage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mf-sheet-header">
          <div>
            <span className="mf-eyebrow">WHAT WE READ</span>
            <h3>Files included in your project.</h3>
          </div>
          <button onClick={close} aria-label="Close coverage">
            <X />
          </button>
        </div>
        <div className="mf-metrics">
          <div>
            <strong>{project.coverage.archive_entries}</strong>
            <span>archive files</span>
          </div>
          <div>
            <strong>{project.coverage.indexed_files}</strong>
            <span>files read in full</span>
          </div>
          <div>
            <strong>{project.coverage.omitted_files}</strong>
            <span>explicitly excluded</span>
          </div>
        </div>
        <p>{project.coverage.scope}</p>
        <p>
          No supported text file was shortened. The whole repository is searched
          for each question; only the most relevant excerpts go to the model.
          Large imports are rejected instead of silently truncated. Cache is
          disposable and expires after seven days.
        </p>
        <div className="mf-coverage-list">
          <h4>Excluded files</h4>
          {project.omitted.length ? (
            project.omitted.map((f) => (
              <div key={f.path}>
                <code>{f.path}</code>
                <span>{f.reason}</span>
              </div>
            ))
          ) : (
            <p>None. Every archive file was indexed.</p>
          )}
        </div>
        <p className="mf-fine">
          Snapshot: {project.sha}. Does not watch new commits. Python/JS/TS
          imports are mapped statically; unresolved imports and other languages
          may not appear as connections. This is not a runtime trace.
        </p>
      </section>
    </div>
  );
}

function Speech({ text }) {
  const [voice, setVoice] = useState("friendly"),
    [busy, setBusy] = useState(false),
    [audio, setAudio] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const ref = useRef("");
  const controller = useRef(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (ref.current) URL.revokeObjectURL(ref.current);
    },
    [],
  );
  async function speak() {
    setBusy(true);
    setError("");
    setProgress("Generating audio…");
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const script = narrationText(text);
      // Long answers are split into short sections instead of being refused:
      // Kokoro reads short input more evenly and each part stays under the
      // server's 6,000-character limit.
      const blob = await requestNarrationLong(script, voice, controller.signal, (done, total) => {
        if (total > 1) setProgress(`Reading part ${done} of ${total}…`);
        else setProgress("Generating audio…");
      });
      if (ref.current) URL.revokeObjectURL(ref.current);
      ref.current = URL.createObjectURL(blob);
      setAudio(ref.current);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <div className="mf-speech">
      <div>
        <select
          aria-label="Narration voice"
          value={voice}
          onChange={(e) => {
            setVoice(e.target.value);
            setAudio("");
          }}
        >
          <option value="friendly">Heart · warm</option>
          <option value="narrator">Michael · narrator</option>
          <option value="calm">Emma · calm British</option>
        </select>
        <button disabled={busy} onClick={speak}>
          <Volume2 size={13} />
          {busy ? progress || "Making audio..." : audio ? "Listen again" : "Listen"}
        </button>
      </div>
      {audio && (
        <NarrationPlayer src={audio} />
      )}
      {error && <p role="alert">{error}</p>}
      <small>
        Kokoro voice · balanced levels · long answers are read in short sections so nothing is
        refused. Listening pace affects playback only.
      </small>
    </div>
  );
}
const STUDIO_TABS = [
  ["ask", "Ask", MessageSquare],
  ["explain", "Explain", BookOpen],
  ["architecture", "Architecture", Layers3],
  ["interview", "Interview", GraduationCap],
  ["review", "PR review", GitPullRequest],
  ["video", "Video", Video],
];
const STUDIO_CSS = `
.mf-studio-tabs{display:flex;flex-shrink:0;border-bottom:1px solid #e8e1d4;background:#fffdf9;overflow-x:auto}.mf-studio-tabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:13px 7px;color:#917e6d;font-size:10px;border-bottom:2px solid transparent;min-width:56px}.mf-studio-tabs button.active{color:#b5673f;border-color:#b5673f;background:#b5673f08}.mf-studio-tools{padding:18px;border-bottom:1px solid #e8e1d4;background:#fcfaf5}.mf-studio-tools h3{font-size:18px;color:#3d2b1f;font-weight:650;margin:0 0 8px}.mf-studio-tools p{font-size:12px;line-height:1.7;color:#8b7766;margin:6px 0}.mf-studio-tools select{max-width:100%;width:100%;border:1px solid #e4d9c9;background:#fff;padding:8px;border-radius:8px;margin:8px 0;font-size:11px;color:#554335}.mf-mode-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.mf-mode-buttons button,.mf-speech button{display:flex;align-items:center;gap:6px;border:1px solid #ddcdbb;border-radius:8px;padding:8px 10px;background:#fff;font-size:11px;color:#674a35}.mf-mode-buttons button:disabled{opacity:.4}.mf-speech{margin-top:12px;padding-top:10px;border-top:1px solid #e8e1d4}.mf-speech>div{display:flex;gap:8px;flex-wrap:wrap}.mf-speech select{background:#fff;border:1px solid #ddcdbb;border-radius:8px;font-size:11px;max-width:160px;padding:6px}.mf-speech audio{width:100%;height:34px;margin-top:9px}.mf-speech small{display:block;font-size:10px;color:#9d8c7d;margin-top:8px}.mf-speech a{font-size:11px;color:#a35f37}.mf-media-body{flex:1;overflow-y:auto}.mf-studio-chat .mf-chat-heading{padding:10px 22px}.mf-loading-screen{position:fixed;inset:0;background:#fffdf9ee;z-index:100;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center;padding:30px}.mf-loading-screen p{max-width:420px;color:#8b7766;font-size:13px;line-height:1.8}
@media(min-width:1100px){.mf-work-grid{grid-template-columns:210px minmax(250px,1fr) minmax(420px,490px)}}
`;

export default function App() {
  if (
    window.location.pathname.startsWith("/docs") ||
    window.location.pathname.startsWith("/share/")
  )
    return <LegacyApp />;
  return <RepositoryApp />;
}
function RepositoryApp() {
  const [project, setProject] = useState(null),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [loadStartedAt, setLoadStartedAt] = useState(Date.now()),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) return;
    setLoadStartedAt(Date.now());
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - loadStartedAt), 1000);
    return () => clearInterval(id);
  }, [loading]);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [nodes, setNodes] = useState([]),
    [edges, setEdges] = useState([]),
    [graphInfo, setGraphInfo] = useState(""),
    [sources, setSources] = useState([]),
    [source, setSource] = useState(null),
    [coverage, setCoverage] = useState(false),
    [active, setActive] = useState(""),
    [provider, setProvider] = useState(null),
    [probe, setProbe] = useState({ state: "checking" }),
    [fitKey, setFitKey] = useState(0);
  const [tab, setTab] = useState("ask"),
    [focus, setFocus] = useState("");
  const [graphId, setGraphId] = useState(null);
  const [fileLimit, setFileLimit] = useState(100);
  const filteredFiles = useMemo(() => (project?.files || []).filter(f => f.path.toLowerCase().includes(filter.toLowerCase())), [project, filter]);
  useEffect(() => setFileLimit(100), [filter, project]);
  const end = useRef(null),
    controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);
  useEffect(() => {
    // Time the free-model check: it is a network round-trip to the backend,
    // which is the most common cause of a slow first answer.
    const started = performance.now();
    api("/status")
      .then((p) => {
        setProvider(p);
        const ms = performance.now() - started;
        setProbe(
          p.ready
            ? { state: "ready", ms, model: p.model }
            : { state: "limited", ms, reason: p.reason || "Free model not ready" },
        );
      })
      .catch((e) => {
        setProvider({ ready: false, reason: "Provider status unavailable" });
        setProbe({ state: "error", reason: e.message });
      });
    const m = window.location.pathname.match(/^\/repo\/([a-f0-9-]{36})$/);
    if (m) {
      setLoading(true);
      api("/" + m[1])
        .then(setProject)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, []);
  async function importRepo(value) {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const p = await api("/import", post({ url: value || url }));
      setProject(p);
      setFocus(
        p.files.find(
          (f) => f.path.startsWith("src/") && /\.(jsx?|tsx?|py)$/.test(f.path),
        )?.path ||
          p.files.find((f) => /\.(jsx?|tsx?|py|go|rs)$/.test(f.path))?.path ||
          p.files[0]?.path ||
          "",
      );
      setMessages([]);
      setNodes([]);
      setEdges([]);
      setSources([]);
      window.history.replaceState({}, "", `/repo/${p.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function openSource(path, start = 1, endLine = 0) {
    if (!project) return;
    try {
      const file = await api(
        `/${project.id}/file?path=${encodeURIComponent(path)}`,
      );
      setActive(path);
      setSource({
        ...file,
        start,
        end: endLine || start,
        sha: project.sha,
        url: `${project.url}/blob/${project.sha}/${path.split("/").map(encodeURIComponent).join("/")}#L${start}${endLine ? `-L${endLine}` : ""}`,
      });
    } catch (e) {
      setError(e.message);
    }
  }
  async function ask(value) {
    const question = (value || query).trim();
    if (!question || busy) return;
    setQuery("");
    setBusy(true);
    setError("");
    setNodes([]);
    setEdges([]);
    setSources([]);
    setGraphInfo("");
    setStatus("Searching every indexed source file…");
    const startedAt = Date.now();
    const id = Date.now();
    setGraphId(id);
    const questionNode = { id: `question-${id}`, kind: "question", label: question };
    setNodes([questionNode]);
    let answerNodes = [questionNode];
    let answerEdges = [];
    // Only the newest chat answer owns the shared right-side node list, so a
    // slower older stream cannot overwrite it. Visible effect: answers and
    // their source map land in one batch instead of a burst of re-renders.
    let repaintQueued = false;
    const repaint = () => {
      if (repaintQueued) return;
      repaintQueued = true;
      queueMicrotask(() => {
        repaintQueued = false;
        const evidence = answerNodes
          .filter((n) => n.path)
          .map((n) => ({ id: `evidence-${n.id}`, source: questionNode.id, target: n.id, kind: "evidence" }));
        const graph = { nodes: [...answerNodes], edges: [...answerEdges, ...evidence] };
        setNodes(graph.nodes);
        setEdges(graph.edges);
        update({ graph });
      });
    };
    const previous = messages.filter(m => !m.failed && !m.provisional).slice(-4);
    const context = previous.map(m => `${m.role}: ${m.text.slice(0, 200)}`).join("\n");
    const contextBudget = Math.max(0, 1200 - question.length - 130);
    const contextualQuestion = context && contextBudget > 0
      ? `Previous conversation (context only, verify against source):\n${context.slice(-contextBudget)}\n\nCurrent question: ${question}`
      : question;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question, id: id - 1, tab },
      { role: "assistant", text: "", sources: [], id, provisional: true, tab, graph: { nodes: [questionNode], edges: [] } },
    ]);
    const update = (patch) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) }
            : m,
        ),
      );
    controller.current = new AbortController();
    let completed = false;
    // "How do I build X?" goes to the blueprint endpoint: it returns a verified
    // step plan and snippets before the model writes anything.
    const endpoint = looksLikeBuildQuestion(question) ? "build" : "ask";
    try {
      const response = await fetch(`${BASE}/${project.id}/${endpoint}`, {
        ...post({ question: contextualQuestion }),
        signal: controller.current.signal,
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(response.status, d.detail, `/api/repository/${project.id}/${endpoint}`));
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      let currentSources = [];
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
          if (type === "status") setStatus(data.text);
          if (type === "build_plan") {
            update({ plan: data, kind: "build" });
            setStatus(
              data.steps?.length
                ? `Plan ready: ${data.steps.length} steps. Free model is writing the blueprint…`
                : status,
            );
          }
          if (type === "blueprint") {
            update({
              text: data.answer,
              sections: data.sections,
              plan: { ...(data.plan || {}), steps: data.steps, feature: data.feature, foundation: data.foundation },
              kind: "build",
              totalMs: Date.now() - startedAt,
            });
            setStatus("Blueprint ready — each step is linked to real lines");
          }
          if (type === "sources") {
            currentSources = data.sources;
            setSources(data.sources);
            update({
              sources: data.sources,
              searched: data.searched_files,
              retrieved: data.sources.length,
            });
            setStatus(
              data.sources.length
                ? `Found ${data.sources.length} matching source ${data.sources.length === 1 ? "excerpt" : "excerpts"} — asking the free model…`
                : "No matching source found — checking…",
            );
          }
          if (type === "node") {
            const existing = answerNodes.find(n => n.path && n.path === data.path);
            if (existing) answerNodes = answerNodes.map(n => n === existing ? { ...data, citations: [...new Set([...(existing.citations || []), ...(data.citations || [])])] } : n);
            else if (!answerNodes.some(n => n.id === data.id)) answerNodes.push(data);
          }
          if (type === "edge" && !answerEdges.some(e => e.id === data.id)) answerEdges.push(data);
          if (type === "sources" || type === "node" || type === "edge") {
            for (const source of currentSources) {
              let node = answerNodes.find(n => n.path === source.path);
              if (!node) {
                node = { id: `file-${source.path}`, path: source.path, label: source.path.split("/").pop(), citations: [] };
                answerNodes.push(node);
              }
              answerNodes = answerNodes.map(n => n.id === node.id ? { ...n, citations: [...new Set([...(n.citations || []), source.id])] } : n);
            }
            repaint();
          }
          if (type === "graph_info") setGraphInfo(data.text);
          if (type === "answer")
            update((m) => ({
              text: m.text + data.text,
              // First visible token ends the wait; record how long it took.
              ttftMs: m.ttftMs ?? Date.now() - startedAt,
            }));
          if (type === "error" || type === "invalid") {
            update({ text: data.text, failed: true, provisional: false });
            completed = true;
          }
          if (type === "done") {
            update({
              provisional: false,
              provider: data.provider,
              totalMs: Date.now() - startedAt,
            });
            setStatus("Answer ready — check the linked files");
            completed = true;
          }
        }
        if (done) break;
      }
      if (!completed)
        throw new Error(
          "The answer stream ended early. Ask again; the incomplete draft was hidden.",
        );
    } catch (e) {
      update({
        text:
          e.name === "AbortError"
            ? "Answer stopped. The source map is still available."
            : e.message,
        failed: true,
        provisional: false,
      });
    } finally {
      if (controller.current?.signal.aborted) {
        update((m) =>
          m.provisional ? { provisional: false, stopped: true } : {},
        );
      }
      setBusy(false);
      setStatus("");
      setFitKey((k) => k + 1);
    }
  }
  function reset() {
    controller.current?.abort();
    setBusy(false);
    setProject(null);
    setMessages([]);
    setError("");
    window.history.replaceState({}, "", "/");
  }
  const selected =
    focus ||
    active ||
    project?.files.find(
      (f) => f.path.startsWith("src/") && /\.(jsx?|tsx?|py)$/.test(f.path),
    )?.path ||
    project?.files.find((f) => /\.(jsx?|tsx?|py|go|rs)$/.test(f.path))?.path ||
    project?.files[0]?.path ||
    "";
  const shown = messages.filter((m) => (m.tab || "ask") === tab);
  function task(mode) {
    const prompts = {
      explain: `Explain the implementation in ${selected}, in simple English and then technical detail. Follow related files when needed. Cite actual code.`,
      analogy: `Give a beginner-friendly analogy for ${selected}, then distinguish the analogy from what the real code implements. Cite code.`,
      mistakes: `What mistakes or failure cases should a developer watch for in ${selected}? Separate observed handling from hypothetical risks. Cite code.`,
      questions: `Create interview questions and evidence-based answers about ${selected}. Distinguish what this code shows from missing evidence. Cite code.`,
      architecture: `Explain the architecture visible in source files, starting with ${selected}. Trace imports, API boundaries and storage only where the code proves them. Distinguish static imports from runtime behavior. Cite code.`,
      interview: `Prepare a 60-second project pitch, then beginner, intermediate and advanced interview questions with answers grounded in source, starting from ${selected} and connected files. Do not invent scale, users, business results or missing implementation. Cite code.`,
    };
    ask(prompts[mode]);
  }
  if (!project)
    return (
      <>
        <Landing onGithubImport={importRepo} error={error} loading={loading} />
        {loading && (
          <div className="mf-loading-screen">
            <Loader2 className="mf-spin" />
            <h2>Reading the repository</h2>
            <p>
              We check for a saved copy of this commit first. A new, large
              repository can take a few minutes to download and index — the
              counter below is elapsed time, not a progress bar.
            </p>
            <p className="mf-loading-time">{formatMs(elapsed)} elapsed</p>
          </div>
        )}
        <style>{STUDIO_CSS}</style>
      </>
    );
  return (
    <div className="mf-app mf-workspace">
      <style>{STUDIO_CSS}</style>
      <header className="mf-header">
        <div className="mf-header-left">
          <button
            onClick={reset}
            className="mf-back"
            aria-label="Choose another repository"
          >
            <ChevronLeft size={18} />
          </button>
          <Logo />
          <span className="mf-header-sep" />
          <span className="mf-repo-name">{project.repository}</span>
        </div>
        <div className="mf-header-links">
          <a
            href={`${project.url}/tree/${project.sha}`}
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={13} />
            {project.sha.slice(0, 8)}
          </a>
          <a className="mf-docs-download" href={`${BASE}/${project.id}/documentation`} aria-label="Download repository documentation"><BookOpen size={14} />Docs</a>
          <a className="mf-docs-download" href={`${BASE}/${project.id}/documentation?bundle=true`} aria-label="Download all indexed source and documentation"><FileCode2 size={14} />Source ZIP</a>
          <button className="mf-coverage-btn" onClick={() => setCoverage(true)}>
            <Check size={14} />
            {project.coverage.indexed_files} files ready
          </button>
        </div>
      </header>
      <div className="mf-work-grid">
        <aside className="mf-files">
          <div className="mf-panel-label">
            REPOSITORY <span>{project.files.length}</span>
          </div>
          <label className="mf-file-search">
            <Search size={14} />
            <input
              aria-label="Filter indexed files"
              placeholder="Find a file..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <div className="mf-file-list">
            {filteredFiles.slice(0, fileLimit).map((f) => (
                <button
                  key={f.path}
                  className={active === f.path ? "selected" : ""}
                  onClick={() => openSource(f.path)}
                  title={f.path}
                >
                  <FileCode2 size={13} />
                  <span>{f.path}</span>
                </button>
              ))}
            {filteredFiles.length > fileLimit && <button onClick={() => setFileLimit(count => count + 100)}>Show more ({Math.min(fileLimit, filteredFiles.length)} of {filteredFiles.length})</button>}
          </div>
          <button
            className="mf-coverage-footer"
            onClick={() => setCoverage(true)}
          >
            <ShieldCheck size={15} />
            <span>
              Files included and skipped
              <small>
                {project.coverage.omitted_files} files excluded · no silent
                truncation
              </small>
            </span>
            <ArrowUpRight size={13} />
          </button>
        </aside>
        <section className="mf-canvas">
          <div className="mf-canvas-title">
            <div>
              <span className="mf-eyebrow">YOUR QUESTION AND ITS SOURCE FILES</span>
              <h2>
                {nodes.length
                  ? "Follow the evidence."
                  : "Your code, connected."}
              </h2>
            </div>
            <span className="mf-map-badge">ANSWER MAP</span>
          </div>
          {nodes.length ? (
            <ReactFlowProvider>
              <Diagram
                nodes={nodes}
                edges={edges}
                onSource={openSource}
                active={active}
                fitKey={fitKey}
              />
            </ReactFlowProvider>
          ) : (
            <div className="mf-canvas-empty">
              <div className="mf-empty-symbol">
                <GitBranch size={42} />
              </div>
              {selected ? (
                <>
                  <h3>Here is the file you picked.</h3>
                  <div className="mf-canvas-pick">
                    <FileCode2 size={15} />
                    <code>{selected}</code>
                  </div>
                  <div className="mf-canvas-actions">
                    <button className="primary" onClick={() => setTab("ask")}>
                      <MessageSquare size={14} /> Ask about this file
                    </button>
                    <button
                      disabled={busy || !["explain", "architecture", "interview"].includes(tab)}
                      onClick={() => task(tab)}
                    >
                      {busy ? <Loader2 size={14} className="mf-spin" /> : <BookOpen size={14} />}
                      {tab === "interview"
                        ? "Interview prep"
                        : tab === "architecture"
                          ? "Trace architecture"
                          : "Explain it"}
                    </button>
                  </div>
                  <p>
                    Pick a prompt below and the source map fills with the files
                    the answer used. Connections are drawn only when an import
                    can be traced to a real line of code.
                  </p>
                </>
              ) : (
                <>
                  <h3>Start with a question.</h3>
                  <p>
                    Relevant source files appear here.
                    <br />
                    Connections are drawn only when an import
                    <br />
                    can be traced to a real line of code.
                  </p>
                </>
              )}
              <span>
                {(project.edge_count ?? project.edges?.length ?? 0)} import connections found in this snapshot
              </span>
            </div>
          )}
          <div className="mf-canvas-note">
            <span className={busy ? "mf-live-dot" : "mf-muted-dot"} />
            {busy
              ? status || "Searching code / streaming evidence"
              : nodes.length
                ? `${nodes.filter(n => n.path).length} source files · answer evidence map`
                : tab === "review"
                  ? "Pull requests are reviewed in the PR review tab"
                  : "Ready to explore"}
            <button onClick={() => setFitKey((k) => k + 1)}>Fit map</button>
          </div>
          {nodes.length > 0 && (
            <div className="mf-map-limit">
              Lines connect your question to the files we found. Click a file to read its code.
            </div>
          )}
        </section>
        <section className="mf-chat mf-studio-chat">
          <nav className="mf-studio-tabs" aria-label="Workspace tools">
            {STUDIO_TABS.map(([id, label, Icon]) => (
              <button
                className={tab === id ? "active" : ""}
                key={id}
                onClick={() => setTab(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          {tab !== "ask" && tab !== "review" && (
            <div className="mf-studio-tools">
              <h3>
                {tab === "explain"
                  ? "Understand the code"
                  : tab === "architecture"
                    ? "Architecture walkthrough"
                    : tab === "interview"
                      ? "Prepare to explain it"
                      : "Video studio"}
              </h3>
              <select
                aria-label="Source file for tools"
                value={selected}
                onChange={(e) => setFocus(e.target.value)}
              >
                {project.files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
              {tab !== "video" && (
                <>
                  <p>
                    Uses the same whole-source search and clickable citations as
                    chat. Choose a starting file; related code is retrieved too.
                  </p>
                  <div className="mf-mode-buttons">
                    {(tab === "explain"
                      ? [
                          ["explain", "Explain"],
                          ["analogy", "Analogy"],
                          ["questions", "Questions"],
                          ["mistakes", "Mistakes"],
                        ]
                      : [
                          [
                            tab,
                            tab === "architecture"
                              ? "Trace architecture"
                              : "Generate interview prep",
                          ],
                        ]
                    ).map(([id, label]) => (
                      <button key={id} disabled={busy} onClick={() => task(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {tab === "review" ? (
            <div className="mf-media-body mf-review-scroll">
              <ReviewPanel
                project={project}
                onSource={(path) => openSource(path)}
              />
            </div>
          ) : tab === "video" ? (
            <div className="mf-media-body">
              <VideoPanel
                key={selected}
                projectId={project.id}
                node={{ id: selected, data: { title: selected } }}
                standalone
              />
            </div>
          ) : (
            <>
              <div className="mf-chat-heading">
                <span className="mf-eyebrow">ASK THE REPOSITORY</span>
                <span
                  className={`mf-provider ${probe.state}`}
                  title={
                    probe.state === "ready"
                      ? `${probe.model} · free model check took ${Math.round(probe.ms)} ms`
                      : probe.reason || "Checking the free model route"
                  }
                >
                  {probe.state === "checking" ? (
                    <>
                      <Loader2 size={9} className="mf-spin" /> CHECKING ROUTE
                    </>
                  ) : probe.state === "ready" ? (
                    <>
                      <span className="mf-provider-dot" /> FREE ROUTE ·{" "}
                      {Math.round(probe.ms)} ms
                    </>
                  ) : (
                    "SOURCE SEARCH ONLY"
                  )}
                </span>
              </div>
              <div className="mf-messages">
                {!shown.length ? (
                  <div className="mf-chat-welcome">
                    <h2>
                      {tab === "ask" ? (
                        <>
                          Ask the code.
                          <br />
                          Follow the evidence.
                        </>
                      ) : (
                        <>
                          Your learning tools,
                          <br />
                          grounded in source.
                        </>
                      )}
                    </h2>
                    <p>
                      {tab === "ask"
                        ? "Ask about a route, a component or a function. We search the saved code and read the parts that best match your question."
                        : "Choose a file and a tool above. Explanations, analogies, architecture and interview prep keep source references attached."}
                    </p>
                    {tab === "ask" && (
                      <StarterPrompts
                        project={project}
                        selected={selected}
                        onPick={(prompt) => setQuery(prompt)}
                        onAsk={ask}
                      />
                    )}
                    <div className="mf-chat-disclaimer">
                      We search the saved files, then use the closest matches to answer. Open “Files included” to see what was left out.
                    </div>
                  </div>
                ) : (
                  shown.map((m) => (
                    <div
                      key={m.id}
                      className={`mf-message ${m.role} ${m.failed ? "failed" : ""}`}
                    >
                      <div className="mf-message-label">
                        {m.role === "user"
                          ? "YOU"
                          : m.failed
                            ? "SOURCE SEARCH / LIMIT"
                            : "MINDFLOW"}
                        {m.role === "assistant" && m.provisional && (
                          <span>{m.text ? "draft · streaming" : "searching source"}</span>
                        )}
                        {m.role === "assistant" && !m.provisional && m.stopped && (
                          <span>stopped</span>
                        )}
                      </div>
                      {m.role === "assistant" && !m.text && !m.failed && (
                        <RetrievalStages status={status} sources={m.sources} />
                      )}
                      {m.role === "assistant" && m.graph && <button disabled={busy} className={`mf-view-map ${graphId === m.id ? "active" : ""}`} onClick={() => { setNodes(m.graph.nodes); setEdges(m.graph.edges); setGraphId(m.id); setFitKey(k => k + 1); }}><GitBranch size={14} />{graphId === m.id ? "Viewing answer map" : "View answer map"}</button>}
                      {m.role === "assistant" && m.plan?.steps?.length ? (
                        <PlanSteps plan={m.plan} sources={m.sources || []} onSource={openSource} />
                      ) : null}
                      <Answer
                        text={
                          m.text ||
                          (m.plan
                            ? "Planning the steps from real source…"
                            : "Looking for the code behind your question...")
                        }
                        sources={m.sources || []}
                        onSource={openSource}
                        blueprint={m.plan?.steps ? m.plan : null}
                      />
                      {m.role === "assistant" &&
                        !m.provisional &&
                        !m.failed && (
                          <div className="mf-message-foot">
                            <ShieldCheck size={12} />
                            {m.searched} files searched · source IDs checked
                            {m.ttftMs != null && (
                              <span className="mf-timing">
                                first words {formatMs(m.ttftMs)}
                                {m.totalMs != null && m.totalMs > m.ttftMs
                                  ? ` · complete ${formatMs(m.totalMs)}`
                                  : ""}
                              </span>
                            )}
                          </div>
                        )}
                      {m.role === "assistant" &&
                        !m.provisional &&
                        !m.failed && <Speech text={m.text} />}
                    </div>
                  ))
                )}
                {busy && (
                  <div className="mf-status">
                    <Loader2 size={13} className="mf-spin" />
                    {status}
                  </div>
                )}
                <div ref={end} />
              </div>
              <div className="mf-composer-wrap">
                <form
                  className="mf-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                  }}
                >
                  <textarea
                    aria-label="Ask the repository"
                    placeholder="How does this feature work?"
                    value={query}
                    maxLength={1200}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        ask();
                      }
                    }}
                  />
                  {!query.trim() && !busy && selected && (
                    <button
                      className="mf-composer-ctx"
                      type="button"
                      onClick={() =>
                        setQuery(
                          `Explain what ${selected} is responsible for, and how the files it imports support that.`,
                        )
                      }
                      title={`Use ${selected} as the question context`}
                    >
                      <FileCode2 size={13} />
                      {selected.split("/").pop()}
                    </button>
                  )}
                  <button
                    aria-label={busy ? "Stop answer" : "Send question"}
                    type={busy ? "button" : "submit"}
                    disabled={!busy && !query.trim()}
                    onClick={
                      busy ? () => controller.current?.abort() : undefined
                    }
                  >
                    {busy ? (
                      <span className="mf-stop" />
                    ) : (
                      <ArrowUp size={18} />
                    )}
                  </button>
                </form>
                <p>
                  Answers can be wrong. Open the cited code.{" "}
                  <button onClick={() => setCoverage(true)}>
                    Files included
                  </button>
                </p>
              </div>
            </>
          )}
        </section>
      </div>
      {error && (
        <div className="mf-toast" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}
      {source && <SourceSheet source={source} close={() => setSource(null)} />}{" "}
      {coverage && (
        <Coverage project={project} close={() => setCoverage(false)} />
      )}
    </div>
  );
}
