import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers,
  Video,
  Github,
  Link,
  ExternalLink,
  Clock,
  Loader2,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import AmbientGraph from "../components/AmbientGraph.jsx";
import { getRecentProjects } from "../lib/api.js";
import { validateRepoUrl, repoSlug } from "../lib/repoUrl.js";

const FEATURES = [
  {
    icon: BookOpen,
    label: "Plain-English explanations",
    desc: "Simple + technical, side by side",
  },
  {
    icon: Layers,
    label: "Architecture map",
    desc: "Code-linked imports and boundaries",
  },
  {
    icon: GraduationCap,
    label: "Interview prep",
    desc: "60-second pitch + tiered questions",
  },
  {
    icon: Video,
    label: "Narrated video",
    desc: "Local neural voice + animated MP4",
  },
];

const EXAMPLE_REPOS = [
  { label: "Flask", url: "https://github.com/pallets/flask" },
  { label: "Vite", url: "https://github.com/vitejs/vite" },
  { label: "React", url: "https://github.com/facebook/react" },
  { label: "Next.js", url: "https://github.com/vercel/next.js" },
  { label: "Tailwind CSS", url: "https://github.com/tailwindlabs/tailwindcss" },
];

/* What the importer actually does once a repository is accepted. Shown before
   the first question so the reader knows what the soon-to-be-asked answer is
   built from. */
const REPO_CHECKLIST = [
  ["Read", "Every supported UTF-8 source, test, config and docs file at one pinned commit."],
  ["Trace", "Python and JS/TS imports, line by line, so answers can show real connections."],
  ["Skip", "Dependencies, build output, lockfiles, binaries and credential files — listed readably."],
  ["Answer", "Only the closest excerpts go to the free model, and every claim carries a source ID."],
];

const PREVIEW_LINES = [
  { kind: "q", text: "How does importing a GitHub repository work?" },
  { kind: "close", text: "I look for the function that actually handles the import." },
  { kind: "code", text: "async function importRepo(value) { … }", cite: "S1" },
  { kind: "code", text: "fetch('/api/repository/import', { url })", cite: "S2" },
  { kind: "note", text: "Two files · import traced at lines 1 and 2" },
];

/* ── Typewriter used by the preview (self-contained, no backend call) ─────── */
function useTypedPreview(active) {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (!active) return;
    setLine(0);
    setChars(0);
  }, [active]);

  useEffect(() => {
    if (!active || line >= PREVIEW_LINES.length) return;
    const text = PREVIEW_LINES[line].text;
    if (chars < text.length) {
      const id = setTimeout(() => setChars((c) => c + 2), 16);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      setLine((l) => l + 1);
      setChars(0);
    }, 420);
    return () => clearTimeout(id);
  }, [active, line, chars]);

  return { line, chars };
}

function AnswerPreview({ active }) {
  const { line, chars } = useTypedPreview(active);
  return (
    <div className="mt-3 rounded-xl border border-umber-200 bg-white/70 p-3 font-mono text-[11px] leading-relaxed">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-wider text-umber-400">
        Example answer · no repository needed
      </p>
      {PREVIEW_LINES.map((row, i) => {
        if (i > line) return null;
        const typed = i === line ? row.text.slice(0, chars) : row.text;
        const done = i < line || chars >= row.text.length;
        return (
          <div
            key={row.text}
            className={`flex gap-2 rounded px-1.5 py-1 ${
              row.kind === "q"
                ? "bg-umber-100/70 text-umber-900"
                : "text-umber-600"
            }`}
          >
            <span className="w-3 shrink-0 text-umber-300">
              {row.kind === "q" ? "›" : row.kind === "note" ? "·" : "↳"}
            </span>
            <span className="min-w-0 break-words">
              {typed}
              {!done && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-clay align-middle" />}
            </span>
            {row.cite && done && (
              <span className="ml-auto shrink-0 rounded border border-clay/30 bg-clay/10 px-1 text-[9px] text-clay">
                {row.cite}
              </span>
            )}
          </div>
        );
      })}
      {line >= PREVIEW_LINES.length ? (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-sage">
          <Check className="h-3 w-3" /> Citations checked against the pinned commit
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-umber-400">
          <Loader2 className="h-3 w-3 animate-spin" /> streaming from source evidence
        </p>
      )}
    </div>
  );
}

export default function Landing({ onGithubImport, error, loading = false }) {
  const [githubUrl, setGithubUrl] = useState("");
  const [githubError, setGithubError] = useState("");
  const [recent, setRecent] = useState([]);
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => {
    getRecentProjects()
      .then((r) => setRecent(r.projects?.slice(0, 6) || []))
      .catch(() => {});
  }, []);

  const slug = useMemo(() => repoSlug(githubUrl), [githubUrl]);
  const validation = githubUrl ? validateRepoUrl(githubUrl) : "";
  const ready = Boolean(slug) && !validation;

  function handleGithubSubmit(e) {
    e?.preventDefault?.();
    if (loading) return;
    const problem = validateRepoUrl(githubUrl);
    if (problem) {
      setGithubError(problem);
      return;
    }
    setGithubError("");
    onGithubImport(githubUrl.trim());
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <AmbientGraph />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/30 via-paper/65 to-paper" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-2 rounded-full border border-umber-200 bg-white/80 px-4 py-1.5 font-sans text-xs font-medium text-umber-600 shadow-card backdrop-blur"
        >
          🧠 Import a public GitHub repo — explore source, explanations and
          videos
        </motion.div>

        {/* Hero */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="max-w-2xl text-balance text-center font-sans text-4xl font-bold tracking-tight text-umber-900 sm:text-5xl lg:text-6xl"
        >
          Understand any codebase{" "}
          <span className="text-clay">without the headache.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 max-w-lg text-center font-sans text-base text-umber-600"
        >
          Paste a public GitHub URL. MindFlow maps the whole repository into an
          interactive source map with code-cited answers, explanations,
          interview prep, and narrated videos.
        </motion.p>

        {/* Input card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="mt-8 w-full max-w-lg"
        >
          <form
            onSubmit={handleGithubSubmit}
            className="rounded-2xl border border-umber-200 bg-white/80 p-5 shadow-card backdrop-blur"
          >
            <label
              htmlFor="repo-url"
              className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-umber-400"
            >
              Public repository URL
            </label>
            <div className="flex gap-2">
              <div
                className={`flex flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2.5 transition-colors ${
                  githubError
                    ? "border-clay/60"
                    : ready
                      ? "border-sage/60"
                      : "border-umber-200"
                }`}
              >
                <Github className="h-4 w-4 shrink-0 text-umber-400" />
                <input
                  id="repo-url"
                  value={githubUrl}
                  onChange={(e) => {
                    setGithubUrl(e.target.value);
                    if (githubError) setGithubError("");
                  }}
                  placeholder="https://github.com/owner/repo"
                  aria-invalid={Boolean(githubError)}
                  aria-describedby="repo-url-help"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={loading}
                  className="w-full bg-transparent font-mono text-sm text-umber-900 placeholder:text-umber-400 focus:outline-none disabled:opacity-60"
                />
                {ready && <Check className="h-4 w-4 shrink-0 text-sage" />}
              </div>
              <button
                type="submit"
                disabled={loading || !ready}
                className="flex items-center gap-2 rounded-xl bg-umber-900 px-4 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-umber-800 disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading
                  </>
                ) : (
                  "Import"
                )}
              </button>
            </div>

            <p
              id="repo-url-help"
              className={`mt-2 flex min-h-[16px] items-start gap-1.5 font-sans text-xs ${
                githubError || validation ? "text-clay" : "text-umber-500"
              }`}
            >
              {githubError || validation ? (
                <>
                  <X className="mt-0.5 h-3 w-3 shrink-0" />
                  {githubError || validation}
                </>
              ) : slug ? (
                <>
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-sage" />
                  <span className="text-umber-600">
                    Ready to read <span className="font-mono">{slug}</span> at its
                    default branch's latest commit
                  </span>
                </>
              ) : (
                "Public repos only · repository root link · no uploads"
              )}
            </p>

            {/* Example repos */}
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-umber-400">
                Try a popular repo
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_REPOS.map((r) => {
                  const selected = r.url === githubUrl.trim();
                  return (
                    <button
                      key={r.label}
                      type="button"
                      disabled={loading}
                      aria-pressed={selected}
                      onClick={() => {
                        setGithubUrl(r.url);
                        setGithubError("");
                      }}
                      className={`rounded-full border px-3 py-1 font-sans text-xs transition-colors ${
                        selected
                          ? "border-clay bg-clay/10 text-clay"
                          : "border-umber-200 bg-umber-100/50 text-umber-700 hover:border-clay hover:text-clay"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expandable: what happens before you ask a question */}
            <button
              type="button"
              onClick={() => setShowChecklist((v) => !v)}
              aria-expanded={showChecklist}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-umber-200 bg-umber-100/40 px-3 py-2 text-left font-sans text-xs font-medium text-umber-700 hover:border-clay/40 hover:text-umber-900"
            >
              <span>What MindFlow reads before you ask anything</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showChecklist ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence initial={false}>
              {showChecklist && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {REPO_CHECKLIST.map(([verb, detail], i) => (
                    <motion.li
                      key={verb}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="mt-1.5 flex gap-2.5 rounded-lg border border-umber-200 bg-white/80 px-3 py-2"
                    >
                      <span className="mt-0.5 flex h-5 shrink-0 items-center rounded bg-clay/10 px-1.5 font-mono text-[9px] uppercase text-clay">
                        {verb}
                      </span>
                      <span className="font-sans text-[11px] leading-relaxed text-umber-600">
                        {detail}
                      </span>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </form>

          {error && (
            <div className="mt-3 rounded-xl border border-clay/25 bg-clay/5 px-4 py-2.5 font-sans text-xs text-clay-dim">
              {error}
            </div>
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 font-sans text-xs text-umber-400">
            Public repos · Free, shared quotas · No paid fallback
            <ArrowRight className="h-3 w-3" />
          </p>
        </motion.div>

        {/* Live preview of the answer shape */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-lg"
        >
          <AnswerPreview active={!loading} />
        </motion.div>

        <p className="mt-5 max-w-lg text-center text-[11px] leading-relaxed text-umber-500">
          Repository imports index all supported source at a pinned commit.
          Answers can make mistakes. Snapshots expire after 7 days or a backend
          rebuild. Choose narrated source diagrams or experimental AI visual
          clips in the Video tab.
        </p>
        {/* Recent public projects */}
        {recent.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 w-full max-w-2xl"
          >
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-umber-400">
              <Clock className="h-3.5 w-3.5" />
              Recently mapped
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {recent.map((p) => (
                <a
                  key={p.id}
                  href={`/share/${p.id}`}
                  className="flex items-center gap-2 rounded-xl border border-umber-200 bg-white/70 px-3 py-2.5 transition-all hover:border-clay/40 hover:shadow-card group"
                >
                  {p.source_url ? (
                    <Github className="h-4 w-4 shrink-0 text-umber-400 group-hover:text-clay" />
                  ) : (
                    <Link className="h-4 w-4 shrink-0 text-umber-400 group-hover:text-clay" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-sans text-xs font-semibold text-umber-900">
                      {p.filename.replace(" (GitHub)", "")}
                    </p>
                    <p className="font-mono text-[10px] text-umber-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-umber-300 group-hover:text-clay" />
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-10 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-2xl border border-umber-200 bg-white/70 p-4 backdrop-blur"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay/10">
                <Icon className="h-4 w-4 text-clay" />
              </div>
              <p className="font-sans text-xs font-semibold text-umber-900 leading-snug">
                {label}
              </p>
              <p className="font-sans text-[11px] text-umber-500 leading-snug">
                {desc}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
