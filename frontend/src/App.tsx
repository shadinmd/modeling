import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Square, Plus, RotateCcw, Copy, Check,
  FileText, Brain, Terminal, Folder, 
  ChevronRight, ChevronDown, Trash2, RefreshCw, AlertCircle
} from 'lucide-react';
import MarkdownRenderer from './components/MarkdownRenderer';
import MarkdownEditor from './components/MarkdownEditor';
import ThinkingBlock from './components/ThinkingBlock';
import ToolCallBlock, { type ToolCallItem } from './components/ToolCallBlock';
import ConfirmModal from './components/ConfirmModal';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  model?: string;
  toolCalls?: ToolCallItem[];
  metrics?: {
    elapsed?: number;
    speed?: number;
    model?: string;
  };
}

interface SessionItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface MemoryData {
  user?: {
    name?: string;
    role?: string;
    timezone?: string;
    tone_preference?: string;
  };
  preferences?: {
    code_style?: string;
    tech_stack?: Record<string, string>;
  };
  quick_facts?: string[];
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'workspace'>('chat');
  const [newFact, setNewFact] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isModelsLoading, setIsModelsLoading] = useState(false);
  const [isModelConnected, setIsModelConnected] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchMemory();
    fetchFiles();
    fetchModels();
    fetchSessions(true);
  }, []);

  const fetchSessions = async (autoLoadLatest = false) => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      const sessList: SessionItem[] = data.sessions || [];
      setSessions(sessList);
      if (autoLoadLatest && sessList.length > 0) {
        loadSession(sessList[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);
      setActiveTab('chat');
    } catch (e) {
      console.error(e);
    }
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete || isDeletingSession) return;
    setIsDeletingSession(true);
    const sessionId = sessionToDelete.id;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        setSessions(remaining);
        if (currentSessionId === sessionId) {
          if (remaining.length > 0) {
            loadSession(remaining[0].id);
          } else {
            handleNewChat();
          }
        }
        setSessionToDelete(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeletingSession(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' });
  }, [messages, isLoading]);

  const fetchModels = async () => {
    setIsModelsLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const models: string[] = data.models || [];
      setAvailableModels(models);
      setIsModelConnected(Boolean(data.connected));
      if (models.length > 0) {
        setSelectedModel(prev => (prev && models.includes(prev) ? prev : models[0]));
      } else {
        setSelectedModel('');
      }
    } catch (e) {
      console.error(e);
      setAvailableModels([]);
      setSelectedModel('');
      setIsModelConnected(false);
    } finally {
      setIsModelsLoading(false);
    }
  };

  const fetchMemory = async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      setMemory(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/workspace/files');
      const data = await res.json();
      setFiles(data.files || []);
      if (data.files?.length && !selectedFile) {
        loadFileContent(data.files[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadFileContent = async (path: string) => {
    setSelectedFile(path);
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.content);
    } catch (e) {
      setFileContent('Failed to read file.');
    }
  };

  const handleSaveFile = async (path: string, content: string) => {
    const res = await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) throw new Error('Failed to save file');
    setFileContent(content);
    fetchFiles();
  };

  const handleDeleteFile = async (path: string) => {
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const remaining = files.filter(f => f !== path);
        setFiles(remaining);
        if (selectedFile === path) {
          if (remaining.length > 0) {
            loadFileContent(remaining[0]);
          } else {
            setSelectedFile(null);
            setFileContent('');
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    let filename = newFileName.trim();
    if (!filename.includes('.')) {
      filename += '.md';
    }
    const defaultHeader = `# ${filename.replace(/\.md$/, '').replace(/[_-]/g, ' ')}\n\n`;
    try {
      await handleSaveFile(filename, defaultHeader);
      setNewFileName('');
      setIsCreatingFile(false);
      await fetchFiles();
      setSelectedFile(filename);
      setFileContent(defaultHeader);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    try {
      await fetch('/api/memory/fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: newFact }),
      });
      setNewFact('');
      fetchMemory();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const handleNewChat = () => {
    handleStopGeneration();
    setMessages([]);
    setCurrentSessionId(null);
    setInput('');
    setActiveTab('chat');
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend !== undefined ? textToSend : input).trim();
    if (!messageContent || isLoading) return;

    if (!selectedModel) {
      setMessages(prev => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: messageContent },
        {
          id: `assistant-${Date.now() + 1}`,
          role: 'assistant',
          content: '⚠️ **No Model Selected:** No model is currently selected or available in LM Studio.\n\nPlease open LM Studio, load your preferred model, and click the refresh button in the top bar to connect.',
        }
      ]);
      setInput('');
      return;
    }

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now() + 1}`;
    const userMessage: Message = { id: userMsgId, role: 'user', content: messageContent };

    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const responsePromise = fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          session_id: currentSessionId,
          user_message_id: userMsgId,
          model_id: selectedModel,
        }),
        signal: controller.signal,
      });

      // Stagger assistant container entrance
      await new Promise(resolve => setTimeout(resolve, 280));
      setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', model: selectedModel }]);

      const response = await responsePromise;
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Server responded with HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No response body received');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const lines = evt.split('\n');
          let eventType = 'delta';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.replace('data: ', '').trim();
            }
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === 'tool_start') {
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                const existing = next[idx].toolCalls || [];
                next[idx] = {
                  ...next[idx],
                  toolCalls: [
                    ...existing,
                    {
                      id: parsed.id,
                      tool: parsed.tool,
                      arg: parsed.arg,
                      status: 'running',
                    },
                  ],
                };
                return next;
              });
            } else if (eventType === 'tool_done') {
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                const existing = [...(next[idx].toolCalls || [])];
                const tcIdx = existing.findIndex(tc => tc.id === parsed.id);
                if (tcIdx !== -1) {
                  existing[tcIdx] = {
                    ...existing[tcIdx],
                    status: 'completed',
                    output: parsed.output,
                  };
                } else {
                  existing.push({
                    id: parsed.id,
                    tool: parsed.tool,
                    arg: parsed.arg,
                    status: 'completed',
                    output: parsed.output,
                  });
                }
                next[idx] = {
                  ...next[idx],
                  toolCalls: existing,
                };
                return next;
              });
            } else if (eventType === 'thought' && parsed.text) {
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  thinking: (next[idx].thinking || '') + parsed.text,
                };
                return next;
              });
            } else if (eventType === 'delta' && parsed.text) {
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  content: next[idx].content + parsed.text,
                };
                return next;
              });
            } else if (eventType === 'set_content') {
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  content: parsed.text || '',
                };
                return next;
              });
            } else if (eventType === 'error') {
              const errMsg = parsed.message || parsed.text || 'An error occurred during generation.';
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  content: (next[idx].content ? next[idx].content + '\n\n' : '') + `⚠️ **Error:** ${errMsg}`,
                };
                return next;
              });
            } else if (eventType === 'done') {
              if (parsed.session_id) {
                setCurrentSessionId(parsed.session_id);
                fetchSessions();
              }
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === assistantMsgId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                  ...next[idx],
                  model: parsed.model || next[idx].model || selectedModel,
                  metrics: {
                    elapsed: parsed.elapsed_seconds,
                    speed: parsed.tok_per_sec,
                    model: parsed.model,
                  },
                };
                return next;
              });
            }
          } catch {
            // Ignore incomplete chunks
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorMsg = err.message || 'Error connecting to backend server.';
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === assistantMsgId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            content: next[idx].content || `⚠️ **Connection Error:** ${errorMsg}`,
          };
          return next;
        }
        return [...prev, { id: assistantMsgId, role: 'assistant', content: `⚠️ **Connection Error:** ${errorMsg}` }];
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      fetchMemory();
    }
  };

  const suggestions = [
    {
      title: "Workspace Notes",
      desc: "Explore notes and project files on disk",
      prompt: "What notes and files are available in my workspace? Summarize their contents.",
    },
    {
      title: "Living Memory",
      desc: "Inspect active preferences and facts",
      prompt: "What personal preferences, habits, and quick facts do you have saved about me in living memory?",
    },
    {
      title: "Architecture",
      desc: "How real-time perception works",
      prompt: "Explain how your real-time file perception and deterministic living memory architecture works.",
    },
    {
      title: "Teach a Rule",
      desc: "Persist a new instruction to disk",
      prompt: "Remember this preference: Always respond with clean, technically rigorous bullet points.",
    },
  ];

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050608] text-zinc-200 antialiased font-sans select-none">
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#080a0e] border-r border-white/[0.06] flex flex-col p-4 shrink-0 justify-between">
        <div className="space-y-4">
          
          {/* Brand header */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2.5">
              <div className="h-3.5 w-3.5 bg-white rounded-none shrink-0" />
              <span className="font-semibold text-xs tracking-tight text-white uppercase">
                Assistant
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1 pt-1">
            {[
              { id: 'chat', label: 'Chat', icon: Terminal, count: messages.length ? `${messages.length}` : undefined },
              { id: 'memory', label: 'Living Memory', icon: Brain, count: memory?.quick_facts?.length ? `${memory.quick_facts.length}` : undefined },
              { id: 'workspace', label: 'Workspace Notes', icon: Folder, count: files.length ? `${files.length}` : undefined },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors duration-150 outline-none ${
                    isActive 
                      ? 'bg-white/[0.08] text-white font-semibold' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </span>
                  {tab.count !== undefined && (
                    <span className="text-[10px] text-zinc-500 font-mono px-2 py-0.5 rounded-md bg-white/[0.04]">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Chat History */}
          <div className="pt-3 border-t border-white/[0.04] space-y-2 flex flex-col min-h-0">
            {/* New Chat Button directly above Chat History */}
            <button
              onClick={handleNewChat}
              className="w-full py-2 px-3 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>

            <div className="flex items-center justify-between px-2 pt-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <span>Chat History</span>
              <span>{sessions.length}</span>
            </div>

            <div className="overflow-y-auto max-h-[35vh] space-y-0.5 -mx-1 px-1">
              {sessions.map(s => {
                const isSelected = activeTab === 'chat' && currentSessionId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white/[0.08] text-white font-medium border border-white/[0.06]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="truncate pr-2 text-[11px] leading-tight">
                      {s.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete({ id: s.id, title: s.title });
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 text-zinc-500 rounded transition-all shrink-0 cursor-pointer"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}

              {sessions.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-zinc-600 italic">
                  No previous chats
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-white/[0.06] space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 px-2">
            <span>Model Server</span>
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full inline-block ${isModelConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {isModelConnected ? 'Connected (1234)' : 'Offline (1234)'}
            </span>
          </div>
          {memory?.user?.name && (
            <div className="px-3 py-2 bg-[#050608] rounded-xl border border-white/[0.04] text-[11px] text-zinc-400 font-mono flex items-center justify-between">
              <span className="truncate">{memory.user.name}</span>
              <span className="text-[10px] text-zinc-600 truncate">{memory.user.role || 'User'}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full bg-[#050608] overflow-hidden relative">

        {/* Top Header Bar */}
        <header className="h-13 border-b border-white/[0.06] bg-[#07090e]/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-white capitalize tracking-wide truncate max-w-sm">
              {activeTab === 'chat' 
                ? (sessions.find(s => s.id === currentSessionId)?.title || 'New Chat') 
                : activeTab === 'memory' 
                  ? 'Living Memory Profile' 
                  : 'Workspace Notes'}
            </span>

            {activeTab === 'chat' && (
              <div className="flex items-center gap-2 pl-3 border-l border-white/[0.08]">
                {availableModels.length > 0 ? (
                  <div className="relative flex items-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 absolute left-2.5 z-10" />
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      className="bg-[#0e121a] border border-white/[0.08] text-[11px] font-mono text-zinc-300 rounded-lg pl-6 pr-7 py-1 appearance-none cursor-pointer focus:outline-none hover:bg-[#141924] transition-colors"
                    >
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="h-3 w-3 text-zinc-500 absolute right-2 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>No Model Available</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={fetchModels}
                  disabled={isModelsLoading}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-40"
                  title="Refresh models from LM Studio"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isModelsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'chat' && hasMessages && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg transition-colors cursor-pointer"
                title="Clear current conversation"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Chat</span>
              </button>
            )}
          </div>
        </header>

        {/* TAB 1: Chat Stream */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 space-y-6">
              
              {/* Empty state / Suggestions (DeepSeek & LM Studio style) */}
              {!hasMessages && (
                <div className="max-w-3xl mx-auto my-auto py-12 flex flex-col items-center justify-center space-y-8">
                  <div className="text-center space-y-2">
                    <div className="h-4 w-4 bg-white rounded-none mx-auto mb-4" />
                    <h2 className="text-xl font-medium text-white tracking-tight">How can I help you today?</h2>
                    <p className="text-xs text-zinc-500 font-mono">
                      Real-time perception of notes and living memory active.
                    </p>
                  </div>

                  {/* Suggestion prompt cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(s.prompt)}
                        className="p-3.5 bg-[#090b10] hover:bg-[#0f121a] border border-white/[0.06] hover:border-white/[0.14] rounded-xl text-left cursor-pointer transition-all duration-150 group flex flex-col justify-between space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                            {s.title}
                          </span>
                          <ChevronRight className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        </div>
                        <p className="text-[11px] text-zinc-500 group-hover:text-zinc-400 line-clamp-1">
                          {s.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {hasMessages && (
                <div className="max-w-3xl mx-auto space-y-8 pb-12">
                  <AnimatePresence initial={false}>
                    {messages.map((m, idx) => (
                      <motion.div 
                        key={m.id || idx} 
                        initial={{ opacity: 0, y: 14, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className={`w-full ${m.role === 'user' ? 'flex justify-end' : 'flex flex-col'}`}
                      >
                        {m.role === 'user' ? (
                          /* User Message Pill */
                          <div className="max-w-[85%] bg-[#1c212a] border border-white/[0.08] text-zinc-100 rounded-2xl rounded-tr-xs px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap select-text shadow-sm">
                            {m.content}
                          </div>
                        ) : (
                          /* Assistant Message Editorial Flow (DeepSeek style) */
                          <div className="w-full space-y-3">
                            {/* Assistant identity bar */}
                            <div className="flex items-center gap-2 select-none">
                              <div className="h-3 w-3 bg-white rounded-none shrink-0" />
                              <span className="font-semibold text-xs tracking-tight text-white uppercase">
                                Assistant
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {m.model || m.metrics?.model || selectedModel}
                              </span>
                            </div>

                            {/* Assistant Content Container */}
                            <div className="pl-5 space-y-2">
                              {/* DeepSeek Style Collapsible Thinking Block */}
                              {m.thinking && (
                                <ThinkingBlock 
                                  thinking={m.thinking} 
                                  isLive={isLoading && idx === messages.length - 1 && !m.content} 
                                />
                              )}

                              {/* Dedicated Tool Execution Card (Disk perception verified) */}
                              {m.toolCalls && m.toolCalls.length > 0 && (
                                <ToolCallBlock toolCalls={m.toolCalls} />
                              )}

                              {/* Main Markdown Response */}
                              {(() => {
                                const displayContent = m.content
                                  .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
                                  .replace(/<tool_call:[^>]+>/gi, '')
                                  .trim();
                                return displayContent ? (
                                  <div className="text-[13.5px] leading-relaxed text-zinc-200 select-text">
                                    <MarkdownRenderer content={displayContent} />
                                  </div>
                                ) : null;
                              })()}

                              {/* Loading cursor if waiting for initial tokens */}
                              {isLoading && idx === messages.length - 1 && !m.content && !m.thinking && (
                                <span className="inline-block h-3.5 w-1 bg-zinc-300 animate-pulse align-middle" />
                              )}

                              {/* Action Footer (Copy + Metrics) */}
                              {m.content && (
                                <div className="flex items-center gap-3 pt-2 text-[10px] font-mono text-zinc-500">
                                  {m.metrics?.elapsed && (
                                    <span className="text-zinc-400">
                                      {m.metrics.elapsed}s {m.metrics.speed && `· ${m.metrics.speed} tok/s`}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleCopyMessage(m.id || `${idx}`, m.content)}
                                    className="flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer"
                                    title="Copy entire response"
                                  >
                                    {copiedMsgId === (m.id || `${idx}`) ? (
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
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Bottom Floating Composer Dock (DeepSeek & LM Studio style) */}
            <div className="p-4 md:pb-6 pt-2 bg-gradient-to-t from-[#050608] via-[#050608]/95 to-transparent shrink-0 z-20">
              <div className="max-w-3xl w-full mx-auto space-y-2">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }} 
                  className="bg-[#0b0d13] border border-white/[0.09] rounded-2xl p-3 shadow-2xl shadow-black/90 flex flex-col gap-2.5 transition-colors focus-within:border-white/[0.22]"
                >
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={selectedModel ? "Ask about notes, projects, habits, browse the web, or teach rules..." : "No model available. Load or select a model in LM Studio..."}
                    rows={2}
                    className="w-full bg-transparent px-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
                    autoFocus
                  />

                  {/* Composer bottom toolbar */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] px-1">
                    <div className="flex items-center gap-3">
                      {selectedModel ? (
                        <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                          <span>Model: <span className="text-zinc-200">{selectedModel}</span></span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                          <span>No model loaded in LM Studio</span>
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-600">·</span>
                      <span className="text-[10px] font-mono text-zinc-500">Perception Active</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isLoading ? (
                        <button
                          type="button"
                          onClick={handleStopGeneration}
                          className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors border border-white/[0.08]"
                          title="Stop streaming"
                        >
                          <Square className="h-3 w-3 fill-zinc-200" />
                          <span>Stop</span>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={!input.trim()}
                          className="h-8 w-8 bg-white hover:bg-zinc-200 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-black font-medium transition-all duration-150"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                <p className="text-[10px] text-zinc-600 font-mono text-center">
                  Private on-device inference via LM Studio. Direct disk perception active.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: Living Memory */}
        {activeTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full space-y-8">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white tracking-tight uppercase">Living Memory Profile</h2>
              <p className="text-xs text-zinc-500">
                Deterministic knowledge updated automatically from interactions or manual entry.
              </p>
            </div>

            {/* Quick Fact Form */}
            <form onSubmit={handleAddFact} className="flex gap-2 p-1.5 rounded-2xl bg-[#0b0d13] border border-white/[0.06]">
              <input
                type="text"
                value={newFact}
                onChange={e => setNewFact(e.target.value)}
                placeholder="Teach a new habit, project fact, or preference..."
                className="flex-1 bg-transparent px-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-semibold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Save Fact
              </button>
            </form>

            {/* Quick Facts Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Quick Facts ({memory?.quick_facts?.length || 0})</h3>
              <div className="grid gap-2">
                {memory?.quick_facts?.map((fact, i) => (
                  <div key={i} className="p-3 text-xs text-zinc-200 flex items-center justify-between rounded-xl bg-[#0b0d13] border border-white/[0.06]">
                    <span>{fact}</span>
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-3" />
                  </div>
                ))}
              </div>
            </div>

            {/* User Profile Key-Values */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">User Identity</h3>
              <div className="p-5 rounded-2xl bg-[#0b0d13] border border-white/[0.06] space-y-3 font-mono text-xs text-zinc-300">
                <div className="flex justify-between pb-2 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Name:</span>
                  <span className="text-white">{memory?.user?.name}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Role:</span>
                  <span className="text-zinc-200">{memory?.user?.role}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-white/[0.04]">
                  <span className="text-zinc-500">Timezone:</span>
                  <span>{memory?.user?.timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tone:</span>
                  <span className="text-zinc-200">{memory?.user?.tone_preference}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Workspace Files */}
        {activeTab === 'workspace' && (
          <div className="flex-1 flex h-full overflow-hidden">
            {/* File List Column */}
            <div className="w-72 border-r border-white/[0.06] bg-[#080a0e] p-5 space-y-4 shrink-0 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Workspace</span>
                <span className="text-xs font-mono text-zinc-300 bg-white/[0.05] px-2 py-0.5 rounded-md border border-white/[0.08]">
                  {files.length} notes
                </span>
              </div>

              {/* Add Note Button & Input */}
              {isCreatingFile ? (
                <form onSubmit={handleCreateFile} className="space-y-2">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    placeholder="note_name.md"
                    autoFocus
                    className="w-full bg-[#121620] border border-white/[0.12] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={!newFileName.trim()}
                      className="flex-1 py-1.5 bg-white text-black font-semibold text-xs rounded-lg hover:bg-zinc-200 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsCreatingFile(false); setNewFileName(''); }}
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs rounded-lg hover:bg-zinc-700 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreatingFile(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#11141c] hover:bg-[#161b24] border border-white/[0.08] hover:border-white/[0.15] text-zinc-200 text-xs font-medium rounded-xl transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-zinc-400" />
                  <span>New Note</span>
                </button>
              )}

              <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {files.map(f => (
                  <button
                    key={f}
                    onClick={() => loadFileContent(f)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150 ${
                      selectedFile === f
                        ? 'bg-zinc-800 text-white border border-white/[0.1]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                      <span className="truncate">{f}</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Markdown Editor & Live Renderer */}
            <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[#050608]">
              {selectedFile ? (
                <MarkdownEditor
                  key={selectedFile}
                  filePath={selectedFile}
                  initialContent={fileContent}
                  onSave={handleSaveFile}
                  onDelete={handleDeleteFile}
                  onRefresh={() => loadFileContent(selectedFile)}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-xs space-y-3">
                  <Folder className="h-10 w-10 opacity-30 text-zinc-500" />
                  <p>Select a note or create a new one to start writing.</p>
                  <button
                    onClick={() => setIsCreatingFile(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#121620] hover:bg-[#171c28] border border-white/[0.08] text-zinc-300 text-xs rounded-xl cursor-pointer transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create new note</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Reusable Session Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onConfirm={confirmDeleteSession}
        title="Delete Chat"
        description={
          <>
            Are you sure you want to delete <span className="text-white font-medium">"{sessionToDelete?.title}"</span>? This will permanently remove the conversation and its history.
          </>
        }
        confirmText="Delete Chat"
        variant="danger"
        isPending={isDeletingSession}
      />
    </div>
  );
}
