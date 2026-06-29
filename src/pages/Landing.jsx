import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, ArrowRight, BookOpen, GraduationCap,
  Layers, Video, Github, Link, ExternalLink, Clock
} from 'lucide-react'
import AmbientGraph from '../components/AmbientGraph.jsx'
import { getRecentProjects } from '../lib/api.js'

const FEATURES = [
  { icon: BookOpen,      label: 'Plain-English explanations', desc: 'Simple + technical, side by side' },
  { icon: Layers,        label: 'Architecture map',           desc: 'Full system with data flow and risks' },
  { icon: GraduationCap, label: 'Interview prep',             desc: '60-second pitch + tiered questions' },
  { icon: Video,         label: 'Narrated video',             desc: 'AI voice + animated diagrams, MP4' },
]

const EXAMPLE_REPOS = [
  { label: 'FastAPI',      url: 'https://github.com/tiangolo/fastapi' },
  { label: 'React',        url: 'https://github.com/facebook/react' },
  { label: 'Next.js',      url: 'https://github.com/vercel/next.js' },
  { label: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss' },
]

export default function Landing({ onFileReady, onGithubImport, error }) {
  const inputRef = useRef(null)
  const [dragging, setDragging]     = useState(false)
  const [tab, setTab]               = useState('file')   // 'file' | 'github'
  const [githubUrl, setGithubUrl]   = useState('')
  const [githubError, setGithubError] = useState('')
  const [recent, setRecent]         = useState([])

  useEffect(() => {
    getRecentProjects()
      .then(r => setRecent(r.projects?.slice(0, 6) || []))
      .catch(() => {})
  }, [])

  function handleFiles(files) {
    const file = files?.[0]
    if (file) onFileReady(file)
  }

  function handleGithubSubmit() {
    const url = githubUrl.trim()
    if (!url) { setGithubError('Paste a GitHub repo URL'); return }
    if (!url.startsWith('https://github.com/')) {
      setGithubError('Must start with https://github.com/')
      return
    }
    setGithubError('')
    onGithubImport(url)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <AmbientGraph />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/30 via-paper/65 to-paper" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16">

        {/* Badge */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-2 rounded-full border border-umber-200 bg-white/80 px-4 py-1.5 font-sans text-xs font-medium text-umber-600 shadow-card backdrop-blur">
          🧠 Upload docs or import a GitHub repo — get a visual mental model instantly
        </motion.div>

        {/* Hero */}
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="max-w-2xl text-balance text-center font-sans text-4xl font-bold tracking-tight text-umber-900 sm:text-5xl lg:text-6xl">
          Understand any codebase{' '}
          <span className="text-clay">without the headache.</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 max-w-lg text-center font-sans text-base text-umber-600">
          Paste a GitHub URL or drop a markdown file. MindFlow maps it into an
          interactive graph with AI explanations, interview prep, and narrated videos.
        </motion.p>

        {/* Input card */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="mt-8 w-full max-w-lg">

          {/* Tab toggle */}
          <div className="mb-3 flex rounded-xl border border-umber-200 bg-white/80 p-1 shadow-card">
            {[
              { id: 'github', icon: Github, label: 'GitHub URL' },
              { id: 'file',   icon: Upload, label: 'Upload file' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-sans text-sm font-medium transition-all ${
                  tab === t.id
                    ? 'bg-umber-900 text-white shadow'
                    : 'text-umber-500 hover:text-umber-800'
                }`}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* GitHub tab */}
            {tab === 'github' && (
              <motion.div key="github"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-2xl border border-umber-200 bg-white/80 p-5 shadow-card backdrop-blur">
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border border-umber-200 bg-white px-3 py-2.5">
                    <Github className="h-4 w-4 shrink-0 text-umber-400" />
                    <input
                      value={githubUrl}
                      onChange={e => setGithubUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleGithubSubmit()}
                      placeholder="https://github.com/owner/repo"
                      className="w-full bg-transparent font-mono text-sm text-umber-900 placeholder:text-umber-400 focus:outline-none"
                    />
                  </div>
                  <button onClick={handleGithubSubmit}
                    className="rounded-xl bg-umber-900 px-4 py-2.5 font-sans text-sm font-semibold text-white hover:bg-umber-800 transition-colors">
                    Import
                  </button>
                </div>

                {githubError && (
                  <p className="mt-2 font-sans text-xs text-clay">{githubError}</p>
                )}

                {/* Example repos */}
                <div className="mt-3">
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-umber-400">
                    Try a popular repo
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_REPOS.map(r => (
                      <button key={r.label}
                        onClick={() => { setGithubUrl(r.url); }}
                        className="rounded-full border border-umber-200 bg-umber-100/50 px-3 py-1 font-sans text-xs text-umber-700 hover:border-clay hover:text-clay transition-colors">
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* File upload tab */}
            {tab === 'file' && (
              <motion.div key="file"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}>
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
                  onClick={() => inputRef.current?.click()}
                  className={`group cursor-pointer rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-all ${
                    dragging
                      ? 'border-clay bg-clay/5 scale-[1.01]'
                      : 'border-umber-200 bg-white/70 hover:border-clay/50 hover:bg-white/90 hover:shadow-card'
                  } backdrop-blur`}>
                  <input ref={inputRef} type="file" accept=".md,.markdown,.txt"
                    className="hidden" onChange={e => handleFiles(e.target.files)} />
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-umber-100 group-hover:bg-clay/10 transition-colors">
                    <Upload className="h-5 w-5 text-umber-400 group-hover:text-clay transition-colors" />
                  </div>
                  <p className="font-sans text-sm font-semibold text-umber-900">
                    Drop your README or docs file here
                  </p>
                  <p className="mt-1 font-sans text-xs text-umber-500">
                    or click to browse — .md .markdown .txt
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-3 rounded-xl border border-clay/25 bg-clay/5 px-4 py-2.5 font-sans text-xs text-clay-dim">
              {error}
            </div>
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 font-sans text-xs text-umber-400">
            No signup · Free forever · Share with a link
            <ArrowRight className="h-3 w-3" />
          </p>
        </motion.div>

        {/* Recent public projects */}
        {recent.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 w-full max-w-2xl">
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-umber-400">
              <Clock className="h-3.5 w-3.5" />
              Recently mapped
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {recent.map(p => (
                <a key={p.id} href={`/share/${p.id}`}
                  className="flex items-center gap-2 rounded-xl border border-umber-200 bg-white/70 px-3 py-2.5 transition-all hover:border-clay/40 hover:shadow-card group">
                  {p.source_url
                    ? <Github className="h-4 w-4 shrink-0 text-umber-400 group-hover:text-clay" />
                    : <Link   className="h-4 w-4 shrink-0 text-umber-400 group-hover:text-clay" />
                  }
                  <div className="min-w-0">
                    <p className="truncate font-sans text-xs font-semibold text-umber-900">
                      {p.filename.replace(' (GitHub)', '')}
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
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-10 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label}
              className="flex flex-col gap-2 rounded-2xl border border-umber-200 bg-white/70 p-4 backdrop-blur">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay/10">
                <Icon className="h-4 w-4 text-clay" />
              </div>
              <p className="font-sans text-xs font-semibold text-umber-900 leading-snug">{label}</p>
              <p className="font-sans text-[11px] text-umber-500 leading-snug">{desc}</p>
            </div>
          ))}
        </motion.div>

      </div>
    </div>
  )
}
