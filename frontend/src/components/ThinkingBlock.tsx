import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MarkdownRenderer from './MarkdownRenderer';

interface ThinkingBlockProps {
  thinking: string;
  isLive: boolean;
}

export function ThinkingBlock({ thinking, isLive }: ThinkingBlockProps) {
  // Default open while live thinking; user can toggle anytime
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!thinking) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(thinking);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-white/[0.06] bg-[#080a0f]/90 overflow-hidden text-xs transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none group"
      >
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-zinc-400 group-hover:text-zinc-200">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-zinc-500 transition-transform" />
          ) : (
            <ChevronRight className="h-3 w-3 text-zinc-500 transition-transform" />
          )}
          <span className="font-medium">
            {isLive ? 'Thinking Process' : 'Thought Process'}
          </span>
        </span>

        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.05] text-zinc-300 border border-white/[0.08] animate-pulse">
              thinking
            </span>
          ) : (
            <button
              type="button"
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-white rounded text-[10px] flex items-center gap-1 font-mono text-zinc-500 hover:text-zinc-300"
              title="Copy thought process"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden border-t border-white/[0.04]"
          >
            <div className="relative p-3.5 pl-4 bg-[#05060a] border-l-2 border-zinc-600/80 text-[12px] text-zinc-400 leading-relaxed select-text max-h-80 overflow-y-auto">
              <MarkdownRenderer content={thinking} compact={true} />
              {isLive && (
                <span className="inline-block h-3 w-1 bg-zinc-400 animate-pulse mt-1 align-middle" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default ThinkingBlock;
