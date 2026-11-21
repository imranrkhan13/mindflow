# Mindflow: how the application works

## The easy version

Mindflow helps you understand a project without opening every file yourself. Paste a GitHub link, ask a question, and it finds useful code. Its answer includes links so you can check the original files. The map shows which files were found and how some of them connect.

A big project takes longer the first time because the server must download and read it. After that, Mindflow keeps a saved copy. If the project has not changed, importing it again reuses that copy. Opening a saved project loads a small file list first, rather than reading all its source again. The server compresses that list before sending it to your browser.

The app does not read every file into the AI at once. It searches the saved code and gives the AI the parts that best match your question. Answers can still be wrong, so use the file links to check.

The design uses off-white backgrounds, brown text and warm brown highlights. Bricolage Grotesque is the main font; source code uses a fixed-width font so it stays easy to read.

Mindflow helps developers explore a public GitHub repository through source-linked answers, file browsing, graphs, explanations, interview preparation, narration, and video. It also has a separate document-upload workspace.

The main idea is straightforward: import a pinned copy of the source, search its supported files for each question, send relevant excerpts to a language model, and keep the original code available beside the answer.

## Using Mindflow

1. Open [Mindflow](https://mindflow-eight-green.vercel.app).
2. Paste a public GitHub repository root URL, such as `https://github.com/owner/repository`.
3. Wait for the backend to import the default branch at a specific commit.
4. Ask a question about a feature, function, route, or file. Start with a specific question for better evidence retrieval.
5. Open answer citations to inspect the original code and line numbers.
6. Use the graph to explore retrieved files and detected import connections.
7. Use Explain, Architecture, Interview, or Video for the corresponding learning tools.
8. Open Coverage to inspect indexed and excluded files. Download Docs or Source ZIP if you want an offline export.

Uploading a document opens a different workspace. That workspace explains the uploaded material; it cannot inspect repository source that was never imported.

## Application architecture

```text
Browser: React + Vite frontend on Vercel
    |
    | HTTPS API requests
    v
FastAPI backend on Hugging Face Spaces
    |-- GitHub: public repository metadata and pinned ZIP archive
    |-- SQLite: compressed repository snapshots and project data
    |-- Source retrieval: lexical ranking and exact line references
    |-- OpenRouter: fixed free-model route for generated answers
    |-- Kokoro: neural speech on the backend CPU
    |-- Video renderer: animated source walkthroughs
    `-- Official LTX demo: optional illustrative AI visual clips
```

The frontend and backend are separate deployments. Pushing changes to the frontend GitHub repository does not automatically update the Hugging Face backend. A backend-only bug must be fixed and deployed there.

## Repository import, step by step

### Pin the source

The backend accepts public GitHub root URLs. It resolves the default branch to a commit SHA and downloads that exact commit’s archive. This makes file references reproducible: an answer points to the snapshot it searched, even if the repository changes later.

The importer does not execute repository code. It does not attach a GitHub token to public-repository imports, follow submodules, read Git history, or continuously watch for new commits.

### Download and inspect

The archive download is streamed. Small downloads remain in a memory buffer; after 4 MB the temporary archive spills to disk on the backend server. A hard byte limit still applies. Temporary archive storage is closed after processing.

The importer checks archive paths and inventories entries. Supported UTF-8 source, tests, configuration, and documentation are retained in full. Large files are not reduced to their first 500 KB.

Generated directories, dependencies, lockfiles, assets, potential credential files, binary content, non-UTF-8 files, and symbolic links are excluded with reasons. These exclusions appear in Coverage and exported documentation. “All indexed source” does not mean every byte in the original repository.

### Store a compressed snapshot

A snapshot contains file text, file metadata, exclusions, commit information, and detected import edges. Its JSON is compressed with zlib before SQLite storage. Older uncompressed snapshot rows remain readable.

Compression saves storage; it does not summarize or remove source. The backend must decompress the snapshot when reading it, so large snapshots still consume memory and processing time.

The cache is disposable, bounded to 20 projects and seven days, and can be lost during a backend rebuild. An expired snapshot needs a fresh import.

### Current capacity

| Resource | Limit |
| --- | ---: |
| Compressed archive download | 250 MB |
| Declared expanded archive size | 1 GB |
| Archive entries inspected | 200,000 |
| Supported indexed files | 50,000 |
| Total indexed text | 192 MB |

These are bounded operating limits, not a promise to import any repository. Exceeding a limit rejects the import rather than presenting a partial snapshot as complete.

Archive parsing and snapshot compression run outside the API event loop. The browser initially renders 100 matching files and lets the user load more; this changes display rendering, not search coverage.

## How answers are produced

### Search the supported source

For each question, the backend divides indexed source into overlapping, line-addressable windows. Windows normally contain up to 60 lines and approximately 6,500 characters, with overlap to preserve nearby context. Oversized individual lines remain in the source file, even when they cannot fit a model excerpt.

Retrieval uses identifier-aware lexical matching and relevance ranking. Function declarations and explicitly named file paths receive additional weight. This is not an embedding/vector database, a compiler, or a complete semantic understanding of the application.

The frontend adds a bounded excerpt of recent completed messages to help follow-up questions. That context is session-local and subject to the question-length budget. It is not durable conversation memory.

### Generate from evidence

The model receives the question and selected source excerpts, rather than every repository file in one prompt. The selected context is bounded to roughly 38,000 source characters and at most 16 excerpts.

The backend uses the fixed `openrouter/free` route and checks its advertised input/output prices before generation. It has no paid fallback. Provider capacity, availability, and quotas can prevent an answer even when source search works.

Instructions require the model to cite supplied source IDs, distinguish inference from observed code, and acknowledge missing evidence. Citation IDs are validated after generation. Valid IDs do not prove that every generated claim is correct; the cited code remains the evidence to inspect.

If no matching evidence is retrieved, Mindflow says so. If generation fails or citations are invalid, the frontend shows the failure rather than treating the draft as a complete answer.

### Stream the result

The ask endpoint uses server-sent events for status, sources, graph nodes and edges, answer text, and completion or errors. Search runs outside the API event loop, helping other backend requests remain responsive while a large snapshot is searched.

## What the graph means

Each answer retains its own graph in the browser session. The user can reopen that answer’s map.

- The question node connects to retrieved source evidence.
- File-to-file edges represent statically detected imports.
- File nodes open the actual indexed source.

Python imports use AST parsing. JS/TS imports use static pattern matching, with limited configured alias handling. Dynamic behavior, unsupported languages, and unresolved imports can be missing.

An import connection does not establish a runtime call chain or execution order. A question-to-file link means that file was retrieved as evidence; it does not establish that every statement in the answer is proven by that file.

## Learning tools

| Tool | Behavior |
| --- | --- |
| Ask | Search repository source and generate a cited answer. |
| Explain | Explain a chosen file using source evidence; related files may be retrieved. |
| Analogy | Give a beginner-friendly comparison while separating it from actual implementation. |
| Questions | Produce practice questions and source-grounded answers. |
| Mistakes | Discuss observed handling and distinguish hypothetical risks. |
| Architecture | Explain visible imports, boundaries, and structure without inventing runtime behavior. |
| Interview | Generate a project pitch and interview preparation from available source. |
| Video | Generate an animated source walkthrough or an illustrative AI clip. |

Text tools reuse the repository question/search pipeline. Choosing a starting file helps focus retrieval; it does not put every related file into the model context automatically.

## Narration

Kokoro generates speech on the backend CPU. The browser prepares answer text by removing display-only Markdown, citation IDs, raw URLs, and fenced code blocks from the spoken script. Code blocks are replaced with an explicit omission notice.

Answer audio and voice samples receive gentle dynamics compression and peak normalization in the browser. Empty or silent recordings are rejected. The result can be played or downloaded as PCM WAV.

Listening pace controls preserve pitch where supported by the browser. They change playback speed; they do not regenerate the voice or change a downloaded video’s audio track.

These improvements balance audio levels. They do not upgrade the speech model, correct every pronunciation, or guarantee studio-quality narration. The server-rendered MP4 narration does not use the browser’s audio-mastering step.

## Video generation

### Animated source walkthrough

The backend prepares a source-based script, generates Kokoro narration, renders animated diagrams, and assembles a downloadable MP4. The frontend starts a job and polls its stage and progress. Shared CPU work can take several minutes.

The frontend’s preview-speed control changes playback only. Video resolution, frame generation, script generation, and the exported narration mix are backend responsibilities.

### AI visual clip

The optional AI clip mode submits a visual prompt to the official public Lightricks LTX distilled demo. The current integration is designed for a short, silent, illustrative clip rather than a source-code explanation with narrated proof.

The visual prompt is sent to that service. Repository and account tokens are not attached. The public demo has shared queues and quotas; availability is not guaranteed. Generated visuals do not demonstrate how repository code actually runs.

Generated media is temporary and should be downloaded if needed.

## Documentation and source exports

The Docs button downloads source-derived Markdown containing:

- Pinned commit and coverage.
- Languages and directory counts.
- Package manifest descriptions, scripts, dependencies, and versions.
- Complete indexed Markdown/text documentation.
- A source-linked inventory of every indexed file.
- Detected static import connections.
- Every explicit exclusion and its reason.

The Source ZIP contains `DOCUMENTATION.md`, `coverage.json`, `import-graph.json`, and all indexed files under `source/`. It does not include excluded files, Git history, or submodule contents.

These exports require no model call. They inventory source and preserve documentation; they are not a verified account of every runtime behavior. Large downloads can take several minutes.

## Important source files

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Repository workspace, question streaming, citations, answer graphs, source inspection, and narration UI. |
| `src/pages/Landing.jsx` | Original landing page and import/upload entry controls. |
| `src/LegacyApp.jsx` | Document-oriented workspace routing and loading. |
| `src/pages/Workspace.jsx` | Document concept graph and learning panels. |
| `src/lib/apiConfig.js` | Backend origin normalization and API error messages. |
| `src/lib/api.js` | Shared document, learning, chat, and video API calls. |
| `src/lib/narration.js` | Spoken-text cleanup, audio mastering, WAV encoding, and voice requests. |
| `src/components/VideoPanel.jsx` | Video jobs, voice samples, progress, preview, and downloads. |
| `src/components/NarrationPlayer.jsx` | Audio playback, listening pace, and WAV downloads. |
| `src/repository.css` | Repository workspace styles and brown/off-white surfaces. |
| `src/index.css` | Global styles and Bricolage Grotesque UI font. |
| `tailwind.config.js` | Shared colors, typography, and design tokens. |
| `backend/app/routers/repository.py` | Repository imports, compressed snapshots, search, graphs, streaming answers, and export routes. |
| `backend/app/services/repository_docs.py` | Deterministic documentation and ZIP export generation. |
| `backend/tests/test_repository.py` | Import, retrieval, citation, compression, and export regression tests. |

The local `backend/` directory is a patch/test workspace copied from the hosted backend. It is not the complete FastAPI service. Other hosted components, including the main application and full media implementation, live in the Hugging Face Space repository.

## Main repository API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/repository/import` | Import a public repository snapshot. |
| GET | `/api/repository/status` | Check answer-provider readiness. |
| GET | `/api/repository/{id}` | Read snapshot metadata and file inventory. |
| GET | `/api/repository/{id}/file?path=...` | Read an exact indexed file. |
| POST | `/api/repository/{id}/search` | Retrieve evidence without generating an answer. |
| POST | `/api/repository/{id}/ask` | Stream sources, graph information, and an answer. |
| GET | `/api/repository/{id}/documentation` | Download repository documentation. |
| GET | `/api/repository/{id}/documentation?bundle=true` | Download indexed source and documentation ZIP. |

Legacy document and media routes use separate namespaces such as `/api/upload`, `/api/explain`, `/api/chat`, `/api/voice`, and `/api/video`.

## Running and deploying Mindflow

### Frontend development

```sh
npm install
npm run dev
```

Vite normally serves port 5173, choosing a different port when occupied. It proxies `/api` to the hosted backend by default.

| Setting | Purpose |
| --- | --- |
| `VITE_API_URL` | Override the backend application origin; rebuild the frontend after changing it. |
| `API_PROXY_TARGET` | Override the local Vite API proxy, for example `http://127.0.0.1:8000`. |

The default backend origin is `https://phineas8-mindflow-backend.hf.space`. API URLs are public configuration, not credentials. Provider keys belong on the backend, never in browser bundles.

### Verification

```sh
npm run build
PYTHONPATH=backend python3 -m pytest -q backend/tests/test_repository.py
```

Backend test dependencies must be available in the Python environment. The current repository regression suite has 40 tests covering source preservation, large trees, capacity enforcement, citations, retrieval, compressed/legacy snapshots, and exports.

### Deployment boundaries

The React build is deployed to the existing Vercel project. Backend changes must be committed to the existing Hugging Face Space and allowed to rebuild. Deploying this partial local `backend/` folder as the entire Space would omit required components.

Before replacing a hosted backend file, compare its latest version to the local patch to preserve concurrent changes. After deployment, verify a real import and inspect its coverage rather than relying only on a successful build.

## Troubleshooting

| Symptom | Meaning and next action |
| --- | --- |
| Old 500 KB, 25 MB, or 20,000-entry rejection | An old backend deployment is serving the request. Check the configured origin and deployed backend commit. |
| Current capacity rejection | The repository exceeds one of the bounded limits; compression does not reduce the supported-file count or decompressed source size. |
| 404 on a saved project | The snapshot may have expired or been lost during a rebuild. Import the repository again. |
| 404 on an API route | Check the frontend backend origin; API requests must reach FastAPI rather than the static frontend host. |
| Source search works but AI fails | Inspect provider readiness, shared quotas, and citation errors. No paid fallback is used. |
| Answer misses relevant behavior | Name the function or file, ask a narrower question, and inspect source; lexical retrieval can miss evidence. |
| Voice/video generation takes a long time | CPU processing and public generation queues are shared. Inspect the job error or stage. |
| Large export download is slow | Wait for the transfer; avoid downloading source bundles unless you need a local copy. |

## Verified large-repository example

The live importer successfully processed Next.js commit `794836c3cbb750d1e34f99e210b39b7bdfbc4c58`: 35,200 archive entries, 32,085 supported files, 111,976,444 indexed source bytes, and 3,115 explicit exclusions. Coverage reported no truncation.

That was an import/export validation, not proof of every Next.js feature or of model-answer accuracy. Temporary Next.js archives and exports downloaded to the developer’s Mac were subsequently removed to recover disk space.
