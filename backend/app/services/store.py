"""
SQLite-backed project store.

Replaces the previous in-memory dict. Projects now survive server
restarts — critical for HF Spaces which restarts on every push.

Schema:
  projects (id, filename, source_url, created_at, graph_json)
  sections (project_id, section_id, title, level, content,
            code_blocks_json, concepts_json, parent_id)

The Section dataclass is reconstructed from rows on read so the rest
of the codebase sees the same interface as before.
"""
import json
import os
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

# DB lives in /tmp on HF Spaces (only writable dir), locally in backend/
DB_PATH = os.environ.get("DB_PATH", os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "mindflow.db"
))


@dataclass
class Section:
    id: str
    title: str
    level: int
    content: str = ""
    code_blocks: list[str] = field(default_factory=list)
    concepts: set[str] = field(default_factory=set)
    parent_id: str | None = None


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    with _get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id          TEXT PRIMARY KEY,
            filename    TEXT NOT NULL,
            source_url  TEXT,
            created_at  TEXT NOT NULL,
            graph_json  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sections (
            project_id       TEXT NOT NULL,
            section_id       TEXT NOT NULL,
            title            TEXT NOT NULL,
            level            INTEGER NOT NULL,
            content          TEXT,
            code_blocks_json TEXT,
            concepts_json    TEXT,
            parent_id        TEXT,
            PRIMARY KEY (project_id, section_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sections_project
            ON sections(project_id);
        """)


_init_db()


def create_project(
    filename: str,
    sections: list[Section],
    graph: dict,
    source_url: str | None = None,
) -> str:
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO projects (id, filename, source_url, created_at, graph_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (project_id, filename, source_url, now, json.dumps(graph)),
        )
        conn.executemany(
            "INSERT INTO sections "
            "(project_id, section_id, title, level, content, "
            " code_blocks_json, concepts_json, parent_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    project_id,
                    s.id,
                    s.title,
                    s.level,
                    s.content,
                    json.dumps(s.code_blocks),
                    json.dumps(sorted(s.concepts)),
                    s.parent_id,
                )
                for s in sections
            ],
        )
    return project_id


def get_project(project_id: str) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not row:
            return None

        section_rows = conn.execute(
            "SELECT * FROM sections WHERE project_id = ?", (project_id,)
        ).fetchall()

    sections = {}
    for r in section_rows:
        s = Section(
            id=r["section_id"],
            title=r["title"],
            level=r["level"],
            content=r["content"] or "",
            code_blocks=json.loads(r["code_blocks_json"] or "[]"),
            concepts=set(json.loads(r["concepts_json"] or "[]")),
            parent_id=r["parent_id"],
        )
        sections[s.id] = s

    return {
        "id": row["id"],
        "filename": row["filename"],
        "source_url": row["source_url"],
        "created_at": row["created_at"],
        "sections": sections,
        "graph": json.loads(row["graph_json"]),
    }


def get_section(project_id: str, section_id: str) -> Section | None:
    with _get_conn() as conn:
        r = conn.execute(
            "SELECT * FROM sections WHERE project_id = ? AND section_id = ?",
            (project_id, section_id),
        ).fetchone()
    if not r:
        return None
    return Section(
        id=r["section_id"],
        title=r["title"],
        level=r["level"],
        content=r["content"] or "",
        code_blocks=json.loads(r["code_blocks_json"] or "[]"),
        concepts=set(json.loads(r["concepts_json"] or "[]")),
        parent_id=r["parent_id"],
    )


def list_recent_projects(limit: int = 20) -> list[dict]:
    """For the share/recent projects endpoint."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT id, filename, source_url, created_at FROM projects "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]
