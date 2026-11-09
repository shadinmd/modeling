"""
SQLite-backed persistent chat history for Personal Assistant.
Stores sessions, messages, thinking traces, tool calls, and performance metrics.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

DB_PATH = Path(__file__).resolve().parent / "memory" / "chat_history.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                tool_calls TEXT,
                metrics TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions (updated_at DESC)")

        # Ensure model column exists on messages for tracking which model generated each turn
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN model TEXT")
        except sqlite3.OperationalError:
            pass


# Run initialization on import
init_db()


def create_session(title: str = "New Conversation", session_id: Optional[str] = None) -> Dict[str, Any]:
    sid = session_id or f"sess_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (sid, title, now, now),
        )
    return {"id": sid, "title": title, "created_at": now, "updated_at": now}


def list_sessions() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT s.id, s.title, s.created_at, s.updated_at, COUNT(m.id) as message_count
            FROM sessions s
            LEFT JOIN messages m ON s.id = m.session_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
        """).fetchall()
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "message_count": r["message_count"],
            }
            for r in rows
        ]


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        s_row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s_row:
            return None

        m_rows = conn.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY rowid ASC",
            (session_id,),
        ).fetchall()

        messages = []
        for mr in m_rows:
            msg: Dict[str, Any] = {
                "id": mr["id"],
                "role": mr["role"],
                "content": mr["content"],
            }
            # Retrieve model name stored for this message
            row_keys = mr.keys()
            if "model" in row_keys and mr["model"]:
                msg["model"] = mr["model"]
            if mr["thinking"]:
                msg["thinking"] = mr["thinking"]
            if mr["tool_calls"]:
                try:
                    msg["toolCalls"] = json.loads(mr["tool_calls"])
                except Exception:
                    pass
            if mr["metrics"]:
                try:
                    msg["metrics"] = json.loads(mr["metrics"])
                    if "model" not in msg and "model" in msg["metrics"]:
                        msg["model"] = msg["metrics"]["model"]
                except Exception:
                    pass
            messages.append(msg)

        return {
            "id": s_row["id"],
            "title": s_row["title"],
            "created_at": s_row["created_at"],
            "updated_at": s_row["updated_at"],
            "messages": messages,
        }


def save_message(
    session_id: str,
    role: str,
    content: str,
    message_id: Optional[str] = None,
    thinking: Optional[str] = None,
    tool_calls: Optional[List[Dict[str, Any]]] = None,
    metrics: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> str:
    mid = message_id or f"msg_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    tool_calls_json = json.dumps(tool_calls) if tool_calls else None
    metrics_json = json.dumps(metrics) if metrics else None

    with get_connection() as conn:
        # Ensure session exists
        s_row = conn.execute("SELECT id, title FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s_row:
            auto_title = content[:40].strip() or "Conversation"
            conn.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, auto_title, now, now),
            )
        else:
            # If title is generic "New Conversation" and user sends first message, update title
            if role == "user" and s_row["title"] in ("New Conversation", "New Chat", "Conversation"):
                auto_title = content[:40].strip()
                conn.execute(
                    "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                    (auto_title, now, session_id),
                )
            else:
                conn.execute(
                    "UPDATE sessions SET updated_at = ? WHERE id = ?",
                    (now, session_id),
                )

        conn.execute(
            """
            INSERT OR REPLACE INTO messages (id, session_id, role, content, thinking, tool_calls, metrics, model, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (mid, session_id, role, content, thinking, tool_calls_json, metrics_json, model, now),
        )

    return mid


def update_session_title(session_id: str, title: str) -> bool:
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, session_id),
        )
        return cur.rowcount > 0


def delete_session(session_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cur.rowcount > 0
