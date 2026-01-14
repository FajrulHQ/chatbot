import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type IncomingBody = {
  role?: "user" | "assistant" | "system";
  content?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  if (!/^\d+$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as IncomingBody | null;
  const role = body?.role;
  const content = body?.content?.trim();
  if (!role || !content) {
    return NextResponse.json(
      { error: "Role and content are required." },
      { status: 400 }
    );
  }
  try {
    const db = await getDb();
    const result = await db.query<{ id: number; created_at: string }>(
      `
        INSERT INTO chat_messages (session_id, role, content)
        VALUES ($1, $2, $3)
        RETURNING id, created_at;
      `,
      [sessionId, role, content]
    );
    const message = result.rows[0];
    return NextResponse.json({
      id: message.id,
      createdAt: message.created_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to save message." },
      { status: 500 }
    );
  }
}
