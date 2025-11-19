"use client";

import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReply("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setReply(data.reply || "");
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Zypher Agent Demo</h1>
        <form onSubmit={onSend} style={{ display: "flex", gap: 8, width: "100%", maxWidth: 720 }}>
          <input
            type="text"
            placeholder="Enter your question, e.g.: Write a todo list"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <button disabled={loading || !prompt.trim()} style={{ padding: "10px 14px", borderRadius: 8 }}>
            {loading ? "Sending..." : "Send"}
          </button>
        </form>
        <div style={{ marginTop: 16, width: "100%", maxWidth: 720 }}>
          {error && <div style={{ color: "#d00" }}>Error: {error}</div>}
          {reply && (
            <div style={{ whiteSpace: "pre-wrap", background: "#111", color: "#eee", padding: 16, borderRadius: 8 }}>
              {reply}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
