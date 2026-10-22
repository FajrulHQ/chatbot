import fs from "fs";
import path from "path";

export type StoredSession = {
  id: string;
  title: string;
  model: string | null;
  runtime: string | null;
  createdAt: string;
  lastMessageAt: string;
};

export type StoredMessage = {
  id: string | number;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  think?: string | null;
  metadata?: unknown;
  createdAt: string;
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://epcutnkzflssfhoxewlp.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// Fallback local storage directory
const DATA_DIR = path.join(process.cwd(), ".data");
const STORAGE_FILE = path.join(DATA_DIR, "chat_storage.json");

type LocalStore = {
  sessions: StoredSession[];
  messages: StoredMessage[];
};

function readLocalStore(): LocalStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
      const initial: LocalStore = { sessions: [], messages: [] };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    return JSON.parse(raw) as LocalStore;
  } catch {
    return { sessions: [], messages: [] };
  }
}

function writeLocalStore(store: LocalStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error("Failed to write to local storage:", err);
  }
}

function getSupabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

// ─── UNIFIED DATABASE OPERATIONS (SUPABASE WITH FALLBACK) ──────────

export async function dbListSessions(): Promise<{
  sessions: StoredSession[];
  source: "supabase" | "local_fallback";
  warning?: string;
}> {
  if (SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_sessions?select=id,title,model,runtime,created_at&order=created_at.desc`,
        {
          headers: getSupabaseHeaders(),
          signal: AbortSignal.timeout(4000),
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: number | string;
          title: string;
          model: string | null;
          runtime: string | null;
          created_at: string;
        }>;

        return {
          sessions: rows.map((r) => ({
            id: String(r.id),
            title: r.title,
            model: r.model,
            runtime: r.runtime,
            createdAt: r.created_at,
            lastMessageAt: r.created_at,
          })),
          source: "supabase",
        };
      }
    } catch (err) {
      console.warn("Supabase REST list failed, using local store:", err);
    }
  }

  const store = readLocalStore();
  return {
    sessions: store.sessions.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    ),
    source: "local_fallback",
  };
}

export async function dbCreateSession(
  title: string,
  model?: string | null,
  runtime?: string | null
): Promise<{ session: StoredSession; source: "supabase" | "local_fallback" }> {
  if (SUPABASE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions`, {
        method: "POST",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title,
          model: model || null,
          runtime: runtime || null,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: number | string;
          title: string;
          model: string | null;
          runtime: string | null;
          created_at: string;
        }>;
        const row = rows[0];
        const session: StoredSession = {
          id: String(row.id),
          title: row.title,
          model: row.model,
          runtime: row.runtime,
          createdAt: row.created_at,
          lastMessageAt: row.created_at,
        };
        return { session, source: "supabase" };
      }
    } catch (err) {
      console.warn("Supabase REST create session failed, using local store:", err);
    }
  }

  const store = readLocalStore();
  const id = String(Date.now());
  const now = new Date().toISOString();
  const session: StoredSession = {
    id,
    title,
    model: model || null,
    runtime: runtime || null,
    createdAt: now,
    lastMessageAt: now,
  };
  store.sessions.unshift(session);
  writeLocalStore(store);
  return { session, source: "local_fallback" };
}

export async function dbGetMessages(sessionId: string): Promise<{
  messages: StoredMessage[];
  source: "supabase" | "local_fallback";
}> {
  if (SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_messages?session_id=eq.${sessionId}&select=id,session_id,role,content,think,metadata,created_at&order=created_at.asc`,
        {
          headers: getSupabaseHeaders(),
          signal: AbortSignal.timeout(4000),
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: number | string;
          session_id: number | string;
          role: "user" | "assistant" | "system";
          content: string;
          think: string | null;
          metadata: unknown;
          created_at: string;
        }>;

        return {
          messages: rows.map((r) => ({
            id: r.id,
            sessionId: String(r.session_id),
            role: r.role,
            content: r.content,
            think: r.think || "",
            metadata: r.metadata,
            createdAt: r.created_at,
          })),
          source: "supabase",
        };
      }
    } catch (err) {
      console.warn("Supabase REST get messages failed, using local store:", err);
    }
  }

  const store = readLocalStore();
  const filtered = store.messages.filter((m) => String(m.sessionId) === String(sessionId));
  return { messages: filtered, source: "local_fallback" };
}

export async function dbAddMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  think?: string | null,
  metadata?: unknown
): Promise<{ message: StoredMessage; source: "supabase" | "local_fallback" }> {
  if (SUPABASE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
        method: "POST",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          session_id: Number(sessionId) || sessionId,
          role,
          content,
          think: think || null,
          metadata: metadata || null,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: number | string;
          session_id: number | string;
          role: "user" | "assistant" | "system";
          content: string;
          think: string | null;
          metadata: unknown;
          created_at: string;
        }>;
        const row = rows[0];
        const message: StoredMessage = {
          id: row.id,
          sessionId: String(row.session_id),
          role: row.role,
          content: row.content,
          think: row.think || null,
          metadata: row.metadata,
          createdAt: row.created_at,
        };
        return { message, source: "supabase" };
      }
    } catch (err) {
      console.warn("Supabase REST add message failed, using local store:", err);
    }
  }

  const store = readLocalStore();
  const id = Date.now();
  const now = new Date().toISOString();
  const message: StoredMessage = {
    id,
    sessionId,
    role,
    content,
    think: think || null,
    metadata,
    createdAt: now,
  };
  store.messages.push(message);

  const sess = store.sessions.find((s) => String(s.id) === String(sessionId));
  if (sess) {
    sess.lastMessageAt = now;
  }

  writeLocalStore(store);
  return { message, source: "local_fallback" };
}

export async function dbDeleteSession(sessionId: string): Promise<boolean> {
  if (SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_sessions?id=eq.${sessionId}`,
        {
          method: "DELETE",
          headers: getSupabaseHeaders(),
          signal: AbortSignal.timeout(4000),
        }
      );
      if (res.ok) return true;
    } catch (err) {
      console.warn("Supabase REST delete session failed:", err);
    }
  }

  const store = readLocalStore();
  store.sessions = store.sessions.filter((s) => String(s.id) !== String(sessionId));
  store.messages = store.messages.filter((m) => String(m.sessionId) !== String(sessionId));
  writeLocalStore(store);
  return true;
}
