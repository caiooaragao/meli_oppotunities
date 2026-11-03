"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; lastSeen: number | null };

export function ExitAgentButton() {
  const [status, setStatus] = useState<Status>({ connected: false, lastSeen: null });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/exit/status", { cache: "no-store" });
        const body = (await response.json()) as Status;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) setStatus({ connected: false, lastSeen: null });
      }
    };
    tick();
    const id = setInterval(tick, 4_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs " +
          (status.connected ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600")
        }
        title={
          status.connected
            ? "O AliExpress sai pelo IP desta máquina de casa"
            : "Sem agente: o scrape da VPS usa o IP de datacenter"
        }
      >
        <span
          className={
            "h-1.5 w-1.5 rounded-full " + (status.connected ? "bg-emerald-500" : "bg-zinc-400")
          }
        />
        {status.connected ? "Casa ligada" : "Casa off"}
      </span>
      <a
        href="/api/exit/agente"
        className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        title="Baixa um script Node. Rode no seu computador e deixe a janela aberta."
      >
        Baixar agente
      </a>
    </div>
  );
}
