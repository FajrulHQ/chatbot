"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  think?: string;
};

type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};

type StoredMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

const initialMessages: ChatMessage[] = [];
const SPEECH_FLUSH_CHARS = 140;

export default function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [thinkEnabled, setThinkEnabled] = useState(false);
  const [expandedThink, setExpandedThink] = useState<Record<string, boolean>>(
    {}
  );
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const [docError, setDocError] = useState("");
  const [docStatus, setDocStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const conversationModeRef = useRef(false);
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const speechBufferRef = useRef("");
  const spokenIndexRef = useRef(0);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stripThink = (content: string) =>
    content
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*/gi, "");

  const splitThink = (content: string) => {
    const match = content.match(/<think>([\s\S]*?)<\/think>/i);
    if (!match) {
      return { answer: stripThink(content).trim(), think: "" };
    }
    const think = match[1].trim();
    const answer = content.replace(match[0], "").trim();
    return { answer, think };
  };

  const extractPdfText = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => (item as { str?: string }).str ?? "")
        .join(" ");
      fullText += `${pageText}\n`;
    }
    return fullText.trim();
  };

  const loadSessions = async () => {
    setSessionStatus("");
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }
      const data = (await response.json()) as { sessions?: SessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch (error) {
      setSessionStatus("Unable to load sessions.");
    }
  };

  const bumpSession = (sessionId: string) => {
    setSessions((prev) => {
      const index = prev.findIndex((item) => item.id === sessionId);
      if (index === -1) return prev;
      const updated = [...prev];
      const [session] = updated.splice(index, 1);
      return [session, ...updated];
    });
  };

  const handleSelectSession = async (sessionId: string) => {
    setIsLoadingSession(true);
    setSessionStatus("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error("Failed to load session");
      }
      const data = (await response.json()) as { messages?: StoredMessage[] };
      const nextMessages =
        data.messages
          ?.filter((message) => message.role !== "system")
          .map((message) => ({
            id: `db-${message.id}`,
            role: message.role === "assistant" ? "assistant" : "user",
            text: message.content,
          })) ?? [];
      setMessages(nextMessages);
      setExpandedThink({});
      setActiveSessionId(sessionId);
      bumpSession(sessionId);
    } catch (error) {
      setSessionStatus("Unable to load session history.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Delete this chat session?")) return;
    setSessionStatus("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete session");
      }
      setSessions((prev) => prev.filter((item) => item.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
        setExpandedThink({});
      }
    } catch (error) {
      setSessionStatus("Unable to delete session.");
    }
  };

  const createSession = async (title: string) => {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error("Failed to create session");
    }
    const data = (await response.json()) as {
      id: string;
      title: string;
      createdAt: string;
    };
    const newSession: SessionSummary = {
      id: data.id,
      title: data.title,
      createdAt: data.createdAt,
      lastMessageAt: data.createdAt,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(data.id);
    return data.id;
  };

  const ensureSession = async (title: string) => {
    if (activeSessionId) return activeSessionId;
    const sessionId = await createSession(title);
    return sessionId;
  };

  const persistMessage = async (
    sessionId: string,
    role: "user" | "assistant",
    content: string
  ) => {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  };

  const handleNewChat = () => {
    setMessages([]);
    setExpandedThink({});
    setActiveSessionId(null);
    setSessionStatus("");
  };

  useEffect(() => {
    conversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  useEffect(() => {
    speakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as typeof window & {
        webkitSpeechRecognition?: typeof window.SpeechRecognition;
      }).SpeechRecognition ||
      (window as typeof window & {
        webkitSpeechRecognition?: typeof window.SpeechRecognition;
      }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("Voice input unavailable in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        transcript += text;
        if (result.isFinal) {
          finalTranscript += text;
        }
      }
      if (finalTranscript.trim()) {
        finalTranscriptRef.current += finalTranscript;
      }
      setInput(transcript.trimStart());
    };

    recognition.onstart = () => {
      startingRef.current = false;
      setIsListening(true);
      setVoiceStatus("Listening…");
    };
    recognition.onend = () => {
      startingRef.current = false;
      setIsListening(false);
      setVoiceStatus(conversationModeRef.current ? "Ready to respond…" : "");
      if (!conversationModeRef.current || speakingRef.current) return;
      const finalText = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = "";
      if (finalText) {
        void handleSend(finalText);
      }
    };
    recognition.onnomatch = () => {
      startingRef.current = false;
      setIsListening(false);
    };
    recognition.onerror = () => {
      startingRef.current = false;
      setIsListening(false);
      setVoiceStatus("Mic error. Check permissions.");
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.stop();
    };
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocError("");
    setDocStatus("");
    if (file.size > 2_000_000) {
      setDocError("File too large. Please use a file under 2MB.");
      return;
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    try {
      if (isPdf) {
        setDocStatus("Extracting text from PDF…");
      }
      const text = isPdf ? await extractPdfText(file) : await file.text();
      if (!text.trim()) {
        setDocError("No readable text found in this file.");
        return;
      }
      setDocText(text);
      setDocName(file.name);
    } catch (error) {
      setDocError("Unable to read file.");
    } finally {
      setDocStatus("");
    }
  };

  const clearDocument = () => {
    setDocText("");
    setDocName("");
    setDocError("");
    setDocStatus("");
  };

  const startRecognitionIfIdle = () => {
    const recognition = recognitionRef.current;
    if (!recognition || listeningRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      recognition.start();
    } catch (error) {
      startingRef.current = false;
    }
  };

  const enqueueSpeech = (chunk: string, flush = false) => {
    if (typeof window === "undefined") return Promise.resolve();
    if (!("speechSynthesis" in window)) {
      setVoiceStatus("Voice output unavailable in this browser.");
      return Promise.resolve();
    }
    speechBufferRef.current += chunk;
    const buffer = speechBufferRef.current;
    const shouldFlush =
      flush ||
      buffer.length >= SPEECH_FLUSH_CHARS ||
      /[.!?。！？]\s*$/.test(buffer);
    if (!shouldFlush) return Promise.resolve();
    const toSpeak = buffer.trim();
    speechBufferRef.current = "";
    if (!toSpeak) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(toSpeak);
      utterance.lang = "en-US";
      utterance.onstart = () => {
        setIsSpeaking(true);
        setVoiceStatus("Speaking…");
      };
      utterance.onend = () => {
        const synth = window.speechSynthesis;
        const stillSpeaking = synth.speaking || synth.pending;
        if (!stillSpeaking && !speechBufferRef.current.trim()) {
          setIsSpeaking(false);
          setVoiceStatus(conversationModeRef.current ? "Listening…" : "");
          if (conversationModeRef.current) {
            startRecognitionIfIdle();
          }
        }
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setVoiceStatus("Speech output error.");
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  };

  const handleSend = async (overrideInput?: string) => {
    const trimmed = (overrideInput ?? input).trim();
    if (!trimmed || isSending) return;
    setSessionStatus("");
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: trimmed,
    };
    const assistantId = `${Date.now()}-assistant`;
    const nextMessages = [
      ...messages,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        think: "",
      },
    ];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    finalTranscriptRef.current = "";
    speechBufferRef.current = "";
    spokenIndexRef.current = 0;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    let sessionId: string | null = activeSessionId;
    const sessionTitle =
      trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
    try {
      sessionId = await ensureSession(sessionTitle);
      if (sessionId) {
        await persistMessage(sessionId, "user", trimmed);
        bumpSession(sessionId);
      }
    } catch (error) {
      setSessionStatus("Unable to save this chat to history.");
    }

    try {
      const systemPrompt = thinkEnabled
        ? "Include a <think>...</think> section with concise reasoning, followed by the final answer."
        : "Respond with only the final answer. Do not include <think> tags or hidden reasoning. /no_think";

      const payloadMessages = [
        { role: "system", content: systemPrompt },
        ...nextMessages
          .filter((message) => message.role !== "assistant" || message.text)
          .map((message) => ({
            role: message.role,
            content: message.text,
          })),
      ];

      const response = await fetch(docText ? "/api/rag" : "/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payloadMessages,
          documentText: docText || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("LM Studio request failed");
      }

      if (!response.body) {
        throw new Error("No stream returned");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let finalAnswer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.replace("data:", "").trim();
            if (data === "[DONE]") {
              break;
            }
            try {
              const payload = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const delta = payload.choices?.[0]?.delta?.content ?? "";
              if (!delta) continue;
              accumulated += delta;
              const { answer, think } = thinkEnabled
                ? splitThink(accumulated)
                : {
                    answer: stripThink(accumulated).trim(),
                    think: "",
                  };
              finalAnswer = answer;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        text: answer,
                        think,
                      }
                    : message
                )
              );
              if (isConversationMode) {
                const speechSafe = stripThink(accumulated);
                const speechDelta = speechSafe.slice(
                  spokenIndexRef.current
                );
                spokenIndexRef.current = speechSafe.length;
                if (speechDelta) {
                  void enqueueSpeech(speechDelta);
                }
              }
            } catch (parseError) {
              continue;
            }
          }
        }
      }

      if (isConversationMode) {
        await enqueueSpeech("", true);
        if (!speakingRef.current && !speechBufferRef.current.trim()) {
          startRecognitionIfIdle();
        }
      }

      if (sessionId && finalAnswer.trim()) {
        try {
          await persistMessage(sessionId, "assistant", finalAnswer.trim());
          bumpSession(sessionId);
        } catch (error) {
          setSessionStatus("Assistant reply was not saved.");
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: "Sorry, I couldn't reach the local model. Is LM Studio running?",
              }
            : message
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const toggleConversation = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setVoiceStatus("Voice input unavailable in this browser.");
      return;
    }
    setIsConversationMode((prev) => {
      const next = !prev;
      if (next) {
        finalTranscriptRef.current = "";
        speechBufferRef.current = "";
        startRecognitionIfIdle();
        setVoiceStatus("Listening…");
      } else {
        recognition.stop();
        window.speechSynthesis?.cancel();
        speechBufferRef.current = "";
        setVoiceStatus("");
      }
      return next;
    });
  };

  const toggleThink = (id: string) => {
    setExpandedThink((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#efece6] text-[#1b1c19]">
      <div className="pointer-events-none absolute -left-24 top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,_#b8d7c4,_transparent_70%)] opacity-70" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,_#f3c7a2,_transparent_70%)] opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(239,236,230,0))]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:px-8">
        <aside className="hidden w-64 shrink-0 rounded-[28px] border border-black/10 bg-white/75 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.45)] backdrop-blur lg:flex lg:flex-col lg:gap-8 fade-up">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#5b5f54]">
              Sessions
            </span>
            <span className="rounded-full border border-black/10 px-2 py-1 text-[11px] font-medium text-[#3a3d34]">
              Pro
            </span>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-full border border-black/10 bg-[#1b1c19] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5"
          >
            + New Chat
          </button>
          <div className="space-y-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7a7d72]">
              History
            </p>
            <div className="space-y-3">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-[#2a2c26] transition ${
                      activeSessionId === session.id
                        ? "border-[#c77c4e] bg-[#f3c7a2]/70"
                        : "border-black/5 bg-white/70 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{session.title}</p>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a7d72]">
                          Session #{session.id}
                        </p>
                      </div>
                      <div
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteSession(session.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full cursor-pointer text-[12px] text-[#6a6d62] transition hover:-translate-y-0.5"
                        aria-label="Delete session"
                      >
                        ×
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-xs text-[#7a7d72]">
                  No sessions yet.
                </div>
              )}
            </div>
            {isLoadingSession ? (
              <p className="text-xs text-[#6a6d62]">Loading session…</p>
            ) : null}
            {sessionStatus ? (
              <p className="text-xs text-[#c77c4e]">{sessionStatus}</p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-[82vh] flex-1 flex-col rounded-[36px] border border-black/10 bg-white/80 shadow-[0_40px_120px_-60px_rgba(21,20,16,0.85)] backdrop-blur fade-up-delay">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/5 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7b7d72]">
                Assistant
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1b1c19]">
                AI Chatbot
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="rounded-full border border-black/10 bg-[#f7f2e9] px-3 py-2 text-[#4f5148]">
                qwen3-4b · Local
              </span>
              <span className="rounded-full border border-black/10 bg-white px-3 py-2 text-[#4f5148]">
                Temp 0.7
              </span>
              {docName ? (
                <span className="rounded-full border border-black/10 bg-white px-3 py-2 text-[#4f5148]">
                  RAG · {docName}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setThinkEnabled((prev) => !prev)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                  thinkEnabled
                    ? "border-[#c77c4e] bg-[#f3c7a2] text-[#1b1c19]"
                    : "border-black/10 bg-white text-[#4f5148]"
                }`}
              >
                Think {thinkEnabled ? "On" : "Off"}
              </button>
            </div>
          </header>

          <section
            ref={chatBodyRef}
            className="flex flex-col h-[65vh] gap-6 overflow-y-auto px-6 py-8"
          >
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${
                    message.role === "user"
                      ? "bg-[#1b1c19] text-white"
                      : "bg-[#d7e3d1] text-[#1b1c19]"
                  }`}
                >
                  {message.role === "user" ? "You" : "AI"}
                </div>
                <div className="max-w-xl space-y-3">
                  {thinkEnabled && message.role === "assistant" && message.think ? (
                    <div className="px-3 py-2 text-[11px] text-[#6a6d62]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-[0.2em]">
                          Think
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleThink(message.id)}
                          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6a6d62] transition hover:text-[#1b1c19]"
                        >
                          {expandedThink[message.id] ? "Hide" : "Show"}
                        </button>
                      </div>
                      {expandedThink[message.id] ? (
                        <div className="mt-2 rounded-2xl bg-[#f7f2e9] px-3 py-2 text-[12px] leading-5 text-[#5a5d53]">
                          <ReactMarkdown
                            className="markdown"
                            remarkPlugins={[remarkGfm]}
                          >
                            {message.think}
                          </ReactMarkdown>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={`rounded-[24px] border border-black/5 px-5 py-4 text-sm leading-6 text-[#2b2d28] ${
                      message.role === "user"
                        ? "bg-[#f7f2e9]"
                        : "bg-white shadow-[0_16px_40px_-32px_rgba(0,0,0,0.6)]"
                    }`}
                  >
                    <ReactMarkdown
                      className="markdown"
                      remarkPlugins={[remarkGfm]}
                    >
                      {message.text ||
                        (thinkEnabled && message.role === "assistant"
                          ? "Thinking..."
                          : "")}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </section>

          <footer className="border-t border-black/5 px-6 py-5">
            <form
              className="flex flex-col gap-3 rounded-[24px] border border-black/10 bg-white px-4 py-3 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.6)]"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#6a6d62]">
                <label
                  className="cursor-pointer rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f5148] transition hover:-translate-y-0.5"
                  htmlFor="rag-file"
                >
                  Upload File
                </label>
                <input
                  id="rag-file"
                  type="file"
                  accept=".txt,.md,.csv,.json,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {docName ? (
                  <>
                    <span className="rounded-full border border-black/10 bg-[#f7f2e9] px-3 py-2 text-[11px] text-[#4f5148]">
                      {docName}
                    </span>
                    <button
                      type="button"
                      onClick={clearDocument}
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f5148] transition hover:-translate-y-0.5"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-[#8a8d82]">
                    Upload a text file to enable RAG.
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="flex-1 rounded-full border border-black/10 bg-[#fdfbf7] px-4 py-3 text-sm text-[#1b1c19] placeholder:text-[#9b9e93] focus:outline-none focus:ring-2 focus:ring-[#c4d4c5]"
                  placeholder="Message AI..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isSending}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleConversation}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg transition ${
                      isConversationMode
                        ? "border-[#c77c4e] bg-[#f3c7a2] text-[#1b1c19] shadow-[0_10px_20px_-12px_rgba(0,0,0,0.6)]"
                        : "border-black/10 bg-white text-[#1b1c19] hover:-translate-y-0.5"
                    }`}
                    aria-pressed={isConversationMode}
                    aria-label="Toggle conversation mode"
                  >
                    {isConversationMode ? "●" : "🎙️"}
                  </button>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="rounded-full bg-[#1b1c19] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5"
                  >
                    {isSending ? "Thinking..." : "Send"}
                  </button>
                </div>
              </div>
              {isSending ? (
                <p className="text-xs text-[#6a6d62]">
                  Streaming from LM Studio…
                </p>
              ) : null}
              {docStatus ? (
                <p className="text-xs text-[#6a6d62]">{docStatus}</p>
              ) : null}
              {docError ? (
                <p className="text-xs text-[#c77c4e]">{docError}</p>
              ) : null}
              {voiceStatus ? (
                <p className="text-xs text-[#c77c4e]">{voiceStatus}</p>
              ) : null}
              {sessionStatus ? (
                <p className="text-xs text-[#c77c4e] lg:hidden">
                  {sessionStatus}
                </p>
              ) : null}
              <p className="text-xs text-[#9b9e93]">
                AI can make mistakes. Consider checking important details.
              </p>
            </form>
          </footer>
        </main>
      </div>
    </div>
  );
}
