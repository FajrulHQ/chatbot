import { NextResponse } from "next/server";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestPayload = {
  messages: ChatMessage[];
  runtime?: "lmstudio" | "ollama" | "hermes" | "vllm" | "llamacpp";
  model?: string;
  reasoningLevel?: "Off" | "Low" | "Medium" | "High";
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  images?: string[];
  documentText?: string;
};

export type DecisionResult = {
  gateModel: string;
  intent: string;
  need_web_search: boolean;
  confidence: number;
  threshold: number;
  tool: "web_search" | "calculator" | "direct_knowledge";
  query: string;
  rationale: string;
  latencyMs: number;
};

export type SearchSource = {
  title: string;
  url: string;
  snippet: string;
};

// ─── 1. TOOL: LIVE WEB SEARCH (HERMES ENGINE + WEATHER WTTR.IN + WIKI FALLBACK) ──
async function executeWebSearch(query: string): Promise<SearchSource[]> {
  const sources: SearchSource[] = [];
  const lower = query.toLowerCase();

  // A. Specialized Live Weather Detection (e.g., "cuaca riau", "weather in jakarta")
  const isWeather =
    lower.includes("cuaca") ||
    lower.includes("weather") ||
    lower.includes("suhu") ||
    lower.includes("temperature");

  if (isWeather) {
    let loc = "Jakarta";
    if (lower.includes("riau")) loc = "Riau";
    else if (lower.includes("pekanbaru")) loc = "Pekanbaru";
    else if (lower.includes("surabaya")) loc = "Surabaya";
    else if (lower.includes("bandung")) loc = "Bandung";
    else if (lower.includes("bali") || lower.includes("denpasar")) loc = "Bali";
    else if (lower.includes("medan")) loc = "Medan";
    else if (lower.includes("yogyakarta") || lower.includes("jogja")) loc = "Yogyakarta";
    else {
      const locMatch = query.match(/(?:di|in|for|pada)\s+([A-Za-z\s]+?)(?:\s+hari|\s+saat|\?|$)/i);
      if (locMatch && locMatch[1].trim()) {
        loc = locMatch[1].trim();
      }
    }

    try {
      const weatherRes = await fetch(
        `https://wttr.in/${encodeURIComponent(loc)}?format=%l:+%c+%t,+Wind:+%w,+Humidity:+%h&m`,
        {
          headers: { "User-Agent": "curl/7.88.1" },
          signal: AbortSignal.timeout(3000),
        }
      );
      if (weatherRes.ok) {
        const text = (await weatherRes.text()).trim();
        if (text && !text.includes("<html") && !text.includes("Unknown location")) {
          sources.push({
            title: `Live Meteorological Report: ${loc}`,
            snippet: `Live real-time weather observation for ${loc}: ${text}`,
            url: `https://wttr.in/${encodeURIComponent(loc)}`,
          });
        }
      }
    } catch {
      // Continue to live search
    }
  }

  // B. Live Web Search via Hermes Python Tool (keenable / ddgs / exa)
  try {
    const pythonPath =
      "/Users/fajrulhaqqi/.hermes/installs/3999d3130b1d128a/environments/18ecf53bed104197972255099ae4a525/venv/bin/python3";
    if (fs.existsSync(pythonPath)) {
      const pyScript = `
import sys, json
sys.path.append('/Users/fajrulhaqqi/.hermes/hermes-agent')
try:
    from tools.web_tools import web_search_tool
    q = sys.argv[1] if len(sys.argv) > 1 else ''
    print(web_search_tool(q, limit=3))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
      const p = spawnSync(pythonPath, ["-c", pyScript, query], { timeout: 6000 });
      if (p.status === 0 && p.stdout) {
        const outText = p.stdout.toString().replace(/^[^{\[]*/, "").trim();
        const parsed = JSON.parse(outText);
        if (parsed.success && Array.isArray(parsed.data?.web)) {
          for (const item of parsed.data.web.slice(0, 3)) {
            if (item.title && item.url) {
              sources.push({
                title: item.title,
                url: item.url,
                snippet: (item.description || item.snippet || "").slice(0, 350),
              });
            }
          }
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // C. Fallback: Wikipedia Search API if fewer than 2 sources
  if (sources.length < 2) {
    try {
      const cleanQuery = query.replace(/[^\w\s-]/gi, "").trim();
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&utf8=&format=json`;
      const res = await fetch(wikiUrl, {
        signal: AbortSignal.timeout(3000),
        headers: { "User-Agent": "MonoAgent/1.0 (chatbot-portfolio)" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          query?: { search?: Array<{ title: string; snippet: string }> };
        };
        const hits = data.query?.search || [];
        for (const h of hits.slice(0, 3)) {
          sources.push({
            title: h.title,
            snippet: h.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').trim(),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
          });
        }
      }
    } catch {
      // Continue to next provider
    }
  }

  return sources;
}

// ─── 2. TOOL: ROBUST ARITHMETIC & BIGINT CALCULATOR ────────────────
export type CalculationResult = {
  expr: string;
  result: string;
  formatted: string;
  display: string;
};

function executeCalculator(text: string): CalculationResult | null {
  let cleaned = text
    .replace(/(?:berapa\s+hasil\s+dari|berapa\s+hasil|hasil\s+dari|nilai\s+dari|hitunglah|hitung|calculate|what\s+is\s+the\s+result\s+of|what\s+is|eval|kira-kira\s+berapa|tolong\s+hitung|berapa)\s*/gi, "")
    .replace(/[=?]+/g, "")
    .trim();

  // Percentage pattern: '25% of 800' or '25% dari 800' -> '(25/100)*800'
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*%\s*(?:dari|of|\*)\s*(\d+(?:\.\d+)?)/gi, "($1/100)*$2");
  cleaned = cleaned.replace(/x/gi, "*").replace(/\^/g, "**").replace(/÷/g, "/");

  // Validate allowed math characters
  if (!/^[0-9+\-*\/()\s.]+$/.test(cleaned) || !/\d/.test(cleaned)) {
    return null;
  }

  try {
    // If integer operations without division or decimals, use BigInt
    if (/^[0-9\s*+\-]+$/.test(cleaned) && !cleaned.includes("/") && !cleaned.includes(".")) {
      const bigintExpr = cleaned.replace(/\b(\d+)\b/g, "$1n");
      const fn = new Function("return " + bigintExpr);
      const val = fn();
      const formatted = BigInt(val).toLocaleString("id-ID");
      return {
        expr: cleaned,
        result: val.toString(),
        formatted,
        display: `${cleaned} = ${formatted}`,
      };
    }
    const fn = new Function("return " + cleaned);
    const val = fn();
    if (typeof val === "number" && !isNaN(val) && isFinite(val)) {
      const formatted = val.toLocaleString("id-ID");
      return {
        expr: cleaned,
        result: val.toString(),
        formatted,
        display: `${cleaned} = ${formatted}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

// ─── 3. DECISION MODEL TASK (d1-omni-600m) ─────────────────────────
async function runDecisionGate(userPrompt: string): Promise<DecisionResult> {
  const decisionStart = performance.now();
  let gateModel = "d1-omni-600m";
  let intent = "Analytical Inquiry";
  let need_web_search = false;
  let confidence = 0.5;
  const threshold = 0.7;
  let tool: "web_search" | "calculator" | "direct_knowledge" = "direct_knowledge";
  let query = userPrompt;
  let rationale = "Evaluated user prompt constraints.";

  // Quick check for math calculation first (Always 100% accurate!)
  const calcRes = executeCalculator(userPrompt);
  if (calcRes) {
    return {
      gateModel: "d1-omni-600m",
      intent: "Mathematical Computation",
      need_web_search: false,
      confidence: 1.0,
      threshold,
      tool: "calculator",
      query: calcRes.expr,
      rationale: `Exact arithmetic computation: ${calcRes.display}`,
      latencyMs: Math.max(5, Math.round(performance.now() - decisionStart)),
    };
  }

  // Probe d1-omni-600m in LM Studio for real-time / web inquiry
  try {
    const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "d1-omni-600m",
        messages: [
          {
            role: "system",
            content:
              "You are the d1-omni decision router. Determine if answering the user inquiry accurately requires fresh real-time web information (today news, current weather, live events, flight/ticket prices, sports scores, recent releases, current prices, web search) or if it can be answered using purely static base parametric knowledge (concepts, definitions, code explanation, greetings, history before cutoff).\nOutput ONLY JSON:\n{\"need_web_search\": boolean, \"confidence\": float (0.0 to 1.0), \"tool\": \"web_search\"|\"calculator\"|\"direct_knowledge\", \"query\": string, \"intent\": string, \"rationale\": string}",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 140,
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const d = await res.json();
      const content = d.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        need_web_search = !!parsed.need_web_search;
        confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.85;
        intent = parsed.intent || intent;
        query = parsed.query || query;
        rationale = parsed.rationale || rationale;
        tool = need_web_search && confidence >= threshold ? "web_search" : "direct_knowledge";
      }
    }
  } catch {
    // Fallback heuristic if d1-omni is busy
    gateModel = "d1-omni-rule-policy";
    const lower = userPrompt.toLowerCase();
    const needsSearchWords = [
      "search", "cari", "siapa", "berita", "news", "terbaru", "cuaca", "weather",
      "harga", "tiket", "latest", "update", "current", "2025", "2026", "score", "siaran", "kurs"
    ];
    const matchCount = needsSearchWords.filter((w) => lower.includes(w)).length;
    if (matchCount > 0) {
      need_web_search = true;
      confidence = Math.min(0.95, 0.70 + matchCount * 0.10);
      tool = confidence >= threshold ? "web_search" : "direct_knowledge";
      intent = "Real-time Information Lookup";
      rationale = `Detected inquiry keywords indicating external lookup requirement (Confidence: ${Math.round(confidence * 100)}%).`;
    } else {
      need_web_search = false;
      confidence = 0.90;
      tool = "direct_knowledge";
      intent = "General Conceptual Knowledge";
      rationale = "Inquiry can be answered from base LLM parametric weights without external tools.";
    }
  }

  const latencyMs = Math.max(8, Math.round(performance.now() - decisionStart));
  return {
    gateModel,
    intent,
    need_web_search,
    confidence,
    threshold,
    tool,
    query,
    rationale,
    latencyMs,
  };
}

// ─── 4. RUNTIME CONNECTIVITY PRE-FLIGHT CHECK ─────────────────────
async function checkRuntimeStatus(
  runtime: string
): Promise<{ ok: boolean; message?: string }> {
  if (runtime === "lmstudio") {
    try {
      const res = await fetch("http://127.0.0.1:1234/v1/models", {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) {
        return {
          ok: false,
          message: `LM Studio returned status ${res.status}. Please verify server is healthy.`,
        };
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          "LM Studio is not connected. Please launch LM Studio and toggle the Local Server ON at http://127.0.0.1:1234.",
      };
    }
  }

  if (runtime === "ollama") {
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) {
        return {
          ok: false,
          message: `Ollama returned status ${res.status}.`,
        };
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          "Ollama is not running. Please start Ollama service at http://127.0.0.1:11434.",
      };
    }
  }

  if (runtime === "hermes") {
    const sock = `${os.homedir()}/.hermes/gateway.sock`;
    const hermesBin = "/Users/fajrulhaqqi/.hermes/hermes-agent/.hermes/bin/hermes";
    if (fs.existsSync(sock) || fs.existsSync(hermesBin)) {
      return { ok: true };
    }
    return {
      ok: false,
      message: "Hermes Agent binary or gateway socket not found.",
    };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequestPayload | null;

  if (!body || !body.messages || body.messages.length === 0) {
    return NextResponse.json({ error: "Messages are required." }, { status: 400 });
  }

  const {
    messages,
    runtime = "lmstudio",
    model = "qwen3.5-0.8b-mlx",
    reasoningLevel = "High",
    temperature = 0.7,
    topP = 0.9,
    maxTokens = 2048,
    systemPrompt,
    images = [],
    documentText,
  } = body;

  // 1. Pre-flight health check
  const statusCheck = await checkRuntimeStatus(runtime);
  if (!statusCheck.ok) {
    return NextResponse.json(
      { error: statusCheck.message, runtimeOffline: true },
      { status: 503 }
    );
  }

  // 2. Extract last user query
  const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content || "";

  // 3. AGENTIC DECISION STEP (Using Decision Model d1-omni-600m)
  const decision = await runDecisionGate(lastUserMsg);

  // 4. AGENTIC TOOL EXECUTION STEP (If confidence >= 0.7 and tool required)
  let toolSources: SearchSource[] = [];
  let toolSummary = "";
  const toolStart = performance.now();

  if (decision.tool === "web_search" && decision.confidence >= decision.threshold) {
    toolSources = await executeWebSearch(decision.query);
    if (toolSources.length > 0) {
      toolSummary = `Retrieved ${toolSources.length} external source(s) from Web Search for query: "${decision.query}"`;
    } else {
      toolSummary = `Web Search executed for "${decision.query}" (no fresh external snippets found; proceeding with base knowledge).`;
    }
  } else if (decision.tool === "calculator") {
    toolSummary = `Calculator Tool: ${decision.rationale}`;
  }

  const toolLatencyMs = Math.round(performance.now() - toolStart);

  // 5. Construct Context for Chat LLM (Plan & Answer generation)
  const preparedMessages: Array<{
    role: "user" | "assistant" | "system";
    content: unknown;
  }> = [];

  // System Instructions
  let baseSystem =
    "You are a capable, natural, and intelligent AI assistant. Converse like a thoughtful, experienced engineer and helpful collaborator.\n" +
    "- Be direct, articulate, and organic. Speak like a real assistant, not a robotic policy generator.\n" +
    "- Never output meta-analysis of your prompt, robotic policy documents, or internal routing templates.\n" +
    "- If the user greets you (e.g. 'hi', 'halo', 'hello'), respond naturally and warmly, ready to help.\n" +
    "- If answering questions or technical tasks, provide comprehensive, high-impact, and structured answers (using Markdown, clean lists, and code blocks where helpful).";

  if (systemPrompt && systemPrompt.trim()) {
    const cleanSys = systemPrompt.trim();
    if (!cleanSys.includes("routing policy")) {
      baseSystem += `\n\nGuidelines: ${cleanSys}`;
    }
  }

  if (reasoningLevel !== "Off") {
    baseSystem +=
      reasoningLevel === "High"
        ? "\n\nDeep reasoning is enabled: Put your internal planning and step-by-step deliberations strictly inside <think>...</think> tags. After the closing </think> tag, output ONLY your natural, high-quality final response."
        : "\n\nReasoning enabled: Put brief thoughts inside <think>...</think> tags, followed by your natural conversational response.";
  } else {
    baseSystem += "\n\nAnswer directly and conversationally without <think> tags. /no_think";
  }

  preparedMessages.push({ role: "system", content: baseSystem });

  // If document was provided
  if (documentText) {
    preparedMessages.push({
      role: "system",
      content: `Context from attached document:\n\"\"\"\n${documentText.slice(0, 15000)}\n\"\"\"`,
    });
  }

  // If Tool returned web search sources, inject them into LLM prompt
  if (toolSources.length > 0) {
    const formattedSources = toolSources
      .map((s, idx) => `[Source ${idx + 1}] ${s.title}: "${s.snippet}" (${s.url})`)
      .join("\n\n");
    preparedMessages.push({
      role: "system",
      content: `Web Search Results for "${decision.query}":\n${formattedSources}\nUse these retrieved sources to provide an accurate, up-to-date answer and cite them when helpful.`,
    });
  } else if (decision.tool === "calculator" && decision.rationale) {
    preparedMessages.push({
      role: "system",
      content: `[Exact Arithmetic Computation Tool Result]\n${decision.rationale}\nState this exact computed result directly and clearly to the user without altering the numbers.`,
    });
  }

  // User and Assistant messages history
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const isLast = i === messages.length - 1;

    if (isLast && m.role === "user" && images.length > 0) {
      const visionContent: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = [{ type: "text", text: m.content || "Inspect attached image." }];

      for (const imgUrl of images) {
        visionContent.push({
          type: "image_url",
          image_url: { url: imgUrl },
        });
      }
      preparedMessages.push({ role: "user", content: visionContent });
    } else {
      preparedMessages.push({ role: m.role, content: m.content });
    }
  }

  // Determine chat model target
  let targetChatModel = model;
  if (runtime === "lmstudio") {
    if (model === "hybrid-agentic-lmstudio" || model === "qwen3.5-0.8b") {
      targetChatModel = "qwen3.5-0.8b-mlx";
    }
  }

  // 6. STREAM GENERATION & SEND INITIAL AGENTIC STEP PROCESS
  const encoder = new TextEncoder();

  // Agentic Step Process Metadata event
  const stepProcessEvent = `data: ${JSON.stringify({
    stepProcess: {
      decision: {
        gateModel: decision.gateModel,
        intent: decision.intent,
        tool: decision.tool,
        confidence: decision.confidence,
        threshold: decision.threshold,
        latencyMs: decision.latencyMs,
        rationale: decision.rationale,
      },
      toolExecution:
        decision.tool !== "direct_knowledge"
          ? {
              tool: decision.tool,
              query: decision.query,
              resultSummary: toolSummary,
              sources: toolSources,
              latencyMs: toolLatencyMs,
            }
          : undefined,
      llmGeneration: {
        modelName: targetChatModel,
        device: "Apple Silicon Metal MPS",
        reasoningLevel,
      },
    },
  })}\n\n`;

  // ─── RUNTIME EXECUTION ──────────────────────────────────────────

  // A. LM STUDIO
  if (runtime === "lmstudio") {
    try {
      const response = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: targetChatModel,
          messages: preparedMessages,
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: request.signal,
      });

      if (!response.ok || !response.body) {
        return NextResponse.json(
          { error: `LM Studio returned status ${response.status}` },
          { status: response.status }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(stepProcessEvent));
          const reader = response.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch {
            // Stream ended or aborted
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `LM Studio error: ${msg}` }, { status: 502 });
    }
  }

  // B. OLLAMA
  if (runtime === "ollama") {
    try {
      const response = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "qwen3.5:0.8b",
          messages: preparedMessages,
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: request.signal,
      });

      if (!response.ok || !response.body) {
        return NextResponse.json(
          { error: `Ollama returned status ${response.status}` },
          { status: response.status }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(stepProcessEvent));
          const reader = response.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch {
            // Aborted
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Ollama error: ${msg}` }, { status: 502 });
    }
  }

  // C. HERMES LOCAL AGENT
  if (runtime === "hermes") {
    try {
      const hermesBin = "/Users/fajrulhaqqi/.hermes/hermes-agent/.hermes/bin/hermes";
      const reasoningFlag =
        reasoningLevel.toLowerCase() === "off" ? "none" : reasoningLevel.toLowerCase();

      let augmentedPrompt = lastUserMsg;
      if (toolSources.length > 0) {
        augmentedPrompt += `\n\n[Web Search Context]\n` + toolSources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n");
      }

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(stepProcessEvent));

          try {
            await new Promise<void>((resolve) => {
              const child = spawn(hermesBin, [
                "-z",
                augmentedPrompt,
                "--reasoning",
                reasoningFlag,
                "-m",
                model || "ag/gemini-3.8-flash-high",
              ]);

              // Handle client interruption
              request.signal.addEventListener("abort", () => {
                child.kill("SIGTERM");
                resolve();
              });

              child.stdout.on("data", (chunk: Buffer) => {
                const text = chunk.toString();
                const deltaEvent = `data: ${JSON.stringify({
                  choices: [{ delta: { content: text } }],
                })}\n\n`;
                controller.enqueue(encoder.encode(deltaEvent));
              });

              child.on("close", () => resolve());
              child.on("error", () => resolve());
            });
          } catch {
            // Failed
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Hermes Agent error: ${msg}` }, { status: 502 });
    }
  }

  // D. LLAMACPP / VLLM FALLBACK
  const endpoint = runtime === "vllm" ? "http://127.0.0.1:8000" : "http://127.0.0.1:8080";
  try {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: preparedMessages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: `${runtime} returned status ${response.status}` },
        { status: response.status }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(stepProcessEvent));
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { error: `Unable to connect to ${runtime} on ${endpoint}.` },
      { status: 502 }
    );
  }
}
