# Repository importer patch

This directory contains the repository router, its regression tests, and the configuration/storage modules needed to run those tests, copied from the public [Mindflow backend source](https://huggingface.co/spaces/phineas8/mindflow-backend/tree/main). It is a patch workspace, not a complete replacement backend application. The frontend does not run this Python code.

The router removes the independent 500 KB per-file rejection. Supported files remain complete and use the existing overlapping, line-addressable retrieval windows. The 12 MB total indexed text budget, 25 MB compressed archive limit, 100 MB expanded archive limit, file count limit, exclusions, and credential filtering remain in place. Large repositories can still exceed these total limits.

## Apply to the hosted backend

Copy `app/routers/repository.py` and `tests/test_repository.py` into the corresponding paths in the existing Hugging Face Space source repository. Run the tests there, then deploy the updated Space. Do not replace the Space with this partial directory.

Until that deployment, the hosted importer still enforces its old 500 KB limit. No frontend change can remove that server-side rejection.

## Regression tests

From the frontend repository root, with Python dependencies available:

```sh
PYTHONPATH=backend python3 -m pytest -q backend/tests/test_repository.py
```

Tests cover exact preservation and retrieval at the end of a >500 KB TypeScript test file, total-budget rejections, citations, archive exclusions, and existing repository API behavior.
