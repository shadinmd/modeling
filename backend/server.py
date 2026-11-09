"""
FastAPI Backend Server for Personal Assistant.
Direct native streaming proxy to LM Studio / Ollama with zero buffering or artificial chunking.
"""

import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import requests
import yaml

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from tools import AssistantTools
import database

app = FastAPI(title="Personal Assistant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tools = AssistantTools(workspace_root=BASE_DIR / "workspace", memory_dir=BASE_DIR / "memory")

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1")


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, Any]]] = []
    session_id: Optional[str] = None
    user_message_id: Optional[str] = None
    backend: Optional[str] = "lmstudio"
    model_id: Optional[str] = None


class SessionCreateRequest(BaseModel):
    title: Optional[str] = "New Conversation"


class SessionUpdateRequest(BaseModel):
    title: str


class FactRequest(BaseModel):
    fact: str


class FileSaveRequest(BaseModel):
    path: str
    content: str


@app.get("/api/sessions")
def list_chat_sessions():
    return {"sessions": database.list_sessions()}


@app.post("/api/sessions")
def create_chat_session(req: Optional[SessionCreateRequest] = None):
    title = req.title if req and req.title else "New Conversation"
    return database.create_session(title=title)


@app.get("/api/sessions/{session_id}")
def get_chat_session(session_id: str):
    sess = database.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@app.delete("/api/sessions/{session_id}")
def delete_chat_session(session_id: str):
    success = database.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success", "session_id": session_id}


@app.patch("/api/sessions/{session_id}")
def rename_chat_session(session_id: str, req: SessionUpdateRequest):
    success = database.update_session_title(session_id, req.title)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success", "session_id": session_id, "title": req.title}


@app.get("/api/health")
def health():
    return {"status": "ok", "url": LM_STUDIO_URL}


@app.get("/api/models")
def list_available_models():
    try:
        r = requests.get(f"{LM_STUDIO_URL}/models", timeout=3)
        if r.status_code == 200:
            data = r.json().get("data", [])
            # Exclude embedding models from chat completions
            models = [
                m.get("id")
                for m in data
                if m.get("id")
                and not any(k in m.get("id").lower() for k in ["embed", "nomic-embed", "bge-", "e5-"])
            ]
            return {"models": models, "connected": True}
    except Exception as e:
        print(f"[LM Studio Models Error] Failed to connect to {LM_STUDIO_URL}: {e}")
    return {"models": [], "connected": False}


@app.get("/api/memory")
def get_memory():
    profile_path = BASE_DIR / "memory" / "profile.yaml"
    if not profile_path.exists():
        return {}
    with open(profile_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@app.post("/api/memory/fact")
def add_fact(req: FactRequest):
    res = tools.add_quick_fact(req.fact)
    return {"status": "success", "result": res}


@app.get("/api/workspace/files")
def list_workspace_files():
    return {"files": tools.list_files()}


@app.get("/api/workspace/file")
def read_workspace_file(path: str):
    content = tools.read_file(path)
    if content.startswith("Error:"):
        raise HTTPException(status_code=404, detail=content)
    return {"path": path, "content": content}


@app.post("/api/workspace/file")
def save_workspace_file(req: FileSaveRequest):
    target = tools._resolve_safe_path(req.path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"status": "success", "path": req.path}


@app.delete("/api/workspace/file")
def delete_workspace_file(path: str):
    target = tools._resolve_safe_path(path)
    if target.exists() and target.is_file():
        target.unlink()
        return {"status": "success", "path": path}
    raise HTTPException(status_code=404, detail=f"File '{path}' not found")


def parse_all_tool_calls(text: str) -> List[tuple]:
    """
    Detect all tool calls in either XML format, custom tags, or python function calls.
    Handles apostrophes, single/double quotes, and code blocks.
    Returns list of (action, argument).
    """
    calls = []

    # 1. Tag format: <tool_call:action ...>
    tag_matches = re.finditer(
        r"<tool_call:([a-zA-Z_]+)(?:\s+[a-zA-Z_]+=(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+)))?\s*\/?>",
        text,
        re.DOTALL
    )
    for m in tag_matches:
        action = m.group(1).strip()
        val = (m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else m.group(4) or "").strip()
        calls.append((action, val))

    # 2. XML format: <function=...><parameter=...>...</parameter></function>
    xml_matches = re.finditer(
        r"<function=(?:tool_call:)?([a-zA-Z_]+)>\s*<parameter=[^>]+>\s*(.*?)\s*<\/parameter>",
        text,
        re.DOTALL
    )
    for m in xml_matches:
        action = m.group(1).strip()
        val = m.group(2).strip()
        calls.append((action, val))

    # 3. Python functional style: web_search("...") or read_file("...")
    func_matches = re.finditer(
        r"(?:tool_call:)?\b(web_search|search_web|read_file|fetch_webpage|fetch_url|browse_url|search_notes|search|add_fact|add_quick_fact)\(\s*(?:\"([^\"]*)\"|'([^']*)')\s*\)",
        text,
        re.DOTALL
    )
    for m in func_matches:
        action = m.group(1).strip()
        val = (m.group(2) if m.group(2) is not None else m.group(3) or "").strip()
        calls.append((action, val))

    # Normalize tool names and deduplicate
    normalized = []
    seen = set()
    for tool, val in calls:
        action = tool
        if action in ("search_web", "google_search"):
            action = "web_search"
        elif action in ("fetch_url", "browse_url", "read_url"):
            action = "fetch_webpage"
        elif action == "search":
            action = "search_notes"
        elif action == "add_quick_fact":
            action = "add_fact"

        key = (action, val)
        if key not in seen and val:
            seen.add(key)
            normalized.append((action, val))

    return normalized


def execute_tool(action: str, arg: str) -> str:
    """Execute the tool on disk/network and return content."""
    if action == "read_file":
        return tools.read_file(arg)
    elif action in ("search_notes", "search"):
        res = tools.search_notes(arg)
        return json.dumps(res, indent=2)
    elif action == "add_fact":
        return tools.add_quick_fact(arg)
    elif action in ("web_search", "search_web"):
        return tools.web_search(arg)
    elif action in ("fetch_webpage", "fetch_url", "browse_url"):
        return tools.fetch_webpage(arg)
    return f"Error: Unknown tool '{action}'"


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Agentic SSE stream: intercepts tool calls, executes real disk actions,
    and streams the final grounded answer. Persists conversation to SQLite.
    """
    if not req.model_id or not req.model_id.strip():
        raise HTTPException(
            status_code=400,
            detail="No model selected. Please select an available model from the header or load one in LM Studio before chatting."
        )

    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:12]}"

    # Save incoming user message in SQLite
    user_msg_id = req.user_message_id or f"user_{int(time.time() * 1000)}"
    try:
        database.save_message(
            session_id=session_id,
            role="user",
            content=req.message,
            message_id=user_msg_id,
        )
    except Exception as e:
        print(f"[DB Error] Failed to save user message: {e}")

    system_prompt = tools.get_system_context()
    messages = [{"role": "system", "content": system_prompt}]
    if req.history:
        messages.extend(req.history)
    # Ensure current user message is not duplicated if already present at the end of history
    if not (req.history and req.history[-1].get("role") == "user" and req.history[-1].get("content") == req.message):
        messages.append({"role": "user", "content": req.message})

    url = f"{LM_STUDIO_URL}/chat/completions"

    def stream_request(curr_messages):
        payload_data = {
            "model": req.model_id,
            "messages": curr_messages,
            "temperature": 0.3,
            "stream": True,
        }
        try:
            with requests.post(url, json=payload_data, stream=True, timeout=120) as resp:
                if resp.status_code != 200:
                    err_msg = resp.text[:300] if resp.text else f"Status code {resp.status_code}"
                    yield None, f"\n\n**Model Server Error ({resp.status_code}):** {err_msg}"
                    return
                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8").strip()
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta_obj = chunk["choices"][0]["delta"]
                        reasoning = (
                            delta_obj.get("reasoning_content")
                            or delta_obj.get("reasoning")
                            or delta_obj.get("thought")
                        )
                        content = delta_obj.get("content")
                        yield reasoning, content
                    except Exception:
                        continue
        except requests.exceptions.ConnectionError:
            yield None, f"\n\n**Connection Refused:** Unable to connect to local model server at `{LM_STUDIO_URL}`.\n\nVerify that LM Studio or Ollama is started with its local server listening on port 1234."
            return
        except requests.exceptions.Timeout:
            yield None, f"\n\n**Timeout Error:** Request to local model server at `{LM_STUDIO_URL}` timed out after 120 seconds."
            return
        except Exception as e:
            yield None, f"\n\n**Error:** An unexpected error occurred while communicating with model: {str(e)}"
            return

    def generate_agent_stream():
        start_time = time.time()
        token_count = 0

        first_pass_content = ""
        is_tool_call = False
        buffered_tokens = []
        has_decided_tool = False

        accumulated_thinking = ""
        accumulated_content = ""
        accumulated_tool_calls = []

        # --- Pass 1: Initial query to model ---
        for reasoning, content in stream_request(messages):
            if reasoning:
                token_count += 1
                accumulated_thinking += reasoning
                yield f"event: thought\ndata: {json.dumps({'text': reasoning})}\n\n"

            if content:
                token_count += 1
                first_pass_content += content

                if not has_decided_tool:
                    buffered_tokens.append(content)
                    combined = "".join(buffered_tokens)
                    # Check if a tool call XML tag is starting
                    if (
                        "<tool_call" in combined
                        or "<function" in combined
                        or "read_file(" in combined
                        or "web_search(" in combined
                        or "search_web(" in combined
                        or "fetch_webpage(" in combined
                        or "search_notes(" in combined
                    ):
                        is_tool_call = True
                        has_decided_tool = True
                        # Suppress tool call tags from client delta
                    elif len(combined) > 30:
                        # Confirmed normal response
                        has_decided_tool = True
                        is_tool_call = False
                        for tok in buffered_tokens:
                            accumulated_content += tok
                            yield f"event: delta\ndata: {json.dumps({'text': tok})}\n\n"
                        buffered_tokens = []
                else:
                    if not is_tool_call:
                        if "<tool_call" in content or "<function" in content:
                            is_tool_call = True
                        else:
                            accumulated_content += content
                            yield f"event: delta\ndata: {json.dumps({'text': content})}\n\n"

        # Flush buffered tokens if short response and not a tool call
        if not has_decided_tool:
            combined = "".join(buffered_tokens)
            tool_calls = parse_all_tool_calls(combined)
            if tool_calls:
                is_tool_call = True
            else:
                for tok in buffered_tokens:
                    accumulated_content += tok
                    yield f"event: delta\ndata: {json.dumps({'text': tok})}\n\n"

        # Check if first pass requested any tool execution(s)
        tool_calls = parse_all_tool_calls(first_pass_content)
        if tool_calls:
            # Clear pre-tool narration in client UI so only the grounded answer appears
            yield f"event: set_content\ndata: {json.dumps({'text': ''})}\n\n"

            combined_outputs = []
            for action, arg in tool_calls:
                tool_call_id = f"tc_{int(time.time() * 1000)}_{uuid.uuid4().hex[:4]}"

                # 1. Emit dedicated tool_start event
                yield f"event: tool_start\ndata: {json.dumps({'id': tool_call_id, 'tool': action, 'arg': arg, 'status': 'running'})}\n\n"

                # 2. Execute on disk or live web
                tool_output = execute_tool(action, arg)
                accumulated_tool_calls.append({
                    "id": tool_call_id,
                    "tool": action,
                    "arg": arg,
                    "status": "completed",
                    "output": tool_output,
                })

                # 3. Emit dedicated tool_done event with output
                yield f"event: tool_done\ndata: {json.dumps({'id': tool_call_id, 'tool': action, 'arg': arg, 'status': 'completed', 'output': tool_output})}\n\n"
                combined_outputs.append(f"### Perception Results for {action}('{arg}'):\n{tool_output}")

            # --- Pass 2: Feed all tool outputs back to model for grounded answer ---
            messages.append({"role": "assistant", "content": first_pass_content})
            messages.append({
                "role": "user",
                "content": f"[Perception Results]\n" + "\n\n".join(combined_outputs) + "\n\nNow synthesize a complete, comprehensive final answer based on these live results. Present the findings directly (with pricing, links, comparisons) without calling any tools."
            })

            # Clear accumulated content so only the final answer is persisted
            accumulated_content = ""

            for reasoning, content in stream_request(messages):
                if reasoning:
                    token_count += 1
                    accumulated_thinking += reasoning
                    yield f"event: thought\ndata: {json.dumps({'text': reasoning})}\n\n"
                if content:
                    token_count += 1
                    # Ensure no lingering tool tags in output
                    if "<tool_call" not in content and "</tool_call>" not in content:
                        accumulated_content += content
                        yield f"event: delta\ndata: {json.dumps({'text': content})}\n\n"

        elapsed = max(0.01, time.time() - start_time)
        speed = round(token_count / elapsed, 1)

        # Persist assistant turn to SQLite
        try:
            database.save_message(
                session_id=session_id,
                role="assistant",
                content=accumulated_content,
                thinking=accumulated_thinking if accumulated_thinking else None,
                tool_calls=accumulated_tool_calls if accumulated_tool_calls else None,
                metrics={"elapsed": round(elapsed, 2), "speed": speed, "model": req.model_id},
                model=req.model_id,
            )
        except Exception as e:
            print(f"[DB Error] Failed to save assistant message: {e}")

        yield f"event: done\ndata: {json.dumps({'elapsed_seconds': round(elapsed, 2), 'tok_per_sec': speed, 'session_id': session_id, 'model': req.model_id})}\n\n"

    return StreamingResponse(generate_agent_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
