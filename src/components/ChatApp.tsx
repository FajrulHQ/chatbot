/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResultList {
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
    isFinal: boolean;
  };
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (evt: SpeechRecognitionEventLike) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export type LocalModel = {
  id: string;
  name: string;
  tag: string;
  badge?: string;
  size?: string;
  context?: string;
  default?: boolean;
  hasReasoning?: boolean;
  defaultReasoning?: "Off" | "Low" | "Medium" | "High";
  isHybrid?: boolean;
  isAgentic?: boolean;
  desc?: string;
};

export type RuntimeEntry = {
  key: string;
  name: string;
  endpoint: string;
  protocol: string;
  online: boolean;
  latency: string;
  models: LocalModel[];
};

export type AttachmentItem = {
  id: string;
  name: string;
  size: string;
  isImage: boolean;
  isAudio?: boolean;
  dataUrl?: string;
  textContent?: string;
  charCount?: number;
};

export type StepProcessInfo = {
  decision?: {
    gateModel: string;
    intent: string;
    tool: string;
    confidence: number;
    threshold: number;
    latencyMs: number;
    rationale?: string;
  };
  documentContext?: {
    fileName: string;
    charCount: number;
  };
  toolExecution?: {
    tool: string;
    query?: string;
    resultSummary?: string;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
    latencyMs?: number;
  };
  llmGeneration?: {
    modelName: string;
    device?: string;
    reasoningLevel?: string;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  think?: string;
  time?: string;
  modelName?: string;
  runtimeKey?: string;
  attachments?: AttachmentItem[];
  stepProcess?: StepProcessInfo;
  expandedReasoning?: boolean;
};

export type SessionItem = {
  id: string;
  title: string;
  model: string | null;
  runtime: string | null;
  createdAt: string;
  lastMessageAt: string;
};

const DEFAULT_RUNTIMES: Record<string, RuntimeEntry> = {
  lmstudio: {
    key: "lmstudio",
    name: "LM Studio Local",
    endpoint: "http://127.0.0.1:1234",
    protocol: "LM Studio Local Server",
    online: true,
    latency: "3ms",
    models: [
      {
        id: "hybrid-agentic-lmstudio",
        name: "Hybrid Agentic (qwen3.5-0.8b + d1-omni)",
        tag: "HYBRID · AGENT",
        badge: "AGENT",
        size: "Dual Engine",
        context: "32k",
        default: true,
        hasReasoning: true,
        defaultReasoning: "High",
        isHybrid: true,
        desc: "d1-omni-600m decision gate ➔ qwen3.5-0.8b-mlx generation",
      },
      {
        id: "qwen3.5-0.8b-mlx",
        name: "qwen3.5-0.8b-mlx",
        tag: "LLM · CHAT",
        badge: "LLM",
        size: "950 MB",
        context: "32k",
        hasReasoning: true,
        defaultReasoning: "Medium",
        desc: "Ultra-compact 0.8B vision-language model",
      },
    ],
  },
  ollama: {
    key: "ollama",
    name: "Ollama Local Engine",
    endpoint: "http://127.0.0.1:11434",
    protocol: "Ollama REST API",
    online: true,
    latency: "9ms",
    models: [
      {
        id: "qwen3.5:0.8b",
        name: "qwen3.5:0.8b (Thinking + Vision)",
        tag: "REASONING",
        badge: "THINK",
        size: "1.0 GB",
        context: "256k",
        default: true,
        hasReasoning: true,
        defaultReasoning: "High",
        desc: "Qwen 3.5 0.8B with thinking & multimodal vision capabilities",
      },
      {
        id: "kimi-k2.5:cloud",
        name: "kimi-k2.5:cloud",
        tag: "TOOLS",
        badge: "TOOLS",
        size: "Remote",
        context: "256k",
        hasReasoning: true,
        defaultReasoning: "Medium",
      },
      {
        id: "llama3.2:latest",
        name: "Llama 3.2 (3.2B)",
        tag: "CHAT",
        badge: "CHAT",
        size: "2.0 GB",
        context: "128k",
        hasReasoning: false,
      },
    ],
  },
  hermes: {
    key: "hermes",
    name: "Hermes Local Agent",
    endpoint: "http://127.0.0.1:8642",
    protocol: "Hermes IPC / Gateway",
    online: true,
    latency: "5.4ms",
    models: [
      {
        id: "ag/gemini-3.8-flash-high",
        name: "ag/gemini-3.8-flash-high",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        default: true,
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
        desc: "Autonomous agentic reasoning with multi-step subagent execution & tool use",
      },
      {
        id: "ag/gemini-3.8-flash-medium",
        name: "ag/gemini-3.8-flash-medium",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.8-flash-low",
        name: "ag/gemini-3.8-flash-low",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.8-flash",
        name: "ag/gemini-3.8-flash",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.7-flash-high",
        name: "ag/gemini-3.7-flash-high",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.7-flash-medium",
        name: "ag/gemini-3.7-flash-medium",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.7-flash-low",
        name: "ag/gemini-3.7-flash-low",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.6-flash-high",
        name: "ag/gemini-3.6-flash-high",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.6-flash-medium",
        name: "ag/gemini-3.6-flash-medium",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.6-flash-low",
        name: "ag/gemini-3.6-flash-low",
        tag: "AGENTIC · FLASH",
        badge: "FLASH",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.1-pro-high",
        name: "ag/gemini-3.1-pro-high",
        tag: "FRONTIER · PRO",
        badge: "PRO",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/gemini-pro-agent",
        name: "ag/gemini-pro-agent",
        tag: "AGENTIC",
        badge: "AGENT",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: false,
        isAgentic: true,
      },
      {
        id: "ag/gemini-3.1-pro-low",
        name: "ag/gemini-3.1-pro-low",
        tag: "FRONTIER · PRO",
        badge: "PRO",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/claude-sonnet-5-5-high",
        name: "ag/claude-sonnet-5-5-high",
        tag: "FRONTIER · SONNET",
        badge: "SONNET",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/claude-sonnet-5-5-medium",
        name: "ag/claude-sonnet-5-5-medium",
        tag: "FRONTIER · SONNET",
        badge: "SONNET",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/claude-sonnet-5-5-low",
        name: "ag/claude-sonnet-5-5-low",
        tag: "FRONTIER · SONNET",
        badge: "SONNET",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/claude-sonnet-5-5",
        name: "ag/claude-sonnet-5-5",
        tag: "FRONTIER · SONNET",
        badge: "SONNET",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/claude-opus-5-5-high",
        name: "ag/claude-opus-5-5-high",
        tag: "REASONING · OPUS",
        badge: "OPUS",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/claude-opus-5-5-medium",
        name: "ag/claude-opus-5-5-medium",
        tag: "REASONING · OPUS",
        badge: "OPUS",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
      {
        id: "ag/claude-opus-5-5-low",
        name: "ag/claude-opus-5-5-low",
        tag: "REASONING · OPUS",
        badge: "OPUS",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "Low",
        isAgentic: true,
      },
      {
        id: "ag/claude-opus-5-5",
        name: "ag/claude-opus-5-5",
        tag: "REASONING · OPUS",
        badge: "OPUS",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/claude-sonnet-4-6",
        name: "ag/claude-sonnet-4-6",
        tag: "FRONTIER · SONNET",
        badge: "SONNET",
        size: "Host Proxy",
        context: "1M tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/claude-opus-4-6-thinking",
        name: "ag/claude-opus-4-6-thinking",
        tag: "REASONING · OPUS",
        badge: "OPUS",
        size: "Host Proxy",
        context: "200k tokens",
        hasReasoning: true,
        defaultReasoning: "High",
        isAgentic: true,
      },
      {
        id: "ag/gpt-oss-120b-medium",
        name: "ag/gpt-oss-120b-medium",
        tag: "OPEN SOURCE",
        badge: "OSS",
        size: "128k",
        context: "128k",
        hasReasoning: true,
        defaultReasoning: "Medium",
        isAgentic: true,
      },
    ],
  },
};

export default function ChatApp() {
  const [runtimes, setRuntimes] = useState<Record<string, RuntimeEntry>>(DEFAULT_RUNTIMES);
  const [activeRuntimeKey, setActiveRuntimeKey] = useState<string>("lmstudio");
  const [activeModelId, setActiveModelId] = useState<string>("hybrid-agentic-lmstudio");
  const [reasoningLevel, setReasoningLevel] = useState<"Off" | "Low" | "Medium" | "High">("High");
  const [modelHasReasoning, setModelHasReasoning] = useState<boolean>(true);

  // Layout & UI
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [reasoningDropdownOpen, setReasoningDropdownOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tuning Parameters
  const [temp, setTemp] = useState(0.20);
  const [topP, setTopP] = useState(0.90);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a capable, natural, and intelligent AI assistant. Converse directly and clearly, and deliver high-impact, well-structured answers."
  );
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const toggleStepExpand = (msgId: string, stepKey: string) => {
    const key = `${msgId}-${stepKey}`;
    setExpandedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Favorites
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    "hybrid-agentic-lmstudio": true,
    "ag/gemini-3.8-flash-high": true,
    "qwen3.5:0.8b": true,
  });

  // Real Database Sessions & Messages (Supabase)
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dbSource, setDbSource] = useState<string>("supabase");

  // Inputs & Streaming
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Interrupt Abort Controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeRuntime = runtimes[activeRuntimeKey] || DEFAULT_RUNTIMES.lmstudio;
  const activeModel =
    activeRuntime.models.find((m) => m.id === activeModelId) ||
    activeRuntime.models.find((m) => m.default) ||
    activeRuntime.models[0] || {
      id: "unknown",
      name: "Local Model",
      tag: "LLM",
      badge: "LOCAL",
    };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  // Discover & Probe Local LLMs Live
  const scanModels = async (targetRuntimeKey?: string | React.MouseEvent) => {
    const keyToInspect = typeof targetRuntimeKey === "string" ? targetRuntimeKey : activeRuntimeKey;
    const currentRt = runtimes[keyToInspect] || DEFAULT_RUNTIMES[keyToInspect];
    showToast(`Checking status on ${currentRt?.name || keyToInspect}...`);
    try {
      const res = await fetch("/api/runtimes");
      if (res.ok) {
        const data = await res.json();
        if (data.runtimes) {
          setRuntimes((prev) => ({ ...prev, ...data.runtimes }));
          const rt = data.runtimes[keyToInspect];
          if (rt) {
            if (rt.models && rt.models.length > 0) {
              if (keyToInspect === activeRuntimeKey) {
                const exists = rt.models.some((m: LocalModel) => m.id === activeModelId);
                if (!exists) {
                  const def = rt.models.find((m: LocalModel) => m.default) || rt.models[0];
                  setActiveModelId(def.id);
                }
              }
            }
            const statusText = rt.online ? `ONLINE (${rt.latency})` : "OFFLINE";
            showToast(`${rt.name}: ${statusText} · ${rt.models?.length || 0} models available`);
          }
        }
      }
    } catch {
      showToast(`Scan completed for ${currentRt?.name || keyToInspect}`);
    }
  };

  // Load Sessions from Database
  const loadSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (data.database) setDbSource(data.database);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  useEffect(() => {
    void scanModels();
    void loadSessions();
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        startNewSession();
      }
      if (e.key === "Escape") {
        if (isSending) {
          handleInterrupt();
        } else {
          setModelPopoverOpen(false);
          setReasoningDropdownOpen(false);
          setTuningOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSending]);

  // Update reasoning capability when active model changes
  useEffect(() => {
    if (activeModel) {
      const hasR = !!activeModel.hasReasoning;
      setModelHasReasoning(hasR);
      if (hasR && activeModel.defaultReasoning && reasoningLevel === "Off") {
        setReasoningLevel(activeModel.defaultReasoning);
      }
    }
  }, [activeModel]);

  // Auto-scroll chat stream
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Speech Recognition
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (evt: SpeechRecognitionEventLike) => {
        let transcript = "";
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          transcript += evt.results[i][0].transcript;
        }
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsRecording(false);
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
    }
  }, []);

  const toggleVoiceRecord = () => {
    if (!recognitionRef.current) {
      showToast("Voice input unavailable in this browser");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      showToast("Voice input stopped");
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        showToast("Listening to voice input via local Whisper / Web Speech...");
      } catch {
        setIsRecording(false);
      }
    }
  };

  // Runtime Change
  const handleRuntimeChange = (rtKey: string) => {
    setActiveRuntimeKey(rtKey);
    const rt = runtimes[rtKey] || DEFAULT_RUNTIMES[rtKey];
    if (rt && rt.models.length > 0) {
      const def = rt.models.find((m) => m.default) || rt.models[0];
      setActiveModelId(def.id);
    }
    const statusText = rt?.online ? `ONLINE (${rt.latency})` : "OFFLINE";
    showToast(`Switched runtime to: ${rt ? rt.name : rtKey} [${statusText}]`);
    // Live auto-check model availability for this runtime
    void scanModels(rtKey);
  };

  // Session Switching: Loads real chat messages from database
  const switchSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    showToast(`Loading session #${sessionId}...`);
    try {
      const currentSession = sessions.find((s) => s.id === sessionId);
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const loaded: ChatMessage[] = (data.messages || []).map((m: {
          id: string | number;
          role: "user" | "assistant";
          content: string;
          think?: string;
          createdAt: string;
          metadata?: unknown;
        }) => {
          let meta = m.metadata as
            | {
                modelName?: string;
                runtimeKey?: string;
                attachments?: AttachmentItem[];
                stepProcess?: StepProcessInfo;
              }
            | undefined;
          if (typeof meta === "string") {
            try {
              meta = JSON.parse(meta);
            } catch {}
          }
          const storedModel =
            meta?.modelName || (m.role === "assistant" ? currentSession?.model || undefined : undefined);
          const storedRuntime =
            meta?.runtimeKey || (m.role === "assistant" ? currentSession?.runtime || undefined : undefined);

          return {
            id: `msg-${m.id}`,
            role: m.role,
            text: m.content,
            think: m.think || "",
            time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            modelName: storedModel,
            runtimeKey: storedRuntime,
            attachments: meta?.attachments,
            stepProcess: meta?.stepProcess,
            expandedReasoning: false,
          };
        });
        setMessages(loaded);
        showToast(`Loaded ${loaded.length} message(s) from database`);
      }
    } catch {
      showToast("Could not load session messages");
    }
  };

  const startNewSession = () => {
    if (isSending) handleInterrupt();
    setActiveSessionId(null);
    setMessages([]);
    setAttachments([]);
    showToast("Clean session ready");
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this session from database?")) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        startNewSession();
      }
      showToast(`Deleted session #${sessionId}`);
    } catch {
      showToast("Failed to delete session");
    }
  };

  // Model Selection from Popover
  const selectModelFromPopover = (modelId: string) => {
    setActiveModelId(modelId);
    setModelPopoverOpen(false);
    const m = activeRuntime.models.find((x) => x.id === modelId);
    if (m) showToast(`Selected model: ${m.name}`);
  };

  const toggleStar = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = { ...prev, [modelId]: !prev[modelId] };
      showToast(next[modelId] ? `Starred ${modelId}` : `Unstarred ${modelId}`);
      return next;
    });
  };

  const promptAddCustomModel = () => {
    setModelPopoverOpen(false);
    const customId = window.prompt("Enter local model identifier or GGUF filename:", "qwen2.5-coder-32b-instruct");
    if (customId && customId.trim()) {
      const trimmed = customId.trim();
      const newModel: LocalModel = {
        id: trimmed,
        name: trimmed,
        tag: "CUSTOM",
        badge: "CUSTOM",
        size: "Local File",
        context: "32k",
        hasReasoning: true,
        defaultReasoning: "Medium",
        desc: "User-registered custom local model",
      };
      setRuntimes((prev) => {
        const rt = prev[activeRuntimeKey] || prev.lmstudio;
        return {
          ...prev,
          [activeRuntimeKey]: {
            ...rt,
            models: [newModel, ...rt.models],
          },
        };
      });
      setActiveModelId(trimmed);
      showToast(`Added custom model: ${trimmed}`);
    }
  };

  // Files & Attachments with DataURL Preview and Document Text Extraction
  const triggerFileInput = () => fileInputRef.current?.click();

  const handleIncomingFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isImg = f.type.startsWith("image/");
      let dataUrl: string | undefined;
      let textContent: string | undefined;
      let charCount: number | undefined;

      if (isImg) {
        dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(f);
        });
      } else {
        // Document: extract text via /api/document/extract for Q&A
        try {
          showToast(`Extracting document text from ${f.name}...`);
          const fd = new FormData();
          fd.append("file", f);
          const extRes = await fetch("/api/document/extract", {
            method: "POST",
            body: fd,
          });
          if (extRes.ok) {
            const extData = await extRes.json();
            textContent = extData.text;
            charCount = extData.charCount;
            showToast(`Loaded ${f.name} (${charCount ? charCount.toLocaleString() : 0} chars) for Document Q&A`);
          } else {
            throw new Error(`HTTP ${extRes.status}`);
          }
        } catch (err) {
          console.warn("API document extraction fallback to FileReader:", err);
          textContent = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string) || "");
            r.onerror = () => res("");
            r.readAsText(f);
          });
          charCount = textContent.length;
        }
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}-${i}`,
          name: f.name,
          size: `${(f.size / 1024).toFixed(1)} KB`,
          isImage: isImg,
          isAudio: f.type.startsWith("audio/"),
          dataUrl,
          textContent,
          charCount,
        },
      ]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast(`Attached ${files.length} file(s)`);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const loadSampleMultimodalPrompt = () => {
    if (activeRuntimeKey === "hermes") {
      setInput("Use Hermes Agentic flow with Reasoning: High to search the web for recent local LLM trends in 2026.");
    } else {
      setInput("Check if we need web search to find current weather in Jakarta, and synthesize the result.");
    }
    showToast("Loaded starter multimodal prompt");
  };

  // INTERRUPT GENERATION FEATURE
  const handleInterrupt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
    showToast("Process interrupted by user (■ Stop)");
  };

  // Send message and stream response (Checking runtime login/online status first)
  const submitMessage = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) {
      showToast("Type a prompt or attach an image");
      return;
    }
    if (isSending) return;

    // CHECK RUNTIME LOGIN / ONLINE STATUS BEFORE CHATTING
    if (!activeRuntime.online) {
      showToast(`Cannot chat: ${activeRuntime.name} is OFFLINE. Please start the server at ${activeRuntime.endpoint}.`);
      void scanModels();
      return;
    }

    const currentAttachments = [...attachments];
    const imagePayloads = currentAttachments
      .filter((a) => a.isImage && a.dataUrl)
      .map((a) => a.dataUrl as string);

    const docTextPayload = currentAttachments
      .filter((a) => a.textContent)
      .map((a) => `=== Document: ${a.name} ===\n${a.textContent}`)
      .join("\n\n");
    const docNamePayload = currentAttachments
      .filter((a) => a.textContent)
      .map((a) => a.name)
      .join(", ");

    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Snapshot CURRENT model and runtime for this message so it never changes retroactively!
    const capturedModelName = activeModel.name;
    const capturedRuntimeKey = activeRuntimeKey;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      time: nowStr,
      modelName: capturedModelName,
      runtimeKey: capturedRuntimeKey,
      text: text || (docNamePayload ? `[Analyze attached document: ${docNamePayload}]` : "[Attached file for inspection]"),
      attachments: currentAttachments,
    };

    const asstId = `asst-${Date.now()}`;
    const asstMsg: ChatMessage = {
      id: asstId,
      role: "assistant",
      time: nowStr,
      modelName: capturedModelName,
      runtimeKey: capturedRuntimeKey,
      text: "",
      think: "",
      expandedReasoning: true,
    };

    const nextMessages = [...messages, userMsg, asstMsg];
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setIsSending(true);

    // Setup AbortController for Interrupt feature
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 1. Ensure Session exists in Database
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      try {
        const title = text.slice(0, 40) || "Multimodal Chat";
        const sessRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            model: activeModel.id,
            runtime: activeRuntimeKey,
          }),
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          currentSessionId = String(sessData.id);
          setActiveSessionId(currentSessionId);
          setSessions((prev) => [
            {
              id: currentSessionId!,
              title,
              model: activeModel.id,
              runtime: activeRuntimeKey,
              createdAt: sessData.createdAt,
              lastMessageAt: sessData.createdAt,
            },
            ...prev,
          ]);
        }
      } catch (err) {
        console.error("Session creation error:", err);
      }
    }

    // 2. Persist User Message to Database
    if (currentSessionId) {
      fetch(`/api/sessions/${currentSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: userMsg.text,
          metadata: {
            modelName: capturedModelName,
            runtimeKey: capturedRuntimeKey,
            attachments: currentAttachments,
          },
        }),
      }).catch(() => {});
    }

    // 3. Dispatch to Inference API with AbortSignal
    try {
      const payloadMessages = nextMessages
        .filter((m) => m.role !== "assistant" || m.text)
        .map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          runtime: activeRuntimeKey,
          model: activeModel.id,
          reasoningLevel,
          temperature: temp,
          topP,
          maxTokens,
          systemPrompt,
          images: imagePayloads,
          documentText: docTextPayload || undefined,
          documentName: docNamePayload || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No stream returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let accumulatedThink = "";
      let capturedStepProcess: StepProcessInfo | undefined = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n").filter((l) => l.trim().length > 0);
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const dataStr = line.replace(/^data:\s*/, "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);

              // ─── AGENTIC STEP PROCESS METADATA EVENT ───
              if (parsed.stepProcess) {
                capturedStepProcess = parsed.stepProcess;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === asstId ? { ...m, stepProcess: capturedStepProcess } : m
                  )
                );
                continue;
              }

              // Text deltas
              const delta = parsed.choices?.[0]?.delta?.content || "";
              if (delta) {
                accumulated += delta;
                let clean = accumulated;
                let extractedThink = "";
                const thinkMatch = clean.match(/<think>([\s\S]*?)<\/think>/i);
                if (thinkMatch) {
                  extractedThink = thinkMatch[1].trim();
                  clean = clean.replace(thinkMatch[0], "").trim();
                } else if (clean.includes("<think>")) {
                  const sp = clean.split("<think>");
                  clean = sp[0];
                  extractedThink = sp[1];
                }
                accumulatedThink = extractedThink;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === asstId ? { ...m, text: clean, think: extractedThink } : m
                  )
                );
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 4. Persist Assistant Reply to Database
      if (currentSessionId && accumulated.trim()) {
        fetch(`/api/sessions/${currentSessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: accumulated.trim(),
            think: accumulatedThink.trim() || undefined,
            metadata: {
              modelName: capturedModelName,
              runtimeKey: capturedRuntimeKey,
              stepProcess: capturedStepProcess,
            },
          }),
        }).catch(() => {});
      }

      showToast("Inference completed");
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        // Interrupted gracefully by user
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId ? { ...m, text: `${m.text} \n\n*[Process interrupted]*` } : m
          )
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  text: `[Runtime Notice] Could not complete response: ${msg}. Check status for ${activeRuntime.name} at ${activeRuntime.endpoint}.`,
                }
              : m
          )
        );
        showToast(`Error: ${msg}`);
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submitMessage();
    }
  };

  const copyMessageText = (txt: string) => {
    navigator.clipboard.writeText(txt).then(() => {
      showToast("Response copied to clipboard");
    });
  };

  const exportChat = () => {
    const data = {
      runtime: activeRuntimeKey,
      model: activeModelId,
      reasoningLevel,
      database: dbSource,
      exportedAt: new Date().toISOString(),
      messages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mono-session-${Date.now()}.json`;
    a.click();
    showToast("Exported session JSON");
  };

  const filteredModels = activeRuntime.models.filter((m) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase().trim();
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (m.tag && m.tag.toLowerCase().includes(q))
    );
  });

  return (
    <div className="app-viewport">
      {/* ─── Minimal Window Header ──────────────────────────────────── */}
      <header className="window-chrome" data-od-id="window-chrome">
        <div className="chrome-left">
          <div className="window-dots">
            <div className="window-dot" style={{ background: "#ff5f56" }}></div>
            <div className="window-dot" style={{ background: "#ffbd2e" }}></div>
            <div className="window-dot" style={{ background: "#27c93f" }}></div>
          </div>
          <div className="url-pill" id="url-pill-text">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>mono.local // {activeRuntimeKey} ({activeRuntime.endpoint.replace("http://", "")})</span>
          </div>
        </div>

        <div className="chrome-right">
          <div
            className="runtime-badge"
            title={`Database: ${dbSource.toUpperCase()}`}
            style={{ borderColor: "var(--border)" }}
          >
            <span className="status-dot" style={{ background: "var(--success)" }}></span>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              {dbSource.toUpperCase()} DB
            </span>
          </div>

          <div className="runtime-badge">
            <span
              className="status-dot"
              style={{ background: activeRuntime.online ? "var(--success)" : "var(--danger)" }}
            ></span>
            <span id="header-status-text">
              {activeRuntimeKey.toUpperCase()} · {activeRuntime.online ? activeRuntime.latency : "OFFLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* ─── Main 2-Column Minimal Workspace ────────────────────────── */}
      <div className="app-body" data-od-id="app-body">
        {/* ─── Sidebar: Sessions & History from Database ───────────── */}
        <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`} id="sidebar" data-od-id="sidebar">
          <div className="sidebar-header">
            <div className="brand-row">
              <div className="brand-mark">
                <div className="brand-squircle">HQ</div>
                <span>Chatbot</span>
              </div>
              <button
                className="btn-icon"
                style={{ width: "24px", height: "24px" }}
                onClick={() => setSidebarCollapsed((p) => !p)}
                title="Collapse sidebar (⌘B)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                  <path d="M9 3v18"></path>
                </svg>
              </button>
            </div>

            <button className="btn-new-chat" onClick={startNewSession} title="Start new session (⌘N)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>New Chat</span>
            </button>
          </div>

          <div className="sidebar-sessions" id="sessions-container">
            <div className="sessions-label">
              <span>Recent Sessions</span>
              <span>{dbSource.toUpperCase()}</span>
            </div>

            {sessions.length > 0 ? (
              sessions.map((sess) => {
                const isActive = activeSessionId === sess.id;
                return (
                  <div
                    key={sess.id}
                    className={`session-item ${isActive ? "active" : ""}`}
                    onClick={() => switchSession(sess.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span className="session-title">{sess.title}</span>
                      <span
                        className="remove-chip-btn"
                        style={{ fontSize: "12px", opacity: 0.6 }}
                        onClick={(e) => deleteSession(e, sess.id)}
                        title="Delete session"
                      >
                        ✕
                      </span>
                    </div>
                    <div className="session-meta">
                      <span className="tag-chip">{sess.runtime?.toUpperCase() || "LLM"}</span>
                      <span>#{sess.id.slice(-6)}</span>
                      <span>· {sess.model?.slice(0, 15) || "Local"}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "16px", color: "var(--muted)", fontSize: "11px", textAlign: "center" }}>
                No past sessions yet. Start a new chat below.
              </div>
            )}
          </div>

          <div className="sidebar-footer">
            <div className="footer-host-info">
              <span>Hardware Target</span>
              <span>Apple Silicon Metal</span>
            </div>
            <div className="footer-host-info" style={{ color: "var(--fg)" }}>
              <span>Database Connection</span>
              <span>{dbSource.toUpperCase()} Postgres Pooler</span>
            </div>
          </div>
        </aside>

        {/* ─── Center: Focused Chat & Multimodal Canvas ─────────────── */}
        <main className="workspace" data-od-id="workspace">
          {/* Top Unified Control Bar */}
          <div className="top-controls-bar" data-od-id="top-controls">
            <div className="control-group-left">
              <button
                className="btn-icon"
                id="btn-sidebar-toggle"
                onClick={() => setSidebarCollapsed((p) => !p)}
                title="Toggle sidebar (⌘B)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                  <path d="M9 3v18"></path>
                </svg>
              </button>

              {/* 1. LOCAL RUNTIME SELECTOR */}
              <div className="runtime-picker-wrap">
                <span className="picker-label">Runtime</span>
                <select
                  className="select-clean"
                  id="runtime-selector"
                  value={activeRuntimeKey}
                  onChange={(e) => handleRuntimeChange(e.target.value)}
                >
                  <option value="lmstudio">LM Studio (127.0.0.1:1234)</option>
                  <option value="ollama">Ollama (127.0.0.1:11434)</option>
                  <option value="hermes">Hermes Local Agent (127.0.0.1:8642)</option>
                </select>
              </div>

              {/* Runtime Status Info & Check Button */}
              <div className="runtime-status-tag" id="runtime-info-tag">
                <span
                  className="status-dot"
                  style={{ background: activeRuntime.online ? "var(--success)" : "var(--danger)" }}
                ></span>
                <span id="runtime-mode-name">
                  {activeRuntime.name} {activeRuntime.online ? `[ONLINE · ${activeRuntime.latency}]` : "[OFFLINE]"}
                </span>
              </div>

              <button
                className="action-btn"
                style={{ padding: "3px 8px", fontSize: "11px" }}
                onClick={scanModels}
                title="Check connection and scan local models"
              >
                ↻ Check Status
              </button>
            </div>

            <div className="control-group-right">
              <button
                className="btn-secondary"
                onClick={() => setTuningOpen((p) => !p)}
                title="Sampling and prompt parameters"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>Tuning</span>
              </button>
              <button className="btn-secondary" onClick={exportChat} title="Export Markdown / JSON">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
                </svg>
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Parameters / Tuning Slide Popover */}
          <div className={`tuning-popover ${tuningOpen ? "open" : ""}`} id="tuning-popover">
            <div className="popover-header">
              <span className="popover-title">Inference Parameters</span>
              <button onClick={() => setTuningOpen(false)} style={{ cursor: "pointer", color: "var(--muted)", fontSize: "12px" }}>
                ✕
              </button>
            </div>

            <div className="param-field">
              <div className="param-label-row">
                <span>Temperature</span>
                <span id="lbl-temp">{temp.toFixed(2)}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min="0"
                max="1"
                step="0.05"
                value={temp}
                onChange={(e) => setTemp(parseFloat(e.target.value))}
              />
            </div>

            <div className="param-field">
              <div className="param-label-row">
                <span>Top-P Sampling</span>
                <span id="lbl-topp">{topP.toFixed(2)}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min="0.1"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
              />
            </div>

            <div className="param-field">
              <div className="param-label-row">
                <span>Max Output Tokens</span>
                <span id="lbl-tokens">{maxTokens}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min="512"
                max="16384"
                step="512"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="param-field">
              <div className="param-label-row">
                <span>System Prompt</span>
                <span style={{ color: "var(--muted)", fontSize: "10px" }}>Mono Agent Default</span>
              </div>
              <textarea
                style={{
                  width: "100%",
                  height: "60px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  padding: "6px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  resize: "none",
                }}
                id="system-prompt-input"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>
          </div>

          {/* ─── Messages & Canvas Scroll Area ──────────────────────── */}
          <div className="chat-container" id="chat-container" ref={chatScrollRef} data-od-id="chat-container">
            <div className="message-stream" id="message-stream">
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>◈</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--fg)" }}>
                    MONO | Agentic Multimodal Local LLM
                  </div>
                  <div style={{ fontSize: "12px", marginTop: "6px", color: "var(--fg-2)" }}>
                    Runtime: <strong>{activeRuntime.name}</strong> · Model: <strong>{activeModel.name}</strong>
                  </div>
                  <div style={{ fontSize: "11px", marginTop: "8px", color: "var(--muted)" }}>
                    Status: {activeRuntime.online ? `Ready (${activeRuntime.latency})` : "Offline — please start server"} · Database: {dbSource.toUpperCase()}
                  </div>
                  <div style={{ fontSize: "11px", marginTop: "16px", color: "var(--fg-2)" }}>
                    Dual-Model Architecture: <strong>d1-omni-600m</strong> evaluates decision &amp; tool routing (threshold 0.7) ➔ <strong>{activeModel.name}</strong> formulates plan &amp; answer.
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === "user";

                  return (
                    <div key={msg.id} className={`message-row ${isUser ? "user" : "assistant"}`}>
                      <div className="message-header">
                        <span className="message-author">
                          {!isUser && (
                            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "var(--fg)", borderRadius: "50%", marginRight: "6px" }}></span>
                          )}
                          <span>{isUser ? "You (Analyst)" : (msg.modelName || "Local LLM")}</span>
                          {!isUser && (
                            <span className="tag-chip" style={{ fontSize: "9px", marginLeft: "6px" }}>
                              {(msg.runtimeKey || "LLM").toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {isUser && msg.modelName && (
                            <span style={{ fontSize: "10px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                              Target: {msg.modelName}
                            </span>
                          )}
                          <span>{msg.time || "Just now"}</span>
                        </span>
                      </div>

                      <div className="message-box">
                        {/* ─── MULTIMODAL IMAGE PREVIEW IN CHATBOX ─── */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={{ marginBottom: "12px" }}>
                            {msg.attachments.map((att) => (
                              <div key={att.id} className="multimodal-attachment-card" style={{ marginBottom: "8px" }}>
                                <div className="attachment-card-top">
                                  <span className="attachment-badge">
                                    {att.isImage ? "IMAGE / VISION" : att.isAudio ? "AUDIO" : "DOCUMENT"}
                                  </span>
                                  <span>{att.name} · {att.size}</span>
                                </div>
                                {att.isImage && att.dataUrl && (
                                  <div
                                    className="attachment-preview-render"
                                    style={{
                                      padding: "10px",
                                      background: "var(--surface)",
                                      borderRadius: "var(--radius-sm)",
                                      marginTop: "6px",
                                    }}
                                  >
                                    <img
                                      src={att.dataUrl}
                                      alt={att.name}
                                      style={{
                                        maxWidth: "100%",
                                        maxHeight: "320px",
                                        objectFit: "contain",
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid var(--border)",
                                        display: "block",
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ─── AGENT EXECUTION TRACE (HERMES / CURSOR ACCORDION - IMAGE #2) ─── */}
                        {(msg.stepProcess || msg.think) && (
                          <div className="agent-execution-trace">
                            {/* 1. Document Context Step (if attached) */}
                            {msg.stepProcess?.documentContext && (
                              <div className="trace-step-item">
                                <button
                                  type="button"
                                  className="trace-step-btn"
                                  onClick={() => toggleStepExpand(msg.id, "doc")}
                                >
                                  <span className="trace-chevron">{expandedSteps[`${msg.id}-doc`] ? "▾" : "›"}</span>
                                  <span className="trace-icon">📄</span>
                                  <span className="trace-label">
                                    Document: {msg.stepProcess.documentContext.fileName}
                                  </span>
                                  <span className="trace-sub">
                                    ({msg.stepProcess.documentContext.charCount.toLocaleString()} chars · Q&A Context)
                                  </span>
                                </button>
                                {expandedSteps[`${msg.id}-doc`] && (
                                  <div className="trace-step-content">
                                    <div><strong>Active Document:</strong> {msg.stepProcess.documentContext.fileName}</div>
                                    <div><strong>Context Size:</strong> {msg.stepProcess.documentContext.charCount.toLocaleString()} characters</div>
                                    <div style={{ marginTop: "4px", color: "var(--muted)", fontSize: "10px" }}>
                                      Grounding Q&A answers strictly and faithfully on this document&apos;s text.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 2. Decision Model Step */}
                            {msg.stepProcess?.decision && (
                              <div className="trace-step-item">
                                <button
                                  type="button"
                                  className="trace-step-btn"
                                  onClick={() => toggleStepExpand(msg.id, "decision")}
                                >
                                  <span className="trace-chevron">{expandedSteps[`${msg.id}-decision`] ? "▾" : "›"}</span>
                                  <span className="trace-icon">◈</span>
                                  <span className="trace-label">
                                    {msg.stepProcess.decision.tool === "web_search"
                                      ? "Decision: Web Search Required"
                                      : msg.stepProcess.decision.tool === "calculator"
                                      ? "Decision: Calculation Required"
                                      : msg.stepProcess.decision.tool === "document_qna"
                                      ? "Decision: Document Q&A Analysis"
                                      : "Decision: Base Knowledge"}
                                  </span>
                                  <span className="trace-sub">
                                    ({msg.stepProcess.decision.gateModel} · {msg.stepProcess.decision.latencyMs}ms · {Math.round(msg.stepProcess.decision.confidence * 100)}%)
                                  </span>
                                </button>
                                {expandedSteps[`${msg.id}-decision`] && (
                                  <div className="trace-step-content">
                                    <div><strong>Intent:</strong> {msg.stepProcess.decision.intent}</div>
                                    <div><strong>Routing Policy:</strong> {msg.stepProcess.decision.tool === "web_search" ? "Web Search Tool Triggered" : msg.stepProcess.decision.tool === "calculator" ? "Math Calculation Triggered" : msg.stepProcess.decision.tool === "document_qna" ? "Document Q&A Analysis Engine" : "Direct Parametric Knowledge"}</div>
                                    <div><strong>Confidence:</strong> {Math.round(msg.stepProcess.decision.confidence * 100)}% (Threshold: 70%)</div>
                                    {msg.stepProcess.decision.rationale && <div><strong>Rationale:</strong> {msg.stepProcess.decision.rationale}</div>}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 2. Tool Execution Step (if used) */}
                            {msg.stepProcess?.toolExecution && (
                              <div className="trace-step-item">
                                <button
                                  type="button"
                                  className="trace-step-btn"
                                  onClick={() => toggleStepExpand(msg.id, "tool")}
                                >
                                  <span className="trace-chevron">{expandedSteps[`${msg.id}-tool`] ? "▾" : "›"}</span>
                                  <span className="trace-icon">
                                    {msg.stepProcess.toolExecution.tool === "web_search" ? "🌐" : "🔢"}
                                  </span>
                                  <span className="trace-label">
                                    {msg.stepProcess.toolExecution.tool === "web_search"
                                      ? `Web Search: "${msg.stepProcess.toolExecution.query || ""}"`
                                      : msg.stepProcess.toolExecution.resultSummary}
                                  </span>
                                  {msg.stepProcess.toolExecution.sources && (
                                    <span className="trace-sub">
                                      ({msg.stepProcess.toolExecution.sources.length} sources · {msg.stepProcess.toolExecution.latencyMs || 0}ms)
                                    </span>
                                  )}
                                </button>
                                {expandedSteps[`${msg.id}-tool`] && msg.stepProcess.toolExecution.sources && (
                                  <div className="trace-step-content">
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                      {msg.stepProcess.toolExecution.sources.map((src, sIdx) => (
                                        <div key={sIdx} style={{ fontSize: "11px" }}>
                                          <a
                                            href={src.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: "var(--fg)", textDecoration: "underline", fontWeight: 500 }}
                                          >
                                            📄 {src.title}
                                          </a>
                                          {src.snippet && <div style={{ color: "var(--muted)", marginTop: "2px", fontSize: "10px" }}>{src.snippet}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 3. Thought / Reasoning Accordion (Thought >) */}
                            {msg.think && (
                              <div className="trace-step-item">
                                <button
                                  type="button"
                                  className="trace-step-btn"
                                  onClick={() => {
                                    setMessages((prev) =>
                                      prev.map((m) => (m.id === msg.id ? { ...m, expandedReasoning: !m.expandedReasoning } : m))
                                    );
                                  }}
                                >
                                  <span className="trace-chevron">{msg.expandedReasoning ? "▾" : "›"}</span>
                                  <span className="trace-label">Thought</span>
                                  <span className="trace-sub">({reasoningLevel} reasoning)</span>
                                </button>
                                {msg.expandedReasoning && (
                                  <div className="trace-step-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.think}</ReactMarkdown>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Text Message Content */}
                        <div className="markdown" style={{ fontSize: "13px", lineHeight: 1.55 }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text || (isSending && !isUser ? "Generating tokens..." : "")}
                          </ReactMarkdown>
                        </div>

                        {/* Metrics Footer */}
                        {!isUser && msg.text && (
                          <div className="message-metrics-footer">
                            <div className="metrics-tags">
                              {msg.stepProcess?.decision?.latencyMs && (
                                <span className="metric-pill">Decision: <strong>{msg.stepProcess.decision.latencyMs}ms</strong></span>
                              )}
                              <span className="metric-pill">Model: <strong>{msg.modelName || "Local LLM"}</strong></span>
                              <span className="metric-pill">Runtime: <strong>{(msg.runtimeKey || "local").toUpperCase()}</strong></span>
                              <span className="metric-pill">Device: <strong>Apple Silicon Metal</strong></span>
                            </div>
                            <button className="action-btn" onClick={() => copyMessageText(msg.text)}>
                              Copy Response
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div id="dynamic-anchor"></div>
            </div>
          </div>

          {/* ─── Bottom Composer (Bottom Input Area with Beside-Send Controls) ─── */}
          <div className="composer-container" data-od-id="composer">
            {/* Attachment Previews Tray */}
            {attachments.length > 0 && (
              <div className="attachment-tray" id="attachment-tray" style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "6px 8px" }}>
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="tray-chip"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    {att.isImage && att.dataUrl ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        style={{ width: "24px", height: "24px", objectFit: "cover", borderRadius: "3px", border: "1px solid var(--border)" }}
                      />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    )}
                    <span style={{ fontSize: "11px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.name} {att.charCount ? `(${att.charCount.toLocaleString()} chars · Q&A Ready)` : `(${att.size})`}
                    </span>
                    <span
                      className="remove-chip-btn"
                      style={{ cursor: "pointer", marginLeft: "4px", fontSize: "12px", opacity: 0.6 }}
                      onClick={() => removeAttachment(att.id)}
                    >
                      ✕
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="composer-box">
              <textarea
                className="composer-textarea"
                id="prompt-input"
                placeholder={
                  activeRuntime.online
                    ? `Message ${activeModel.name} (${activeRuntime.name})...`
                    : `[${activeRuntime.name} is offline. Click 'Check Status' or start local server]`
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={isSending}
              ></textarea>

              <div className="composer-bottom-bar">
                {/* Left Action Controls */}
                <div className="composer-actions-left">
                  <button className="action-btn" onClick={triggerFileInput} title="Attach image or document for Q&A">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                    </svg>
                    <span>Attach File / Doc</span>
                  </button>

                  <button
                    className={`action-btn ${isRecording ? "active-record" : ""}`}
                    id="btn-mic"
                    onClick={toggleVoiceRecord}
                    title="Speak prompt via Whisper / Web Speech"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"></path>
                    </svg>
                    <span id="mic-label">{isRecording ? "Listening..." : "Voice"}</span>
                  </button>

                  <button className="action-btn" onClick={loadSampleMultimodalPrompt} title="Load sample agentic prompt">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    <span>Starter</span>
                  </button>

                  <div className="flow-indicator-pill active" id="flow-pill-indicator">
                    <span
                      className="flow-dot"
                      style={{ background: activeRuntime.online ? "var(--success)" : "var(--danger)" }}
                    ></span>
                    <span id="flow-pill-text">
                      {activeRuntime.online
                        ? activeModel.isHybrid
                          ? "AGENTIC (d1-omni + qwen3.5)"
                          : activeModel.isAgentic
                          ? `HERMES AGENT (${activeModel.name})`
                          : "AGENTIC INFERENCE"
                        : `${activeRuntimeKey.toUpperCase()} OFFLINE`}
                    </span>
                  </div>
                </div>

                {/* Right Action Controls (Positioned Beside Send Chat) */}
                <div className="composer-actions-right">
                  {/* 1. Reasoning Level Selector */}
                  <div className="reasoning-picker-wrap" id="reasoning-picker-wrap">
                    <button
                      className="btn-reasoning-level"
                      id="btn-reasoning-level"
                      disabled={!modelHasReasoning}
                      onClick={() => {
                        if (modelHasReasoning) {
                          setReasoningDropdownOpen((p) => !p);
                          setModelPopoverOpen(false);
                        }
                      }}
                      title="Select reasoning budget level"
                    >
                      <span className={`reasoning-dot ${!modelHasReasoning ? "disabled" : ""}`} id="reasoning-status-dot"></span>
                      <span className="reasoning-label-text">Reasoning:</span>
                      <span className="reasoning-val-text" id="reasoning-level-val">
                        {modelHasReasoning ? reasoningLevel : "None"}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {/* Reasoning Level Dropdown */}
                    <div className={`reasoning-dropdown-menu ${reasoningDropdownOpen ? "open" : ""}`} id="reasoning-dropdown">
                      <div className="dropdown-header-sm">
                        <span>Reasoning Effort</span>
                        <span id="reasoning-model-context">{activeModel.id} [Thinking OK]</span>
                      </div>

                      <button
                        className={`reasoning-opt ${reasoningLevel === "High" ? "active" : ""}`}
                        onClick={() => {
                          setReasoningLevel("High");
                          setReasoningDropdownOpen(false);
                          showToast("Reasoning effort set to: High");
                        }}
                      >
                        <div className="opt-main">
                          <span className="opt-name">High</span>
                          <span className="badge-tag highlight">DEEP</span>
                        </div>
                        <span className="opt-desc">Extended chain-of-thought &amp; subagent decomposition</span>
                      </button>

                      <button
                        className={`reasoning-opt ${reasoningLevel === "Medium" ? "active" : ""}`}
                        onClick={() => {
                          setReasoningLevel("Medium");
                          setReasoningDropdownOpen(false);
                          showToast("Reasoning effort set to: Medium");
                        }}
                      >
                        <div className="opt-main">
                          <span className="opt-name">Medium</span>
                          <span className="badge-tag">BALANCED</span>
                        </div>
                        <span className="opt-desc">Balanced analytical reasoning &amp; standard trace</span>
                      </button>

                      <button
                        className={`reasoning-opt ${reasoningLevel === "Low" ? "active" : ""}`}
                        onClick={() => {
                          setReasoningLevel("Low");
                          setReasoningDropdownOpen(false);
                          showToast("Reasoning effort set to: Low");
                        }}
                      >
                        <div className="opt-main">
                          <span className="opt-name">Low</span>
                          <span className="badge-tag">FAST</span>
                        </div>
                        <span className="opt-desc">Concise verification tokens &amp; fast latency</span>
                      </button>

                      <button
                        className={`reasoning-opt ${reasoningLevel === "Off" ? "active" : ""}`}
                        onClick={() => {
                          setReasoningLevel("Off");
                          setReasoningDropdownOpen(false);
                          showToast("Reasoning effort set to: Off");
                        }}
                      >
                        <div className="opt-main">
                          <span className="opt-name">Off / Direct</span>
                          <span className="badge-tag">DIRECT</span>
                        </div>
                        <span className="opt-desc">Zero reasoning token overhead, instant response</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Model Selector Pill & Popover Menu (Modeled on image-1.png) */}
                  <div className="model-picker-wrap-bottom" id="model-picker-wrap-bottom">
                    <button
                      className="btn-active-model-pill"
                      id="btn-active-model-pill"
                      onClick={() => {
                        const next = !modelPopoverOpen;
                        setModelPopoverOpen(next);
                        setReasoningDropdownOpen(false);
                        if (next) {
                          void scanModels(activeRuntimeKey);
                        }
                      }}
                      title="Choose model from local runtime"
                    >
                      <span className="model-pill-icon">◈</span>
                      <span className="model-pill-name" id="model-pill-name">{activeModel.name}</span>
                      <span className="model-pill-badge" id="model-pill-badge">{activeModel.badge || "LOCAL"}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {/* Popover Dropdown matching image-1.png */}
                    <div className={`model-popover-menu ${modelPopoverOpen ? "open" : ""}`} id="model-popover-menu">
                      {/* Search models input */}
                      <div className="popover-search-box">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                          type="text"
                          className="popover-search-input"
                          id="popover-search-input"
                          placeholder="Search models..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          autoComplete="off"
                        />
                        <span className="search-kbd">ESC</span>
                      </div>

                      {/* Provider Header */}
                      <div className="popover-section-label">
                        <span id="popover-runtime-label">
                          {activeRuntime.name.toUpperCase()} ({activeRuntime.endpoint.replace("http://", "")})
                        </span>
                        <span className="badge-tag">LOCAL</span>
                      </div>

                      {/* Models List Scroll Area */}
                      <div className="popover-models-scroll" id="popover-models-scroll">
                        {filteredModels.length === 0 ? (
                          <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                            No models found matching &quot;{searchFilter}&quot;
                          </div>
                        ) : (
                          filteredModels.map((m) => {
                            const isActive = m.id === activeModelId;
                            const isStarred = !!favorites[m.id];
                            return (
                              <div
                                key={m.id}
                                className={`popover-model-item ${isActive ? "active" : ""}`}
                                onClick={() => selectModelFromPopover(m.id)}
                              >
                                <span
                                  className={`star-btn ${isStarred ? "starred" : ""}`}
                                  onClick={(e) => toggleStar(e, m.id)}
                                  title="Favorite model"
                                >
                                  ★
                                </span>
                                <div className="popover-item-info">
                                  <span className="popover-item-name">{m.name}</span>
                                  <span className="popover-item-sub">
                                    {m.size || "Local"} · {m.context || "32k"} {m.desc ? `· ${m.desc}` : ""}
                                  </span>
                                </div>
                                <div className="popover-item-badges">
                                  {m.badge && (
                                    <span className={`badge-tag ${m.badge === "HIGH" || m.badge === "AGENT" || m.badge === "FLASH" ? "highlight" : ""}`}>
                                      {m.badge}
                                    </span>
                                  )}
                                  {m.hasReasoning && (
                                    <span className="badge-tag" title="Supports thinking tokens">
                                      ⚡ THINK
                                    </span>
                                  )}
                                </div>
                                <span className="item-check-icon" style={{ opacity: isActive ? 1 : 0 }}>
                                  ✓
                                </span>
                                <span className="item-chevron">›</span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Popover Footer Utility Actions */}
                      <div className="popover-footer-actions">
                        <button className="popover-footer-btn" onClick={scanModels}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                          </svg>
                          <span>Refresh models</span>
                        </button>

                        <button className="popover-footer-btn" onClick={promptAddCustomModel}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          <span>Add custom model...</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3. Send / Interrupt Button */}
                  {isSending ? (
                    <button
                      className="btn-send"
                      id="btn-interrupt-chat"
                      onClick={handleInterrupt}
                      title="Interrupt generation (Esc)"
                      style={{ background: "#c53030", borderColor: "#c53030", color: "#ffffff" }}
                    >
                      <span style={{ display: "inline-block", width: "9px", height: "9px", background: "#ffffff", borderRadius: "2px" }}></span>
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      className="btn-send"
                      id="btn-send-chat"
                      onClick={submitMessage}
                      title="Send prompt (⌘↵)"
                    >
                      <span>Send</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.markdown,.json,.csv,.ts,.js,.py,.html,.xml,.doc,.docx"
        style={{ display: "none" }}
        onChange={handleIncomingFiles}
      />

      {/* Toast Notification Box */}
      {toastMessage && <div className="toast-box show" id="toast-box">{toastMessage}</div>}
    </div>
  );
}
