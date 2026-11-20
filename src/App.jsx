import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, Handle, Position, ReactFlowProvider, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { ArrowUp, ArrowUpRight, ChevronLeft, Code2, FileCode2, GitBranch, Github, Layers3, Loader2, Search, ShieldCheck, X, Check, AlertTriangle } from 'lucide-react'
import LegacyApp from './LegacyApp.jsx'
import './repository.css'

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/repository` : '/api/repository'
async function api(path, options) {
  const r = await fetch(BASE + path, options)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${r.status}). Please try again.`)
  return data
}
const post = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

function Logo() { return <span className="mf-logo"><span className="mf-mark"><GitBranch size={19}/></span> mindflow<span className="mf-version">/ code</span></span> }
function Answer({text, sources, onSource}) {
  return <div className="mf-answer">{text.split(/(\[S\d+\])/g).map((part, i) => {
    const s = sources.find(s => `[${s.id}]` === part)
    return s ? <button key={i} className="mf-citation" onClick={() => onSource(s.path, s.start, s.end)} title={`${s.path}:${s.start}-${s.end}`}>{s.id}<ArrowUpRight size={10}/></button> : <span key={i}>{part}</span>
  })}</div>
}
function SourceNode({data}) { return <div className={`mf-node ${data.active ? 'active' : ''}`}><Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/><div className="mf-node-top"><FileCode2 size={15}/><span>{data.label}</span><span className="mf-node-dot"/></div><div className="mf-node-path">{data.path}</div><div className="mf-node-foot">{data.citations.join(' · ')}<span>view source ↗</span></div></div> }
const nodeTypes = { source: SourceNode }
function Diagram({nodes, edges, onSource, active, fitKey}) {
  const { fitView } = useReactFlow()
  useEffect(() => {const id = setTimeout(() => fitView({padding:.2,duration:350}), 70);return () => clearTimeout(id)},[nodes.length, fitKey,fitView])
  useEffect(()=>{let timer;const resize=()=>{clearTimeout(timer);timer=setTimeout(()=>fitView({padding:.2,duration:200}),150)};window.addEventListener('resize',resize);return()=>{clearTimeout(timer);window.removeEventListener('resize',resize)}},[fitView])
  const rendered = useMemo(() => {
    // A compact reading-order layout, not a claim about runtime sequence.
    const columns=Math.max(1,Math.ceil(nodes.length/4)), rows=Math.ceil(nodes.length/columns)
    return nodes.map((n,i) => ({id:n.id,type:'source',position:{x:Math.floor(i/rows)*310,y:(i%rows)*145},data:{...n,active:active===n.path}}))
  },[nodes,edges,active])
  return <ReactFlow nodes={rendered} edges={edges.map(e=>({...e,animated:true,label:`imports · L${e.line}`,style:{stroke:'#b07a57',strokeWidth:1.6},labelStyle:{fill:'#745b47',fontSize:10},labelBgStyle:{fill:'#fbf8f1'}}))} onNodeClick={(_,n)=>onSource(n.data.path)} nodeTypes={nodeTypes} fitView minZoom={.25} maxZoom={1.6} proOptions={{hideAttribution:true}} nodesDraggable><Background gap={22} size={1} color="#d9d5cb"/><Controls showInteractive={false}/></ReactFlow>
}
function SourceSheet({source,close}) {
  const target=useRef(null)
  useEffect(()=>{target.current?.scrollIntoView({block:'center'})},[source.path,source.start])
  return <div className="mf-overlay" onClick={close}><section className="mf-source-sheet" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Source code"><div className="mf-sheet-header"><div><span className="mf-eyebrow">EXACT CODE · PINNED COMMIT</span><h3>{source.path}</h3></div><button onClick={close} aria-label="Close source"><X size={20}/></button></div><div className="mf-source-meta"><span>{source.sha.slice(0,8)} · {source.lines} lines</span><a href={source.url} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={14}/></a></div><div className="mf-code">{source.text.split('\n').map((line,i)=><div key={i} ref={i+1===source.start?target:null} className={i+1>=source.start&&i+1<=(source.end||source.start)?'highlight':''}><span>{i+1}</span><code>{line||' '}</code></div>)}</div></section></div>
}
function Coverage({project,close}) { return <div className="mf-overlay" onClick={close}><section className="mf-coverage-sheet" role="dialog" aria-modal="true" aria-label="Repository coverage" onClick={e=>e.stopPropagation()}><div className="mf-sheet-header"><div><span className="mf-eyebrow">NOT A README SUMMARY</span><h3>What Mindflow actually read.</h3></div><button onClick={close} aria-label="Close coverage"><X/></button></div><div className="mf-metrics"><div><strong>{project.coverage.archive_entries}</strong><span>archive files</span></div><div><strong>{project.coverage.indexed_files}</strong><span>indexed in full</span></div><div><strong>{project.coverage.omitted_files}</strong><span>explicitly excluded</span></div></div><p>{project.coverage.scope}</p><p>No supported text file was shortened. The whole repository is searched for each question; only the most relevant excerpts go to the model. Large imports are rejected instead of silently truncated. Cache is disposable and expires after seven days.</p><div className="mf-coverage-list"><h4>Excluded files</h4>{project.omitted.length ? project.omitted.map(f=><div key={f.path}><code>{f.path}</code><span>{f.reason}</span></div>) : <p>None. Every archive file was indexed.</p>}</div><p className="mf-fine">Snapshot: {project.sha}. Does not watch new commits. Python/JS/TS imports are mapped statically; unresolved imports and other languages may not appear as connections. This is not a runtime trace.</p></section></div> }

export default function App() {
  if (window.location.pathname.startsWith('/docs') || window.location.pathname.startsWith('/share/')) return <LegacyApp/>
  return <RepositoryApp/>
}
function RepositoryApp() {
  const [project,setProject]=useState(null),[url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[messages,setMessages]=useState([]),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[nodes,setNodes]=useState([]),[edges,setEdges]=useState([]),[graphInfo,setGraphInfo]=useState(''),[sources,setSources]=useState([]),[source,setSource]=useState(null),[coverage,setCoverage]=useState(false),[active,setActive]=useState(''),[provider,setProvider]=useState(null),[fitKey,setFitKey]=useState(0)
  const end=useRef(null),controller=useRef(null)
  useEffect(()=>()=>controller.current?.abort(),[])
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,status])
  useEffect(()=>{api('/status').then(setProvider).catch(()=>setProvider({ready:false,reason:'Provider status unavailable'})); const m=window.location.pathname.match(/^\/repo\/([a-f0-9-]{36})$/);if(m){setLoading(true);api('/'+m[1]).then(setProject).catch(e=>setError(e.message)).finally(()=>setLoading(false))}},[])
  async function importRepo(value) {
    if(loading) return
    setError('');setLoading(true)
    try { const p=await api('/import',post({url:value||url}));setProject(p);setMessages([]);setNodes([]);setEdges([]);setSources([]);window.history.replaceState({},'',`/repo/${p.id}`) } catch(e){setError(e.message)} finally{setLoading(false)}
  }
  async function openSource(path,start=1,endLine=0) {
    if(!project)return
    try { const file=await api(`/${project.id}/file?path=${encodeURIComponent(path)}`);setActive(path);setSource({...file,start,end:endLine||start,sha:project.sha,url:`${project.url}/blob/${project.sha}/${path.split('/').map(encodeURIComponent).join('/')}#L${start}${endLine?`-L${endLine}`:''}`}) } catch(e){setError(e.message)}
  }
  async function ask(value) {
    const question=(value||query).trim();if(!question||busy)return
    setQuery('');setBusy(true);setError('');setNodes([]);setEdges([]);setSources([]);setGraphInfo('');setStatus('Finding code evidence...')
    const id=Date.now();setMessages(prev=>[...prev,{role:'user',text:question,id:id-1},{role:'assistant',text:'',sources:[],id,provisional:true}])
    const update=patch=>setMessages(prev=>prev.map(m=>m.id===id?{...m,...(typeof patch==='function'?patch(m):patch)}:m))
    controller.current=new AbortController()
    let completed=false
    try {
      const response=await fetch(`${BASE}/${project.id}/ask`,{...post({question}),signal:controller.current.signal})
      if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.detail||`Request failed (${response.status})`)}
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';let currentSources=[]
      while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});let split
        while((split=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,split);buffer=buffer.slice(split+2);const type=packet.match(/^event: (.+)$/m)?.[1];const raw=packet.match(/^data: (.+)$/m)?.[1];if(!raw)continue;const data=JSON.parse(raw)
          if(type==='status')setStatus(data.text)
          if(type==='sources'){currentSources=data.sources;setSources(data.sources);update({sources:data.sources,searched:data.searched_files})}
          if(type==='node')setNodes(prev=>[...prev,data])
          if(type==='edge')setEdges(prev=>[...prev,data])
          if(type==='graph_info')setGraphInfo(data.text)
          if(type==='answer')update(m=>({text:m.text+data.text}))
          if(type==='error'||type==='invalid'){update({text:data.text,failed:true,provisional:false});completed=true}
          if(type==='done'){update({provisional:false,provider:data.provider});setStatus('Source references checked');completed=true}
        }
        if(done)break
      }
      if(!completed)throw new Error('The answer stream ended early. Ask again; the incomplete draft was hidden.')
    } catch(e){update({text:e.name==='AbortError'?'Answer stopped. The source map is still available.':e.message,failed:true,provisional:false})} finally{setBusy(false);setStatus('');setFitKey(k=>k+1)}
  }
  function reset(){controller.current?.abort();setBusy(false);setProject(null);setMessages([]);setError('');window.history.replaceState({},'','/')}
  if(!project) return <div className="mf-app"><header className="mf-header"><Logo/><div className="mf-header-links"><a href="/docs">Documentation mode</a><a href="https://github.com/imranrkhan13/mindflow" target="_blank" rel="noreferrer"><Github size={16}/> Source</a></div></header><main className="mf-landing"><div className="mf-hero-meta"><span className="mf-live-dot"/> PUBLIC REPOSITORIES · REAL CODE · SOURCE REFERENCES</div><h1>The answer is<br/>in your <em>code.</em></h1><p className="mf-hero-copy">Ask your whole repository a question.<br/>Follow the answer back to the files, lines and connections behind it.</p><form className="mf-import-form" onSubmit={e=>{e.preventDefault();importRepo()}}><Github size={21}/><input aria-label="Public GitHub repository URL" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://github.com/owner/repository" required/><button disabled={loading}>{loading?<Loader2 size={18} className="mf-spin"/>:<>Explore repo <ArrowUpRight size={17}/></>}</button></form>{error&&<div className="mf-error" role="alert"><AlertTriangle size={16}/>{error}</div>}<div className="mf-example">No repo in mind? <button disabled={loading} onClick={()=>importRepo('https://github.com/imranrkhan13/mindflow')}>Let Mindflow explain itself <ArrowUpRight size={13}/></button></div>{loading&&<div className="mf-loading"><Loader2 size={16} className="mf-spin"/>Pinning a commit, reading the repository archive and indexing supported source files. Large repos can take a moment.</div>}<section className="mf-hero-bottom"><div><Code2 size={20}/><h3>Source, not summaries.</h3><p>Source, tests and config, not eight markdown files. See exactly what was indexed and what was excluded.</p></div><div><Layers3 size={20}/><h3>Connections you can open.</h3><p>An import map built from actual code. Click a node, inspect the lines, check the answer for yourself.</p></div><div><ShieldCheck size={20}/><h3>Evidence before confidence.</h3><p>Commit-pinned citations. Missing evidence stays missing. Free models only, no paid fallback.</p></div></section><footer>Public repos only · No code execution · No live commit watching · Free models have shared limits</footer></main></div>
  return <div className="mf-app mf-workspace"><header className="mf-header"><div className="mf-header-left"><button onClick={reset} className="mf-back" aria-label="Choose another repository"><ChevronLeft size={18}/></button><Logo/><span className="mf-header-sep"/><span className="mf-repo-name">{project.repository}</span></div><div className="mf-header-links"><a href={`${project.url}/tree/${project.sha}`} target="_blank" rel="noreferrer"><GitBranch size={13}/>{project.sha.slice(0,8)}</a><button className="mf-coverage-btn" onClick={()=>setCoverage(true)}><Check size={14}/>{project.coverage.indexed_files} files indexed</button></div></header><div className="mf-work-grid"><aside className="mf-files"><div className="mf-panel-label">REPOSITORY <span>{project.files.length}</span></div><label className="mf-file-search"><Search size={14}/><input aria-label="Filter indexed files" placeholder="Find a file..." value={filter} onChange={e=>setFilter(e.target.value)}/></label><div className="mf-file-list">{project.files.filter(f=>f.path.toLowerCase().includes(filter.toLowerCase())).map(f=><button key={f.path} className={active===f.path?'selected':''} onClick={()=>openSource(f.path)} title={f.path}><FileCode2 size={13}/><span>{f.path}</span></button>)}</div><button className="mf-coverage-footer" onClick={()=>setCoverage(true)}><ShieldCheck size={15}/><span>Coverage & exclusions<small>{project.coverage.omitted_files} files excluded · no silent truncation</small></span><ArrowUpRight size={13}/></button></aside><section className="mf-canvas"><div className="mf-canvas-title"><div><span className="mf-eyebrow">CODE CONNECTIONS</span><h2>{nodes.length?'Follow the evidence.':'Your code, connected.'}</h2></div><span className="mf-map-badge">STATIC IMPORT MAP</span></div>{nodes.length?<ReactFlowProvider><Diagram nodes={nodes} edges={edges} onSource={openSource} active={active} fitKey={fitKey}/></ReactFlowProvider>:<div className="mf-canvas-empty"><div className="mf-empty-symbol"><GitBranch size={42}/></div><h3>Start with a question.</h3><p>Relevant source files appear here.<br/>Connections are drawn only when an import<br/>can be traced to a real line of code.</p><span>{project.edges.length} import connections found in this snapshot</span></div>}<div className="mf-canvas-note"><span className={busy?'mf-live-dot':'mf-muted-dot'}/>{busy?'Searching code / streaming evidence':nodes.length?`${nodes.length} source files · ${edges.length} verified imports`:'Ready to explore'}<button onClick={()=>setFitKey(k=>k+1)}>Fit map</button></div>{nodes.length>0&&<div className="mf-map-limit">Import relationships, not a runtime trace. Click any file to inspect its code.</div>}</section><section className="mf-chat"><div className="mf-chat-heading"><span className="mf-eyebrow">ASK THE REPOSITORY</span><span className="mf-provider">FREE ROUTE</span></div><div className="mf-messages">{!messages.length?<div className="mf-chat-welcome"><h2>Skip the guessing.<br/>Read the code.</h2><p>Ask about a route, a component or a function. Each question searches every indexed file and retrieves the most relevant code.</p>{['How does importing a GitHub repository work?','Where are API requests made and how are errors handled?','What does the chat implementation actually do?'].map(q=><button key={q} onClick={()=>ask(q)}>{q}<ArrowUpRight size={15}/></button>)}<div className="mf-chat-disclaimer">Each question is a new code search. Name the function or feature in follow-ups. The model sees retrieved excerpts, not the entire repo in one prompt.</div></div>:messages.map(m=><div key={m.id} className={`mf-message ${m.role} ${m.failed?'failed':''}`}><div className="mf-message-label">{m.role==='user'?'YOU':m.failed?'SOURCE SEARCH / LIMIT':'MINDFLOW'}{m.role==='assistant'&&m.provisional&&<span>draft · streaming</span>}</div><Answer text={m.text||'Looking for the code behind your question...'} sources={m.sources||[]} onSource={openSource}/>{m.role==='assistant'&&!m.provisional&&!m.failed&&<div className="mf-message-foot"><ShieldCheck size={12}/>{m.searched} files searched · source IDs checked</div>}</div>)}{busy&&<div className="mf-status"><Loader2 size={13} className="mf-spin"/>{status}</div>}<div ref={end}/></div><div className="mf-composer-wrap"><form className="mf-composer" onSubmit={e=>{e.preventDefault();ask()}}><textarea aria-label="Ask the repository" placeholder="How does this feature work?" value={query} maxLength={1200} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}}/><button aria-label={busy?'Stop answer':'Send question'} type={busy?'button':'submit'} disabled={!busy&&!query.trim()} onClick={busy?()=>controller.current?.abort():undefined}>{busy?<span className="mf-stop"/>:<ArrowUp size={18}/>}</button></form><p>Answers can be wrong. Open the cited code. <button onClick={()=>setCoverage(true)}>View coverage</button></p></div></section></div>{error&&<div className="mf-toast" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}{source&&<SourceSheet source={source} close={()=>setSource(null)}/>} {coverage&&<Coverage project={project} close={()=>setCoverage(false)}/>}</div>
  }
