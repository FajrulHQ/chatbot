"use client";

import { useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const initialMessages: ChatMessage[] = [];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: trimmed,
    };
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: "Got it. Want this shorter, more formal, or tailored to a specific audience?",
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
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
                HQ Chatbot
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="rounded-full border border-black/10 bg-[#f7f2e9] px-3 py-2 text-[#4f5148]">
                GPT-4.1 · Balanced
              </span>
              <span className="rounded-full border border-black/10 bg-white px-3 py-2 text-[#4f5148]">
                Temp 0.7
              </span>
            </div>
          </header>

          <section className="flex flex-1 flex-col gap-6 px-6 py-8">
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
                <div
                  className={`max-w-xl rounded-[24px] border border-black/5 px-5 py-4 text-sm leading-6 text-[#2b2d28] ${
                    message.role === "user"
                      ? "bg-[#f7f2e9]"
                      : "bg-white shadow-[0_16px_40px_-32px_rgba(0,0,0,0.6)]"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            <div className="rounded-[22px] border border-dashed border-black/10 bg-[#fdfbf7] px-5 py-4 text-sm text-[#6a6d62]">
              Tip: Ask for shorter, punchier, or more formal variants anytime.
            </div>
          </section>

          <footer className="border-t border-black/5 px-6 py-5">
            <form
              className="flex flex-col gap-3 rounded-[24px] border border-black/10 bg-white px-4 py-3 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.6)]"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <div className="flex flex-wrap gap-2 text-xs font-medium text-[#6a6d62]">
                {["Summarize", "Rewrite", "Translate", "Outline"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-black/10 bg-[#f7f2e9] px-3 py-1"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="flex-1 rounded-full border border-black/10 bg-[#fdfbf7] px-4 py-3 text-sm text-[#1b1c19] placeholder:text-[#9b9e93] focus:outline-none focus:ring-2 focus:ring-[#c4d4c5]"
                  placeholder="Message Atlas..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
                <button
                  type="submit"
                  className="rounded-full bg-[#1b1c19] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-[#9b9e93]">
                Atlas can make mistakes. Consider checking important details.
              </p>
            </form>
          </footer>
        </main>
      </div>
    </div>
  );
}
