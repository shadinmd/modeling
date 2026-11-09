import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, FileText, Search, Brain, Terminal, Globe, Compass } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

function parseInlineToolCall(raw: string) {
  let m = raw.match(/<tool_call:([a-zA-Z_]+)(?:\s+[a-zA-Z_]+=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?\s*\/?>/);
  if (m) {
    const tool = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || '';
    return { tool, value: val };
  }
  m = raw.match(/<function=(?:tool_call:)?([a-zA-Z_]+)>\s*<parameter=[^>]+>\s*(.*?)\s*<\/parameter>/s);
  if (m) {
    return { tool: m[1], value: m[2] };
  }
  m = raw.match(/^([a-zA-Z_]+)\(\s*(?:"([^"]*)"|'([^']*)')\s*\)$/);
  if (m && ['read_file', 'search_notes', 'add_fact', 'web_search', 'search_web', 'fetch_webpage', 'fetch_url', 'browse_url'].includes(m[1])) {
    return { tool: m[1], value: m[2] !== undefined ? m[2] : m[3] || '' };
  }
  return null;
}

function ToolCallPill({ tool, value }: { tool: string; value?: string }) {
  const cleanTool = tool.replace(/^tool_call:/, '');
  const Icon = cleanTool.includes('web')
    ? Globe
    : cleanTool.includes('fetch') || cleanTool.includes('browse')
      ? Compass
      : cleanTool.includes('search') 
        ? Search 
        : cleanTool.includes('fact') 
          ? Brain 
          : cleanTool.includes('file') 
            ? FileText 
            : Terminal;

  const label = cleanTool === 'web_search' || cleanTool === 'search_web'
    ? 'Web Search'
    : cleanTool === 'fetch_webpage' || cleanTool === 'fetch_url' || cleanTool === 'browse_url'
      ? 'Browse Page'
      : cleanTool === 'read_file'
        ? 'Read File'
        : cleanTool === 'search_notes'
          ? 'Search Notes'
          : cleanTool === 'add_fact'
            ? 'Save Fact'
            : cleanTool;

  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 mx-1 my-0.5 rounded-xl bg-[#090c13] border border-white/[0.1] text-zinc-200 font-sans text-xs select-text shadow-sm hover:border-white/[0.2] transition-colors">
      <div className="h-4 w-4 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-zinc-300">
        <Icon className="h-2.5 w-2.5" />
      </div>
      <span className="font-semibold text-white tracking-tight">{label}</span>
      {value ? (
        <>
          <span className="text-zinc-600 font-mono">/</span>
          <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[340px]">{value}</span>
        </>
      ) : null}
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
    </span>
  );
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const textContent = String(children).replace(/\n$/, '');

  // Intercept code blocks that contain raw tool calls (e.g. ```json <tool_call:...> ```)
  if (textContent.includes('<tool_call:')) {
    const matches = Array.from(
      textContent.matchAll(/<tool_call:([a-zA-Z_]+)(?:\s+[a-zA-Z_]+=(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+)))?\s*\/?>/g)
    );
    if (matches.length > 0) {
      return (
        <div className="flex flex-wrap gap-1.5 my-2">
          {matches.map((m, i) => {
            const tool = m[1];
            const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || '';
            return <ToolCallPill key={i} tool={tool} value={val} />;
          })}
        </div>
      );
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const language = className ? className.replace('language-', '') : '';

  return (
    <div className="relative group my-3 rounded-xl border border-white/[0.08] bg-[#040507] overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05] bg-white/[0.02] text-[11px] font-mono text-zinc-400">
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto font-mono text-xs text-zinc-200 leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, className = '', compact = false }: MarkdownRendererProps) {
  // Strip awkward enclosing brackets/parentheses around tool calls: e.g. `(<tool_call:...>)`, `[<tool_call:...>]`
  const preprocessed = content
    .replace(/\(\s*\[?\s*(<tool_call:[^>]+>)\s*\]?\s*\)/g, '$1')
    .replace(/\[\s*(<tool_call:[^>]+>)\s*\]/g, '$1')
    .replace(/\{\s*(<tool_call:[^>]+>)\s*\}/g, '$1')
    .replace(/\(\s*(<function=[^>]+>.*?<\/function>|<function=[^>]+>.*?<\/parameter>)\s*\)/gs, '$1')
    .replace(/\[\s*(<function=[^>]+>.*?<\/function>|<function=[^>]+>.*?<\/parameter>)\s*\]/gs, '$1')
    .replace(/\(\s*((?:web_search|search_web|read_file|fetch_webpage|fetch_url|browse_url|search_notes|search|add_fact)\([^)]+\))\s*\)/g, '$1')
    .replace(/\(\s*(`[^`]*<tool_call:[^>]+>`)\s*\)/g, '$1');

  // Normalize unbackticked tool call tags so they are parsed into inline code blocks and rendered as sleek pills
  const normalizedContent = preprocessed
    .replace(
      /(?<!`)<tool_call:([a-zA-Z_]+)(?:\s+[a-zA-Z_]+=(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+)))?\s*\/?>/g,
      (_match, tool, dq, sq, bare) => {
        const val = dq !== undefined ? dq : sq !== undefined ? sq : bare || '';
        return `\`<tool_call:${tool} query="${val}">\``;
      }
    )
    .replace(
      /(?<!`)<function=(?:tool_call:)?([a-zA-Z_]+)>\s*<parameter=[^>]+>\s*(.*?)\s*<\/parameter>\s*(?:<\/function>)?/gs,
      (_match, tool, val) => `\`<tool_call:${tool} query="${val}">\``
    );

  return (
    <div className={`prose-invert leading-relaxed ${compact ? 'text-[12px] text-zinc-400 space-y-2' : 'text-[13px] text-zinc-200 space-y-2.5'} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className={`${compact ? 'text-xs font-semibold text-zinc-200 mt-2 mb-1 border-b border-white/[0.04] pb-0.5' : 'text-base font-semibold text-white mt-4 mb-2 pb-1 border-b border-white/[0.08]'}`} {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className={`${compact ? 'text-xs font-semibold text-zinc-300 mt-2 mb-1' : 'text-sm font-semibold text-white mt-3.5 mb-1.5'}`} {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className={`${compact ? 'text-[11px] font-medium text-zinc-400 mt-1.5 mb-0.5 uppercase tracking-wider' : 'text-xs font-semibold text-zinc-100 mt-3 mb-1 uppercase tracking-wider'}`} {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-xs font-semibold text-zinc-300 mt-2 mb-1" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="leading-relaxed mb-1.5 last:mb-0" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className={`font-semibold ${compact ? 'text-zinc-200' : 'text-white'}`} {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-zinc-300" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-outside pl-4 mb-2 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-outside pl-4 mb-2 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-zinc-600 pl-3 py-1 my-2.5 text-zinc-400 italic text-xs bg-white/[0.01]" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-2.5 border-white/[0.06]" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors" target="_blank" rel="noreferrer" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2.5 rounded-xl border border-white/[0.08]">
              <table className="w-full text-xs text-left border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-[#090b10] border-b border-white/[0.08]" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-3 py-1.5 font-medium text-white border-r border-white/[0.06] last:border-r-0" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-1.5 text-zinc-300 border-t border-white/[0.06] border-r last:border-r-0" {...props} />
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isMultiLine = typeof children === 'string' && children.includes('\n');
            if (match || isMultiLine) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }

            const rawStr = String(children || '').trim();
            const parsedTool = parseInlineToolCall(rawStr);
            if (parsedTool) {
              return <ToolCallPill tool={parsedTool.tool} value={parsedTool.value} />;
            }

            return (
              <code className="bg-white/[0.08] border border-white/[0.06] text-zinc-200 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
export default MarkdownRenderer;
