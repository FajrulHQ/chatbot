import { NextResponse } from "next/server";

type LmStudioMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages?: LmStudioMessage[];
  };

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      "http://localhost:1234/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen3-4b",
          messages,
          temperature: 0.7,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "LM Studio request failed." },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "LM Studio stream unavailable." },
        { status: 500 }
      );
    }

    return new Response(response.body, {
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
