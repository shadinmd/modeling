"""
Tools for real-time file system inspection, searching, web perception, and memory updates.
"""

import html
import json
import os
import re
import urllib.parse
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests
import yaml


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.result = []
        self.ignore_tags = {'script', 'style', 'head', 'noscript', 'svg', 'canvas'}
        self.current_ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self.ignore_tags:
            self.current_ignore += 1
        elif tag.lower() in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'):
            self.result.append('\n')

    def handle_endtag(self, tag):
        if tag.lower() in self.ignore_tags:
            self.current_ignore = max(0, self.current_ignore - 1)
        elif tag.lower() in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'):
            self.result.append('\n')

    def handle_data(self, data):
        if self.current_ignore == 0:
            cleaned = data.strip()
            if cleaned:
                self.result.append(data)

    def get_text(self) -> str:
        full_text = ''.join(self.result)
        lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in full_text.splitlines()]
        cleaned_lines = [line for line in lines if line]
        return '\n'.join(cleaned_lines)


class AssistantTools:
    """Provides safe, sandboxed file operations, web perception, and dynamic memory updates."""

    def __init__(self, workspace_root: Optional[Path] = None, memory_dir: Optional[Path] = None):
        self.base_dir = Path(__file__).resolve().parent
        self.workspace_root = workspace_root or (self.base_dir / "workspace")
        self.memory_dir = memory_dir or (self.base_dir / "memory")

        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.profile_path = self.memory_dir / "profile.yaml"

    def _resolve_safe_path(self, relative_path: str) -> Path:
        """Ensure file access stays inside workspace or memory for safety."""
        target = (self.workspace_root / relative_path).resolve()
        # Allow reading files in workspace or memory
        if not (str(target).startswith(str(self.workspace_root.resolve())) or 
                str(target).startswith(str(self.memory_dir.resolve()))):
            raise PermissionError(f"Access denied: path '{relative_path}' is outside designated workspace.")
        return target

    def list_files(self, sub_dir: str = "") -> List[str]:
        """List files available in the personal notes and documents workspace."""
        target = self._resolve_safe_path(sub_dir)
        if not target.exists() or not target.is_dir():
            return []
        
        rel_files = []
        for root, _, files in os.walk(target):
            for f in files:
                if f.startswith(".") or f.endswith((".pyc", ".lock")):
                    continue
                full_path = Path(root) / f
                rel_files.append(str(full_path.relative_to(self.workspace_root)))
        return sorted(rel_files)

    def read_file(self, relative_path: str, max_lines: int = 500) -> str:
        """Read the real-time contents of a note or file from disk."""
        target = self._resolve_safe_path(relative_path)
        if not target.exists():
            return f"Error: File '{relative_path}' does not exist."
        if not target.is_file():
            return f"Error: '{relative_path}' is a directory, not a file."

        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()[:max_lines]
                content = "".join(lines)
            return content
        except Exception as e:
            return f"Error reading file '{relative_path}': {e}"

    def search_notes(self, query: str) -> List[Dict[str, Any]]:
        """Fast keyword/pattern search across all personal markdown and text files."""
        query_re = re.compile(re.escape(query), re.IGNORECASE)
        results = []

        for rel_file in self.list_files():
            file_path = self.workspace_root / rel_file
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    for line_num, line in enumerate(f, 1):
                        if query_re.search(line):
                            results.append({
                                "file": rel_file,
                                "line": line_num,
                                "text": line.strip()
                            })
                            if len(results) >= 15:
                                return results
            except Exception:
                continue

        return results

    def web_search(self, query: str, max_results: int = 5) -> str:
        """Search the public web using privacy-respecting search and return ranked results with links."""
        clean_query = query.strip()
        if not clean_query:
            return "Error: Empty search query."

        # 1. Try DuckDuckGo HTML search
        try:
            url = "https://html.duckduckgo.com/html/"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": "https://html.duckduckgo.com/",
            }
            resp = requests.post(url, data={"q": clean_query}, headers=headers, timeout=10)
            if resp.status_code == 200:
                results = []
                pattern = re.compile(
                    r'<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)<\/a>.*?'
                    r'(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet2>.*?)<\/div>)',
                    re.DOTALL | re.IGNORECASE
                )
                for m in pattern.finditer(resp.text):
                    raw_href = m.group("href")
                    actual_url = raw_href
                    if "uddg=" in raw_href:
                        uddg_match = re.search(r"uddg=([^&]+)", raw_href)
                        if uddg_match:
                            actual_url = urllib.parse.unquote(uddg_match.group(1))
                    elif raw_href.startswith("//"):
                        actual_url = "https:" + raw_href

                    title = re.sub(r"<[^>]+>", "", m.group("title")).strip()
                    title = html.unescape(title)

                    snippet_raw = m.group("snippet") or m.group("snippet2") or ""
                    snippet = re.sub(r"<[^>]+>", "", snippet_raw).strip()
                    snippet = html.unescape(snippet)

                    if title and actual_url:
                        results.append(f"{len(results) + 1}. [{title}]({actual_url})\n   {snippet}")
                        if len(results) >= max_results:
                            break

                if results:
                    return f"Web search results for '{clean_query}':\n\n" + "\n\n".join(results)
        except Exception as e:
            print(f"[Tools] DuckDuckGo HTML search error: {e}")

        # 2. Resilient Fallback to DuckDuckGo Instant Answer API
        try:
            api_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(clean_query)}&format=json&no_html=1&skip_disambig=1"
            r = requests.get(api_url, timeout=6)
            if r.status_code == 200:
                data = r.json()
                out = []
                abstract = data.get("AbstractText")
                source_url = data.get("AbstractURL")
                heading = data.get("Heading")
                if abstract:
                    out.append(f"1. [{heading or clean_query}]({source_url or 'https://duckduckgo.com/?q=' + urllib.parse.quote(clean_query)})\n   {abstract}")

                related = data.get("RelatedTopics", [])
                for item in related:
                    if isinstance(item, dict) and "Text" in item and "FirstURL" in item:
                        out.append(f"{len(out) + 1}. [{item.get('Text')[:60]}...]({item.get('FirstURL')})\n   {item.get('Text')}")
                        if len(out) >= max_results:
                            break
                if out:
                    return f"Web search results for '{clean_query}':\n\n" + "\n\n".join(out)
        except Exception as e:
            print(f"[Tools] DuckDuckGo API search error: {e}")

        return f"No search results found for '{clean_query}'."

    def fetch_webpage(self, url: str, max_chars: int = 5000) -> str:
        """Fetch live web page content and strip scripts/styling into readable plain text."""
        clean_url = url.strip()
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = "https://" + clean_url

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            resp = requests.get(clean_url, headers=headers, timeout=12)
            resp.raise_for_status()

            content_type = resp.headers.get("Content-Type", "")
            if "text/plain" in content_type or "application/json" in content_type or "text/markdown" in content_type:
                text = resp.text[:max_chars]
                return f"Page content from {clean_url}:\n\n{text}"

            parser = _TextExtractor()
            parser.feed(resp.text)
            cleaned_text = parser.get_text()

            if not cleaned_text:
                return f"Notice: No readable text found on '{clean_url}'."

            if len(cleaned_text) > max_chars:
                cleaned_text = cleaned_text[:max_chars] + "\n\n... [content truncated for brevity]"

            return f"Page content from {clean_url}:\n\n{cleaned_text}"
        except Exception as e:
            return f"Error fetching webpage '{clean_url}': {str(e)}"

    def add_quick_fact(self, fact: str) -> str:
        """Persist a new personal fact or preference directly into memory/profile.yaml."""
        if not self.profile_path.exists():
            data = {"quick_facts": []}
        else:
            with open(self.profile_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}

        quick_facts = data.get("quick_facts", [])
        if fact not in quick_facts:
            quick_facts.append(fact)
            data["quick_facts"] = quick_facts
            with open(self.profile_path, "w", encoding="utf-8") as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            return f"Success: Fact remembered ('{fact}')"
        return "Fact already known in profile."

    def get_system_context(self) -> str:
        """Compile living personal profile, current timestamp, and available documents into context."""
        profile_content = ""
        if self.profile_path.exists():
            with open(self.profile_path, "r", encoding="utf-8") as f:
                profile_content = f.read()

        files_list = self.list_files()
        files_str = "\n".join([f"- {f}" for f in files_list]) if files_list else "(No notes added yet)"

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        prompt = f"""You are Shadin's private on-device AI assistant, running locally 24/7 on Apple Silicon.
Current Local Time: {now}

=== YOUR LIVING USER PROFILE & PREFERENCES ===
{profile_content}

=== AVAILABLE KNOWLEDGE FILES IN YOUR WORKSPACE ===
{files_str}

=== AGENT CAPABILITIES & TOOLS ===
1. You have real-time access to workspace notes, disk documents, and live web perception tools.
2. Read a personal note or file from disk:
   <tool_call:read_file path="notes/overview.md">
3. Keyword search workspace notes:
   <tool_call:search_notes query="keyword">
4. Live web search for fresh news, documentation, shopping prices, or public facts:
   <tool_call:web_search query="latest python release">
5. Read live webpage contents from a URL:
   <tool_call:fetch_webpage url="https://example.com">
6. Remember a new fact or preference in persistent memory:
   <tool_call:add_fact fact="User prefers TypeScript for all React projects.">

=== CRITICAL AGENTIC EXECUTION RULES ===
- NEVER announce or narrate what you are going to search (do NOT say "I will search Flipkart...", "Executing searches...", or "Results will come in shortly").
- Immediately emit the <tool_call:...> tag so the system can run it right away.
- You may invoke multiple tool calls simultaneously (e.g. several <tool_call:web_search ...> tags) if needed.
- Always answer with the user's preferred tone: concise, technically precise, direct, and zero conversational filler.
"""
        return prompt.strip()
