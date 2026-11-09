import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, Eye, Edit3, Columns, 
  Bold, Italic, Code, List, 
  CheckSquare, Quote, Heading1, Heading2,
  Trash2, RefreshCw
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ConfirmModal from './ConfirmModal';

interface MarkdownEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (path: string, content: string) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  onRefresh?: () => void;
}

export function MarkdownEditor({
  filePath,
  initialContent,
  onSave,
  onDelete,
  onRefresh
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'unsaved'>('idle');
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state if initialContent changes externally
  useEffect(() => {
    setContent(initialContent);
    setSaveStatus('idle');
  }, [filePath, initialContent]);

  // Keyboard shortcut: Cmd/Ctrl + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePath, content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setSaveStatus('unsaved');
  };

  const handleConfirmDelete = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(filePath);
      setShowDeleteModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(filePath, content);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      console.error(e);
      setSaveStatus('unsaved');
    } finally {
      setIsSaving(false);
    }
  };

  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = content.substring(start, end) || defaultText;
    const replacement = `${prefix}${selection}${suffix}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    setSaveStatus('unsaved');

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selection.length
      );
    }, 10);
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setSaveStatus('unsaved');
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050608] border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#080a0e] border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-white font-medium flex items-center gap-2">
            {filePath}
            {saveStatus === 'unsaved' && (
              <span className="text-[10px] text-amber-400 font-sans tracking-wide">● unsaved</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-400 font-sans tracking-wide">● saved</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode buttons */}
          <div className="flex items-center bg-[#0e1118] p-0.5 rounded-lg border border-white/[0.06]">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                viewMode === 'edit' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Editor Only"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                viewMode === 'split' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Side-by-Side Split"
            >
              <Columns className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                viewMode === 'preview' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Rendered Markdown Preview"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              title="Reload from disk"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

          {onDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              title="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-40 transition-colors"
          >
            <Save className="h-3 w-3" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Formatting Toolbar (shown when editing) */}
      {viewMode !== 'preview' && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-[#0a0c12] border-b border-white/[0.04] text-zinc-400 overflow-x-auto shrink-0">
          <button
            onClick={() => insertFormatting('# ', '', 'Heading 1')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('## ', '', 'Heading 2')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <div className="h-3.5 w-[1px] bg-white/[0.08] mx-1" />
          <button
            onClick={() => insertFormatting('**', '**', 'bold text')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('*', '*', 'italic text')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('`', '`', 'code')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Inline Code"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('```\n', '\n```', 'code block')}
            className="px-1.5 py-0.5 font-mono text-[11px] hover:text-white hover:bg-white/[0.05] rounded cursor-pointer"
            title="Code Block"
          >
            &lt;/&gt;
          </button>
          <div className="h-3.5 w-[1px] bg-white/[0.08] mx-1" />
          <button
            onClick={() => insertFormatting('- ', '', 'List item')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('- [ ] ', '', 'Task')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Task List"
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('> ', '', 'Quote')}
            className="p-1 hover:text-white hover:bg-white/[0.05] rounded text-xs cursor-pointer"
            title="Blockquote"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
          <span className="ml-auto text-[10px] text-zinc-500 font-mono">
            {content.length} chars · {content.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        {viewMode !== 'preview' && (
          <div className={`flex-1 flex flex-col h-full bg-[#050608] ${viewMode === 'split' ? 'border-r border-white/[0.06]' : ''}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleTabKey}
              placeholder="Write markdown here..."
              className="w-full h-full p-5 bg-transparent resize-none text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none leading-relaxed overflow-y-auto selection:bg-zinc-700"
              spellCheck={false}
            />
          </div>
        )}

        {/* Live Preview Area */}
        {viewMode !== 'edit' && (
          <div className="flex-1 flex flex-col h-full bg-[#07090d] overflow-y-auto p-6">
            <div className="max-w-3xl w-full">
              {content.trim() ? (
                <MarkdownRenderer content={content} />
              ) : (
                <p className="text-xs text-zinc-600 italic">No content to preview.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Reusable Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Note"
        description={
          <>
            Are you sure you want to delete <span className="text-white font-mono font-semibold">{filePath}</span> from your workspace? This will permanently delete the file from disk.
          </>
        }
        confirmText="Delete Note"
        variant="danger"
        isPending={isDeleting}
      />
    </div>
  );
}
export default MarkdownEditor;
