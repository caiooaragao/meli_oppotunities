import { connection } from "next/server";
import { Suspense } from "react";
import { OpportunityBoard } from "./dashboard";
import {
  loadOpportunityDashboard,
  type OpportunityFilters,
} from "@/lib/opportunities";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = {
  title: "Oportunidades de margem",
  description:
    "Decisão de compra e investimento a partir da margem de contribuição Mercado Livre × fornecedor.",
};

export default function OpportunityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div className="flex-1 bg-zinc-100 font-sans text-zinc-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-amber-700">Gestão de sortimento</p>
          <h1 className="text-3xl font-semibold tracking-tight">Oportunidades de margem</h1>
          <p className="max-w-3xl text-zinc-600">
            Quais produtos a conta fecha para comprar, quais só merecem observação, e onde
            investir a coleta de fornecedor. A margem já desconta custo posto, tarifa, frete
            de saída e embalagem — não é a diferença bruta de vitrine.
          </p>
        </header>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-white" />}>
          <Board searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Board({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const filters = parseFilters(await searchParams);

  try {
    const data = await loadOpportunityDashboard(filters);
    if (data.discovered === 0) {
      return (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-zinc-600">
          Nenhum item salvo. Rode <code className="font-mono">npm run scrape</code>.
        </p>
      );
    }
    return (
      <OpportunityBoard
        data={data}
        filters={filters}
        scrapedAtLabel={
          data.scrapedAt ? new Date(data.scrapedAt).toLocaleString("pt-BR") : "agora"
        }
      />
    );
  } catch {
    return (
      <p className="rounded-xl border border-red-200 bg-white px-4 py-6 text-red-700">
        Não foi possível ler o banco. Suba o Postgres com{" "}
        <code className="font-mono">docker compose up -d</code> e rode o crawler.
      </p>
    );
  }
}

function parseFilters(params: SearchParams): OpportunityFilters {
  const decision = text(params.decisao);
  const source = text(params.fonte);
  return {
    department: text(params.departamento) || "todas",
    decision:
      decision === "comprar" || decision === "observar" || decision === "descartar"
        ? decision
        : "todas",
    source: source === "aliexpress" || source === "alibaba" ? source : "todas",
  };
}

function text(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || "";
}
