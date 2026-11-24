# Repository importer patch

This directory contains the repository router, its regression tests, and the configuration/storage modules needed to run those tests, copied from the public [Mindflow backend source](https://huggingface.co/spaces/phineas8/mindflow-backend/tree/main). It is a patch workspace, not a complete replacement backend application. The frontend does not run this Python code.

The router removes the independent 500 KB per-file rejection and raises the old 25 MB compressed archive cap to 250 MB. Archive downloads spill to a temporary file after 4 MB, with a checked stream limit and automatic cleanup. Supported files remain complete and use the existing overlapping, line-addressable retrieval windows. The 192 MB total indexed text budget, 250 MB compressed archive limit, 1 GB expanded archive limit, 50,000 supported-file and 200,000 archive-entry limits, exclusions, and credential filtering remain in place. Large repositories can still exceed these total limits.

## Apply to the hosted backend

Copy `app/routers/repository.py` and `app/services/repository_docs.py`, plus `tests/test_repository.py` into the corresponding paths in the existing Hugging Face Space source repository. Run the tests there, then deploy the updated Space. Do not replace the Space with this partial directory.

Deployed to the live Space in commit `215469d8adbac5f8a852978cda8690a999287898`. Live verification imported `tailwindlabs/tailwindcss`: 520 supported files, 5,450,096 indexed bytes, 45 explicit exclusions, no truncation. The 845,421-byte `utilities.test.ts` was returned with all 31,840 lines.

## Regression tests

From the frontend repository root, with Python dependencies available:

```sh
PYTHONPATH=backend python3 -m pytest -q backend/tests/test_repository.py
```

Tests cover exact preservation and retrieval at the end of a >500 KB TypeScript test file, total-budget rejections, citations, archive exclusions, and existing repository API behavior.

## Large Next.js repositories and documentation

The expanded importer was measured against Next.js commit `794836c3cbb750d1e34f99e210b39b7bdfbc4c58`: 35,200 archive entries; 32,085 supported UTF-8 files; 111,976,444 indexed bytes; 3,115 explicit exclusions. No indexed text was truncated. Source documents and a ZIP containing every indexed file were generated successfully. Snapshots use lossless zlib compression with compatibility for old JSON rows.

`GET /api/repository/{id}/documentation` downloads Markdown. Add `?bundle=true` for the complete indexed-source ZIP with documentation, coverage and import graph. These exports require no model call. They inventory actual source; they do not infer runtime behavior.

Final live backend source commit: `9d4547f78f6aca71cf2fbd66ce77ddc20ff3ebb8`. Live Next.js snapshot `4b19c764-09c6-4fc9-80f5-b8327b51d7dd` returned HTTP 200 with the same complete supported-file coverage. The production frontend at https://mindflow-eight-green.vercel.app includes Docs and Source ZIP controls.

## Faster workspace loading

Deployed backend commit `8d0ccbc2628eeda815d6fa4971773da5f768e6ca` caches lightweight workspace summaries separately from compressed source. Reimporting the same pinned commit reuses its unexpired snapshot. Opening a saved project reads the summary without decompressing the full source, and sends a gzip-compressed response when supported. Summary responses include an import-edge count; actual answer graphs still carry detected edges. First imports still download and index the source. The regression suite has 40 tests.

## Answer latency patches

`repository.py` now keeps the cost of a follow-up question low instead of re-doing import work:

- A two-snapshot LRU holds decompressed snapshots, and a freshly imported snapshot is remembered immediately. Follow-up questions no longer decompress and re-parse the whole JSON each time.
- One retrieval index per snapshot (windows, term counts, path terms, declaration names, lengths) is reused, so `/ask` only scores instead of re-tokenising every indexed file.
- Import edges are grouped once per snapshot for retrieval, evidence graphs and build plans, removing repeated full-edge scans.
- The exact-identifier check (`Where is X implemented?`) narrows to candidate files through the token index instead of regex-scanning every file.
- Upstream model deltas are coalesced into ~80 ms / 400-character SSE chunks; a `[S1]` citation is still never split across chunks.
- The provider status check is cached for 60 seconds, and `/file` loads off the event loop.
- `POST /api/repository/build/ping` lets the frontend detect the blueprint route without a doomed request.

Tests: `test_chunk_windows_are_memoised_per_snapshot_files`, `test_source_id_split_across_deltas_is_never_cut`, `test_retrieval_reuses_windows_for_follow_up_questions`, `test_explicit_symbol_check_narrows_scan_without_false_missing`, `test_build_capability_probe_is_available`.

The frontend now coalesces streamed tokens into one paint per ~40 ms, scrolls on a short trailing timer instead of every delta, caches opened source files, and lazy-loads the React Flow graph so the landing page does not download it. Build questions try the documented `/{id}/build` route, then `/build/{id}`, then fall back to the normal Ask route on older backends instead of stopping with a 404.


The `/api/upload` (file) endpoint still exists in the Space; the frontend no longer calls it on the default route.

## Build blueprints (`POST /api/repository/{id}/build`)

"How do I build this feature?" is answered from a deterministic plan, not from the model's imagination. `build_intent()` turns the question into feature terms. `plan_steps()` ranks windows for those terms and orders the files by observed import edges (a file after the files it imports, cycles by rank). It drops docs, keeps 3–9 steps, trims each excerpt to whole real lines (≤650 bytes) and records: declarations, exact anchor lines, imports/used-by, route literal, human-readable wiring. The model only writes prose around that skeleton and is told to mark anything absent as "not in this snapshot". Snippets are numbered `S1…Sn` with `blob/<sha>#L` URLs so the UI can open the exact lines. `build_sections()` splits the answer into the fixed headings.

Refusals are honest: a non-build question gets "explicit build questions only"; fewer than 3 grounded steps gets a message naming how many files matched, with no invented outline. Tests: `test_build_intent_only_fires_for_build_questions`, `test_build_plan_orders_by_imports_and_skips_docs`, `test_build_excerpts_are_exact_whole_lines`, `test_build_refuses_when_the_feature_is_absent`, `test_build_sections_keep_the_requested_order`, plus two endpoint tests.
