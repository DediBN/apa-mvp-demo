"use client";

import { useState } from "react";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError((data as { error?: string }).error || "Something went wrong.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <form onSubmit={submit} className="command-card w-full space-y-4 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-command-action">APA Skills</p>
        <h1 className="text-xl font-semibold text-command-text">Enter your access code</h1>
        <p className="text-sm text-command-muted">The tool is in private preview. Ask us for a code — הכלי בגרסת הרצה פרטית, בקשו קוד גישה.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-sm text-command-text"
          placeholder="Access code"
          aria-label="Access code"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="w-full rounded bg-command-action px-4 py-2 font-semibold text-command-bg disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
