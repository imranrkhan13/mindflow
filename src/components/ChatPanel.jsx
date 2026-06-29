import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, MessageSquare, Sparkles, User, Bot } from 'lucide-react'
import { sendChatMessage, getChatSuggestions } from '../lib/api.js'
import { renderMarkdown } from '../lib/renderMarkdown.js'

const PROSE_CSS = `
  .chat-prose .md-h1,.chat-prose .md-h2{font-size:.85rem;font-weight:700;color:#3d2b1f;margin:.6rem 0 .2rem}
  .chat-prose .md-h3{font-size:.82rem;font-weight:600;color:#4d3829;margin:.4rem 0 .15rem}
  .chat-prose .md-p{font-size:.82rem;line-height:1.7;color:#4d3829;margin:0 0 .35rem}
  .chat-prose .md-ul,.chat-prose .md-ol{padding-left:1.1rem;margin:.15rem 0 .35rem}
  .chat-prose li{font-size:.82rem;line-height:1.65;color:#4d3829;margin-bottom:.15rem}
  .chat-prose .inline-code{font-family:'JetBrains Mono',monospace;font-size:.73rem;background:#ede2cd;color:#3d2b1f;border-radius:4px;padding:.1em .3em}
  .chat-prose strong{font-weight:600;color:#3d2b1f}
`

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        isUser ? 'bg-umber-900' : 'bg-clay/15'
      }`}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-white" />
          : <Bot  className="h-3.5 w-3.5 text-clay" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
        isUser
          ? 'rounded-tr-sm bg-umber-900 text-white'
          : 'rounded-tl-sm border border-umber-200 bg-white'
      }`}>
        {isUser ? (
          <p className="font-sans text-sm leading-relaxed">{msg.content}</p>
        ) : (
          <>
            <style>{PROSE_CSS}</style>
            <div
              className="chat-prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
            {msg.provider && (
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-umber-400">
                {msg.provider}
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

export default function ChatPanel({ projectId, selectedNode }) {
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Load suggestions when panel opens or selected node changes
  useEffect(() => {
    if (!projectId) return
    getChatSuggestions(projectId, selectedNode?.id)
      .then(r => setSuggestions(r.suggestions || []))
      .catch(() => {})
  }, [projectId, selectedNode?.id])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const content = (text || input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    try {
      const result = await sendChatMessage(
        projectId,
        newMessages,
        selectedNode?.id || null,
      )
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.text, provider: result.provider },
      ])
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I couldn't get an answer: ${e.message}`,
          provider: null,
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-umber-200 bg-umber-100/30 px-5 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-clay" />
          <h2 className="font-sans text-base font-bold text-umber-900">Ask anything</h2>
        </div>
        <p className="mt-0.5 font-sans text-xs text-umber-500">
          {selectedNode
            ? `Asking about: ${selectedNode.data.title}`
            : 'Ask about the whole project or select a node first'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          /* Empty state with suggestions */
          <div className="flex h-full flex-col justify-center gap-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-clay/10">
                <Sparkles className="h-5 w-5 text-clay" />
              </div>
              <p className="font-sans text-sm font-semibold text-umber-900">
                Ask me anything about this codebase
              </p>
              <p className="mt-1 font-sans text-xs text-umber-500">
                I know everything that's in the uploaded documentation.
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-col gap-2">
              {suggestions.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => send(s)}
                  className="rounded-xl border border-umber-200 bg-white px-3.5 py-2.5 text-left font-sans text-xs text-umber-700 transition-all hover:border-clay/40 hover:bg-clay/5 hover:text-umber-900"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          /* Message thread */
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <Message key={i} msg={msg} />
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2.5"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay/15">
                  <Bot className="h-3.5 w-3.5 text-clay" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-umber-200 bg-white px-3.5 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-clay" />
                  <span className="font-mono text-xs text-umber-400">thinking…</span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-umber-200 bg-white/80 p-3">
        {/* Quick re-suggestions when conversation is active */}
        {!isEmpty && suggestions.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {suggestions.slice(0, 3).map((s, i) => (
              <button key={i} onClick={() => send(s)}
                className="shrink-0 rounded-full border border-umber-200 bg-white px-2.5 py-1 font-sans text-[11px] text-umber-600 hover:border-clay/40 hover:text-clay transition-colors">
                {s.length > 40 ? s.slice(0, 40) + '…' : s}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={selectedNode
              ? `Ask about ${selectedNode.data.title}…`
              : 'Ask about this codebase…'
            }
            disabled={loading}
            className="flex-1 rounded-xl border border-umber-200 bg-white px-3.5 py-2.5 font-sans text-sm text-umber-900 placeholder:text-umber-400 focus:border-clay focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-umber-900 text-white transition-all hover:bg-umber-800 disabled:opacity-40"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </div>
        <p className="mt-1.5 text-center font-mono text-[10px] text-umber-400">
          Enter to send · answers grounded in your uploaded docs
        </p>
      </div>
    </div>
  )
}
