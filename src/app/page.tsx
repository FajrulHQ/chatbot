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

const initialMessages: ChatMessage[] = [];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [thinkEnabled, setThinkEnabled] = useState(false);
  const [expandedThink, setExpandedThink] = useState<Record<string, boolean>>(
    {}
  );
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const [docError, setDocError] = useState("");
  const [docStatus, setDocStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const splitThink = (content: string) => {
    const match = content.match(/<think>([\s\S]*?)<\/think>/i);
    if (!match) {
      return { answer: content, think: "" };
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
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript.trimStart());
    };

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening…");
    };
    recognition.onend = () => {
      setIsListening(false);
      setVoiceStatus("");
    };
    recognition.onerror = () => {
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

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
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
                    answer: accumulated
                      .replace(/<think>[\s\S]*?<\/think>/gi, "")
                      .trim(),
                    think: "",
                  };
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
            } catch (parseError) {
              continue;
            }
          }
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

  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setVoiceStatus("Voice input unavailable in this browser.");
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    recognition.start();
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
          <button className="rounded-full border border-black/10 bg-[#1b1c19] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5">
            + New Chat
          </button>
          <div className="space-y-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7a7d72]">
              Yesterday
            </p>
            <div className="space-y-3">
              {[
                "Landing page copy refresh",
                "Prompt set for brand tone",
                "AI research summary",
                "Design review notes",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-[#2a2c26]"
                >
                  {item}
                </div>
              ))}
            </div>
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
                      {message.text}
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
                    onClick={toggleListening}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg transition ${
                      isListening
                        ? "border-[#c77c4e] bg-[#f3c7a2] text-[#1b1c19] shadow-[0_10px_20px_-12px_rgba(0,0,0,0.6)]"
                        : "border-black/10 bg-white text-[#1b1c19] hover:-translate-y-0.5"
                    }`}
                    aria-pressed={isListening}
                    aria-label="Toggle voice input"
                  >
                    {isListening ? "●" : "🎙️"}
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
