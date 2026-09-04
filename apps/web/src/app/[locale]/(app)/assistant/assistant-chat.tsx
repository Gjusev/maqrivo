"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { askAssistantAction } from "@/server/ai/actions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AssistantChat() {
  const t = useTranslations("Assistant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    setError(null);
    const result = await askAssistantAction(next);
    setPending(false);
    if (result.ok && result.reply !== undefined) {
      setMessages([...next, { role: "assistant", content: result.reply }]);
    } else if (result.error === "ai-not-configured") {
      setError(t("notConfigured"));
    } else {
      setError(t("notConfigured"));
    }
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 999999 }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={listRef} className="card min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="pt-16 text-center text-sm text-zinc-400">{t("placeholder")}</p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-brand-600 text-white"
                  : "mr-auto bg-zinc-100 text-zinc-800"
              }`}
            >
              {m.content}
            </div>
          ))
        )}
        {pending ? <p className="text-sm text-zinc-400">{t("thinking")}</p> : null}
      </div>

      {error ? <p className="text-xs text-amber-600">{error}</p> : null}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
        />
        <button type="button" className="btn-primary shrink-0" disabled={pending || !input.trim()} onClick={() => void send()}>
          {t("send")}
        </button>
      </div>
    </div>
  );
}
