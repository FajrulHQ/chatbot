import { NextResponse } from "next/server";
import { dbAddMessage } from "@/lib/db";

type IncomingBody = {
  role?: "user" | "assistant" | "system";
  content?: string;
  think?: string;
  metadata?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as IncomingBody | null;
  const role = body?.role;
  const content = body?.content?.trim();
  const think = body?.think?.trim() || null;
  const metadata = body?.metadata ?? null;

  if (!role || !content) {
    return NextResponse.json(
      { error: "Role and content are required." },
      { status: 400 }
    );
  }

  const result = await dbAddMessage(sessionId, role, content, think, metadata);
  return NextResponse.json({
    id: result.message.id,
    createdAt: result.message.createdAt,
    database: result.source,
  });
}
