import { NextResponse } from "next/server";

type OllamaMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages?: OllamaMessage[];
  };

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2",
        stream: false,
        messages,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Ollama request failed." },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    return NextResponse.json({
      message: data.message?.content ?? "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to reach Ollama." },
      { status: 500 }
    );
  }
}
