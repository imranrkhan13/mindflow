import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Landing from './pages/Landing.jsx'
import Workspace from './pages/Workspace.jsx'
import { uploadDocument, importFromGithub, getSharedProject } from './lib/api.js'

const LOADING_SEQUENCES = {
  upload: [
    [0,    'Reading your file…'],
    [800,  'Finding all the sections…'],
    [1600, 'Spotting technical concepts…'],
    [2600, 'Drawing the connections…'],
    [3600, 'Almost there…'],
  ],
  github: [
    [0,    'Connecting to GitHub…'],
    [1000, 'Fetching README and docs…'],
    [2200, 'Parsing documentation…'],
    [3400, 'Building the knowledge graph…'],
    [4800, 'Almost there…'],
  ],
}

export default function App() {
  const [project, setProject]       = useState(null)
  const [loading, setLoading]       = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError]           = useState('')

  // Check for shared project in URL on mount
  // URLs like /share/:projectId load the project directly
  useEffect(() => {
    const path = window.location.pathname
    const match = path.match(/^\/share\/([a-f0-9-]+)$/)
    if (!match) return

    const projectId = match[1]
    setLoading(true)
    setLoadingMsg('Loading shared project…')

    getSharedProject(projectId)
      .then(p => { setProject(p); setLoading(false) })
      .catch(e => {
        setError(e.message)
        setLoading(false)
        // Clear the URL so the landing page shows normally
        window.history.replaceState({}, '', '/')
      })
  }, [])

  function _startLoading(type) {
    setError('')
    setLoading(true)
    const seq = LOADING_SEQUENCES[type] || LOADING_SEQUENCES.upload
    const timers = seq.map(([delay, msg]) =>
      setTimeout(() => setLoadingMsg(msg), delay)
    )
    return timers
  }

  async function handleFileReady(file) {
    const timers = _startLoading('upload')
    try {
      const result = await uploadDocument(file)
      setProject(result)
      // Push a clean URL so sharing works
      window.history.pushState({}, '', `/share/${result.project_id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      timers.forEach(clearTimeout)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  async function handleGithubImport(url) {
    const timers = _startLoading('github')
    try {
      const result = await importFromGithub(url)
      setProject(result)
      window.history.pushState({}, '', `/share/${result.project_id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      timers.forEach(clearTimeout)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  function handleReset() {
    setProject(null)
    setError('')
    window.history.pushState({}, '', '/')
  }

  if (project) {
    return <Workspace project={project} onReset={handleReset} />
  }

  return (
    <>
      <Landing
        onFileReady={handleFileReady}
        onGithubImport={handleGithubImport}
        error={error}
      />
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-paper/92 backdrop-blur-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay/10">
              <Loader2 className="h-6 w-6 animate-spin text-clay" />
            </div>
            <div className="text-center">
              <p className="font-sans text-sm font-semibold text-umber-900">{loadingMsg}</p>
              <p className="mt-1 font-sans text-xs text-umber-500">
                Turning documentation into an interactive map
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
