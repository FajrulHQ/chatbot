import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5-GGUF";
const CHAT_MODEL = "qwen3-4b";
const LM_STUDIO_BASE_URL = "http://localhost:1234";

const MAX_CHARS = 12000;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const TOP_K = 4;

const chunkText = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  if (!cleaned) return chunks;
  let index = 0;
  while (index < cleaned.length) {
    const slice = cleaned.slice(index, index + CHUNK_SIZE);
    chunks.push(slice);
    index += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
};

const cosineSimilarity = (a: number[], b: number[]) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

export async function POST(request: Request) {
  const { messages, documentText } = (await request.json()) as {
    messages?: ChatMessage[];
    documentText?: string;
  };

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required." },
      { status: 400 }
    );
  }

  if (!documentText || !documentText.trim()) {
    return NextResponse.json(
      { error: "Document text is required." },
      { status: 400 }
    );
  }

  const trimmedDoc = documentText.slice(0, MAX_CHARS);
  const chunks = chunkText(trimmedDoc);

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "Document text is empty." },
      { status: 400 }
    );
  }

  try {
    const embeddingResponse = await fetch(
      `${LM_STUDIO_BASE_URL}/v1/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: chunks,
        }),
      }
    );

    if (!embeddingResponse.ok) {
      return NextResponse.json(
        { error: "LM Studio embedding request failed." },
        { status: embeddingResponse.status }
      );
    }

    const embeddingData = (await embeddingResponse.json()) as {
      data?: { embedding?: number[] }[];
    };

    const embeddings = embeddingData.data?.map((item) => item.embedding || []);

    if (!embeddings || embeddings.length === 0) {
      return NextResponse.json(
        { error: "No embeddings returned." },
        { status: 500 }
      );
    }

    const question = messages[messages.length - 1]?.content ?? "";
    const questionEmbeddingResponse = await fetch(
      `${LM_STUDIO_BASE_URL}/v1/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: question,
        }),
      }
    );

    if (!questionEmbeddingResponse.ok) {
      return NextResponse.json(
        { error: "LM Studio question embedding failed." },
        { status: questionEmbeddingResponse.status }
      );
    }

    const questionEmbeddingData = (await questionEmbeddingResponse.json()) as {
      data?: { embedding?: number[] }[];
    };

    const questionEmbedding = questionEmbeddingData.data?.[0]?.embedding;
    if (!questionEmbedding) {
      return NextResponse.json(
        { error: "No question embedding returned." },
        { status: 500 }
      );
    }

    const scored = chunks
      .map((chunk, index) => ({
        chunk,
        score: cosineSimilarity(embeddings[index] || [], questionEmbedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    const context = scored
      .map((item, index) => `Source ${index + 1}: ${item.chunk}`)
      .join("\n\n");

    const systemMessage: ChatMessage = {
      role: "system",
      content:
        "You are a helpful assistant. Use the provided context to answer. If the answer is not in the context, say you don't know.",
    };

    const contextMessage: ChatMessage = {
      role: "system",
      content: `Context:\n${context}`,
    };

    const chatResponse = await fetch(
      `${LM_STUDIO_BASE_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [systemMessage, contextMessage, ...messages],
          temperature: 0.2,
          stream: true,
        }),
      }
    );

    if (!chatResponse.ok) {
      return NextResponse.json(
        { error: "LM Studio chat request failed." },
        { status: chatResponse.status }
      );
    }

    if (!chatResponse.body) {
      return NextResponse.json(
        { error: "LM Studio stream unavailable." },
        { status: 500 }
      );
    }

    return new Response(chatResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to reach LM Studio." },
      { status: 500 }
    );
  }
}
