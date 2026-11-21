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
