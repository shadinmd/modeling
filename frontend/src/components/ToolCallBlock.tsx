import { useState } from 'react';
import { 
  FileText, Search, Brain, Check, 
  ChevronDown, ChevronRight, Terminal,
  Globe, Compass
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ToolCallItem {
  id: string;
  tool: string;
  arg: string;
  status: 'running' | 'completed' | 'error';
  output?: string;
}

interface ToolCallBlockProps {
  toolCalls: ToolCallItem[];
}

export function ToolCallBlock({ toolCalls }: ToolCallBlockProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  if (!toolCalls || toolCalls.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getToolInfo = (tool: string, arg: string) => {
    if (tool === 'read_file') {
      return {
        label: 'Read File',
        detail: arg,
        Icon: FileText,
      };
    }
    if (tool === 'search_notes' || tool === 'search') {
      return {
        label: 'Search Notes',
        detail: `"${arg}"`,
        Icon: Search,
      };
    }
    if (tool === 'add_fact') {
      return {
        label: 'Save Fact',
        detail: `"${arg}"`,
        Icon: Brain,
      };
    }
    if (tool === 'web_search' || tool === 'search_web') {
      return {
        label: 'Web Search',
        detail: `"${arg}"`,
        Icon: Globe,
      };
    }
    if (tool === 'fetch_webpage' || tool === 'fetch_url' || tool === 'browse_url') {
      return {
        label: 'Browse Page',
        detail: arg,
        Icon: Compass,
      };
    }
    return {
      label: tool,
      detail: arg,
      Icon: Terminal,
    };
  };

  return (
    <div className="space-y-2 my-3">
      {toolCalls.map(tc => {
        const info = getToolInfo(tc.tool, tc.arg);
        const Icon = info.Icon;
        const isExpanded = Boolean(expandedIds[tc.id]);
        const isCompleted = tc.status === 'completed';
        const isWeb = tc.tool.includes('web') || tc.tool.includes('fetch') || tc.tool.includes('browse');

        return (
          <div
            key={tc.id}
            className="rounded-xl border border-white/[0.08] bg-[#090c13] overflow-hidden text-xs shadow-sm transition-colors hover:border-white/[0.12]"
          >
            {/* Tool Header */}
            <button
              type="button"
              onClick={() => toggleExpand(tc.id)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5 truncate mr-3">
                <div className="h-6 w-6 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-zinc-300 group-hover:text-white transition-colors">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <span className="font-semibold text-white tracking-tight mr-2">
                    {info.label}:
                  </span>
                  <span className="font-mono text-zinc-300 text-[11px] truncate">
                    {info.detail}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Check className="h-3 w-3" />
                    <span>{isWeb ? 'perception verified' : 'disk access verified'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                    <span>{isWeb ? 'fetching live web...' : 'executing on disk...'}</span>
                  </span>
                )}

                <div className="p-1 text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded Tool Output */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden border-t border-white/[0.04] bg-[#050609]"
                >
                  <div className="p-3 text-[11px] font-mono space-y-2">
                    <div className="flex items-center justify-between text-zinc-500 border-b border-white/[0.04] pb-1.5">
                      <span>{isWeb ? 'Live web perception result' : 'Live file perception result'}</span>
                      <span className="text-[10px] text-zinc-600">
                        {tc.output ? `${tc.output.split('\n').length} lines returned` : 'Executing...'}
                      </span>
                    </div>
                    <pre className="text-zinc-300 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text p-2 rounded-lg bg-black/40 border border-white/[0.03]">
                      {tc.output || 'Waiting for response...'}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default ToolCallBlock;
