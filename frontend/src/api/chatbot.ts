const BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceDocument {
  filename: string;
  chunk_preview: string;
}

export interface ChatMeta {
  used_fallback: boolean;
  response_basis: "documented" | "partial_document" | "general_knowledge";
  sources: SourceDocument[];
}

export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  token: string,
  babyId?: string,
  onChunk?: (text: string) => void,
  onMeta?: (meta: ChatMeta) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE}/chatbot/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      baby_id: babyId ?? null,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).detail || "오류가 발생했습니다.");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      const event = JSON.parse(raw) as { type: string; [key: string]: unknown };

      if (event.type === "meta") {
        onMeta?.(event as unknown as ChatMeta);
      } else if (event.type === "chunk") {
        onChunk?.(event.text as string);
      } else if (event.type === "error") {
        throw new Error((event.message as string) || "오류가 발생했습니다.");
      }
    }
  }
}
