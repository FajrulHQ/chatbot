import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";

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
  decisionModel?: string;
  models: LocalModel[];
};

export async function GET() {
  const runtimes: Record<string, RuntimeEntry> = {};

  // 1. Probe LM Studio (http://127.0.0.1:1234)
  try {
    const start = performance.now();
    const lmRes = await fetch("http://127.0.0.1:1234/v1/models", {
      signal: AbortSignal.timeout(1500),
    });
    const latency = `${Math.round(performance.now() - start)}ms`;
    if (lmRes.ok) {
      const data = (await lmRes.json()) as { data?: { id: string }[] };
      const rawModels = data.data || [];

      // Check if d1-omni decision model is present
      const hasD1 = rawModels.some((m) => m.id.toLowerCase().includes("d1-omni"));
      const decisionModelId = hasD1
        ? rawModels.find((m) => m.id.toLowerCase().includes("d1-omni"))?.id || "d1-omni-600m"
        : undefined;

      // Filter OUT decision models and embedding models: they are not chat models!
      const chatModels = rawModels.filter((m) => {
        const idLower = m.id.toLowerCase();
        const isDecision = idLower.includes("d1-omni") || idLower.includes("decision");
        const isEmbed = idLower.includes("embed") || idLower.includes("embedding");
        return !isDecision && !isEmbed;
      });

      const models: LocalModel[] = [];

      // Expose Hybrid Agentic flow if both decision model and chat model exist
      if (hasD1 && chatModels.length > 0) {
        models.push({
          id: "hybrid-agentic-lmstudio",
          name: `Hybrid Agentic (${chatModels[0].id} + ${decisionModelId})`,
          tag: "HYBRID · AGENT",
          badge: "AGENT",
          size: "Dual Engine",
          context: "32k",
          default: true,
          hasReasoning: true,
          defaultReasoning: "High",
          isHybrid: true,
          desc: `${decisionModelId} (routing & tool gate) ➔ ${chatModels[0].id} (plan & synthesis)`,
        });
      }

      for (const m of chatModels) {
        const isQwen = m.id.toLowerCase().includes("qwen");
        models.push({
          id: m.id,
          name: m.id,
          tag: isQwen ? "LLM · CHAT" : "LOCAL LLM",
          badge: isQwen ? "LLM" : "CHAT",
          size: isQwen ? "0.8B MLX" : "Local",
          context: "32k",
          hasReasoning: isQwen,
          defaultReasoning: isQwen ? "Medium" : undefined,
          default: models.length === 0,
          desc: "Full conversation & instruction following model",
        });
      }

      runtimes.lmstudio = {
        key: "lmstudio",
        name: "LM Studio Local",
        endpoint: "http://127.0.0.1:1234",
        protocol: "LM Studio Local Server",
        online: true,
        latency,
        decisionModel: decisionModelId,
        models,
      };
    } else {
      throw new Error("LM Studio returned non-200");
    }
  } catch {
    runtimes.lmstudio = {
      key: "lmstudio",
      name: "LM Studio Local",
      endpoint: "http://127.0.0.1:1234",
      protocol: "LM Studio Local Server",
      online: false,
      latency: "--",
      models: [
        {
          id: "qwen3.5-0.8b-mlx",
          name: "qwen3.5-0.8b-mlx",
          tag: "LLM · CHAT",
          badge: "LLM",
          size: "950 MB",
          context: "32k",
          default: true,
          hasReasoning: true,
          defaultReasoning: "Medium",
        },
      ],
    };
  }

  // 2. Probe Ollama (http://127.0.0.1:11434)
  try {
    const start = performance.now();
    const ollamaRes = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(1500),
    });
    const latency = `${Math.round(performance.now() - start)}ms`;
    if (ollamaRes.ok) {
      const data = (await ollamaRes.json()) as {
        models?: {
          name: string;
          model: string;
          size: number;
          details?: { parameter_size?: string; quantization_level?: string };
          capabilities?: string[];
        }[];
      };

      const models: LocalModel[] = (data.models || []).map((m, idx) => {
        const isVision = m.capabilities?.includes("vision") || m.name.includes("vision");
        const isThinking =
          m.capabilities?.includes("thinking") ||
          m.name.includes("r1") ||
          m.name.includes("qwen");
        const sizeMb = m.size ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB` : "Local";
        return {
          id: m.name,
          name: m.name,
          tag: isVision ? "VISION" : isThinking ? "REASONING" : "CHAT",
          badge: isVision ? "VISION" : isThinking ? "THINK" : "OLLAMA",
          size: sizeMb,
          context: "32k",
          default: idx === 0,
          hasReasoning: isThinking,
          defaultReasoning: isThinking ? "High" : undefined,
          desc: `${m.details?.parameter_size || ""} ${m.details?.quantization_level || ""}`.trim(),
        };
      });

      runtimes.ollama = {
        key: "ollama",
        name: "Ollama Local Engine",
        endpoint: "http://127.0.0.1:11434",
        protocol: "Ollama REST API",
        online: true,
        latency,
        models,
      };
    } else {
      throw new Error("Ollama returned error");
    }
  } catch {
    runtimes.ollama = {
      key: "ollama",
      name: "Ollama Local Engine",
      endpoint: "http://127.0.0.1:11434",
      protocol: "Ollama REST API",
      online: false,
      latency: "--",
      models: [],
    };
  }

  // 3. Probe Hermes Local Agent (Probing http://127.0.0.1:20128/v1/models & ~/.hermes/config.yaml)
  try {
    const start = performance.now();
    let isHermesOnline = false;
    let latency = "5ms";
    const modelMap = new Map<string, LocalModel>();

    // A. Parse local ~/.hermes/config.yaml to get all models configured for Hermes
    try {
      const configPath = `${os.homedir()}/.hermes/config.yaml`;
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        const match = content.match(/custom_providers:[\s\S]*?models:\n([\s\S]*?)models_discovered:/);
        if (match) {
          const lines = match[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("ag/"));
          lines.forEach((line, idx) => {
            const mId = line.replace(/:.*/, "").trim();
            if (mId) {
              const isReasoning = mId.includes("high") || mId.includes("opus") || mId.includes("thinking");
              const isFlash = mId.includes("flash");
              const isSonnet = mId.includes("sonnet");
              const isOpus = mId.includes("opus");
              const isOss = mId.includes("oss") || mId.includes("gpt");

              modelMap.set(mId, {
                id: mId,
                name: mId,
                tag: isFlash
                  ? "AGENTIC · FLASH"
                  : isSonnet
                  ? "FRONTIER · SONNET"
                  : isOpus
                  ? "REASONING · OPUS"
                  : isOss
                  ? "OPEN SOURCE"
                  : "AGENTIC",
                badge: isFlash
                  ? "FLASH"
                  : isSonnet
                  ? "SONNET"
                  : isOpus
                  ? "OPUS"
                  : isOss
                  ? "OSS"
                  : "AGENT",
                size: "Host Proxy",
                context: isOpus ? "200k" : isOss ? "128k" : "1M",
                default: idx === 0,
                hasReasoning: isReasoning,
                defaultReasoning: isReasoning ? "High" : undefined,
                isAgentic: true,
                desc: "Autonomous Hermes agent with multi-step subagents & tool execution",
              });
            }
          });
        }
      }
    } catch {
      // Ignore config read error
    }

    // B. Probe the Hermes custom provider proxy on 127.0.0.1:20128
    try {
      const hRes = await fetch("http://127.0.0.1:20128/v1/models", {
        signal: AbortSignal.timeout(1500),
      });
      latency = `${Math.round(performance.now() - start)}ms`;
      if (hRes.ok) {
        isHermesOnline = true;
        const hData = (await hRes.json()) as {
          data?: Array<{
            id: string;
            capabilities?: {
              reasoning?: boolean;
              vision?: boolean;
              search?: boolean;
              contextWindow?: number;
            };
          }>;
        };

        const rawHermes = hData.data || [];
        rawHermes.forEach((m, idx) => {
          const isReasoning =
            !!m.capabilities?.reasoning || m.id.includes("high") || m.id.includes("flash");
          const isFlash = m.id.includes("flash");
          const isSonnet = m.id.includes("sonnet");
          const isOpus = m.id.includes("opus");
          const ctx = m.capabilities?.contextWindow
            ? `${Math.round(m.capabilities.contextWindow / 1000)}k`
            : "1M";

          modelMap.set(m.id, {
            id: m.id,
            name: m.id,
            tag: isFlash
              ? "AGENTIC · FLASH"
              : isSonnet
              ? "FRONTIER · SONNET"
              : isOpus
              ? "REASONING · OPUS"
              : "AGENTIC",
            badge: isFlash ? "FLASH" : isSonnet ? "SONNET" : isOpus ? "OPUS" : "AGENT",
            size: "Host Proxy",
            context: ctx,
            default: idx === 0,
            hasReasoning: isReasoning,
            defaultReasoning: isReasoning ? "High" : undefined,
            isAgentic: true,
            desc: "Autonomous Hermes agent with multi-step subagents & tool execution",
          });
        });
      }
    } catch {
      // Check socket or binary
      const socketPath = `${os.homedir()}/.hermes/gateway.sock`;
      const hermesBin = "/Users/fajrulhaqqi/.hermes/hermes-agent/.hermes/bin/hermes";
      isHermesOnline = fs.existsSync(socketPath) || fs.existsSync(hermesBin);
    }

    const discoveredModels = Array.from(modelMap.values());
    if (discoveredModels.length > 0 && !discoveredModels.some((m) => m.default)) {
      discoveredModels[0].default = true;
    }

    runtimes.hermes = {
      key: "hermes",
      name: "Hermes Local Agent",
      endpoint: "http://127.0.0.1:8642",
      protocol: "Hermes IPC / Gateway",
      online: isHermesOnline,
      latency,
      models: discoveredModels,
    };
  } catch {
    runtimes.hermes = {
      key: "hermes",
      name: "Hermes Local Agent",
      endpoint: "http://127.0.0.1:8642",
      protocol: "Hermes IPC",
      online: false,
      latency: "--",
      models: [],
    };
  }

  // 4. Probe llama.cpp (http://127.0.0.1:8080)
  try {
    const start = performance.now();
    const lRes = await fetch("http://127.0.0.1:8080/health", {
      signal: AbortSignal.timeout(800),
    });
    runtimes.llamacpp = {
      key: "llamacpp",
      name: "llama.cpp server",
      endpoint: "http://127.0.0.1:8080",
      protocol: "llama-server Metal MPS",
      online: lRes.ok,
      latency: `${Math.round(performance.now() - start)}ms`,
      models: [],
    };
  } catch {
    runtimes.llamacpp = {
      key: "llamacpp",
      name: "llama.cpp server",
      endpoint: "http://127.0.0.1:8080",
      protocol: "llama-server Metal MPS",
      online: false,
      latency: "--",
      models: [],
    };
  }

  // 5. Probe vLLM (http://127.0.0.1:8000)
  try {
    const start = performance.now();
    const vRes = await fetch("http://127.0.0.1:8000/v1/models", {
      signal: AbortSignal.timeout(800),
    });
    runtimes.vllm = {
      key: "vllm",
      name: "vLLM Distributed",
      endpoint: "http://127.0.0.1:8000",
      protocol: "vLLM Engine / PagedAttention",
      online: vRes.ok,
      latency: `${Math.round(performance.now() - start)}ms`,
      models: [],
    };
  } catch {
    runtimes.vllm = {
      key: "vllm",
      name: "vLLM Distributed",
      endpoint: "http://127.0.0.1:8000",
      protocol: "vLLM Engine / PagedAttention",
      online: false,
      latency: "--",
      models: [],
    };
  }

  return NextResponse.json({ runtimes });
}
