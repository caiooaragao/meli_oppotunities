"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FunnelChart, HistogramChart, ScatterChart, Waterfall } from "./charts";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type {
  DepartmentStat,
  OpportunityDashboard,
  OpportunityFilters,
  OpportunityRow,
  SourcingRow,
} from "@/lib/opportunities";

export function OpportunityBoard({
  data,
  filters,
  scrapedAtLabel,
}: {
  data: OpportunityDashboard;
  filters: OpportunityFilters;
  scrapedAtLabel: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.rows[0]?.itemId ?? null);
  const selected = data.rows.find((row) => row.itemId === selectedId) ?? data.rows[0] ?? null;

  function update(partial: Partial<OpportunityFilters>) {
    const next = { ...filters, ...partial };
    const params = new URLSearchParams();
    if (next.department !== "todas") params.set("departamento", next.department);
    if (next.decision !== "todas") params.set("decisao", next.decision);
    if (next.source !== "todas") params.set("fonte", next.source);
    router.replace(
      params.size ? `/oportunidades?${params.toString()}` : "/oportunidades",
      { scroll: false },
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
            Cobertura{" "}
            <span className="font-semibold text-zinc-900">{formatPercent(data.coverage * 100, 2)}</span>
            : {formatNumber(data.matched)} casados em {formatNumber(data.discovered)}{" "}
            descobertos. Nenhuma linha vira comprar enquanto tarifa, frete e peso forem
            fallback.
          </p>
          <p className="text-xs text-zinc-500">Atualizado em {scrapedAtLabel}.</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Metric label="Comprar" value={data.decisions.comprar} tone="buy" />
          <Metric label="Observar" value={data.decisions.observar} tone="watch" />
          <Metric label="Descartar" value={data.decisions.descartar} tone="drop" />
          <Metric label="Sem fornecedor (fila)" value={data.discovered - data.matched} />
        </dl>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field label="Departamento" htmlFor="departamento">
          <select
            id="departamento"
            value={filters.department}
            onChange={(event) => update({ department: event.target.value })}
            className={inputClass}
          >
            <option value="todas">Todos</option>
            {data.departmentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Decisão" htmlFor="decisao">
          <select
            id="decisao"
            value={filters.decision}
            onChange={(event) =>
              update({ decision: event.target.value as OpportunityFilters["decision"] })
            }
            className={inputClass}
          >
            <option value="todas">Todas</option>
            <option value="observar">Observar</option>
            <option value="descartar">Descartar</option>
            <option value="comprar">Comprar</option>
          </select>
        </Field>
        <Field label="Fonte" htmlFor="fonte">
          <select
            id="fonte"
            value={filters.source}
            onChange={(event) =>
              update({ source: event.target.value as OpportunityFilters["source"] })
            }
            className={inputClass}
          >
            <option value="todas">AliExpress ou Alibaba</option>
            <option value="aliexpress">AliExpress (envio direto)</option>
            <option value="alibaba">Alibaba (estoque)</option>
          </select>
        </Field>
      </form>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <FunnelChart steps={data.funnel} />
        {data.rows.length > 0 ? (
          <ScatterChart rows={data.rows} selectedId={selected?.itemId ?? null} onSelect={setSelectedId} />
        ) : (
          <p className="text-sm text-zinc-600">
            Sem produto casado neste recorte. O mapa só entra quando houver correspondência.
          </p>
        )}
      </div>

      {data.rows.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <HistogramChart bins={data.histogram} floorPct={data.floorPct} />
          {selected ? <Waterfall row={selected} /> : null}
        </div>
      ) : null}

      {data.rows.length > 0 ? (
        <RankingTable rows={data.rows} selectedId={selected?.itemId ?? null} onSelect={setSelectedId} />
      ) : null}

      {selected ? <ProductNotes row={selected} /> : null}

      <SourcingSection departments={data.departments} rows={data.sourcing} />

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Cenário {data.scenarioName} · regra {data.ruleVersion} · PTAX premissa {data.fxUsdBrl.toFixed(2)}{" "}
        USD/BRL · piso {data.floorPct}% e {formatMoney(data.floorBrl)} · anúncio clássico 12% fallback ·
        ICMS SP 17% só no AliExpress · volume vendido é faixa do anúncio, não velocidade do dia.
        Item sem peso fica fora de comprar, mesmo com margem no piso.
      </p>
    </section>
  );
}

function RankingTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: OpportunityRow[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-zinc-900">Lista de trabalho</h2>
        <p className="text-xs text-zinc-500">
          Ordenada por decisão e margem em reais. Clique para abrir a composição.
        </p>
      </div>
      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-xs">
          <thead className="text-[10px] uppercase tracking-normal text-zinc-500">
            <tr>
              {[
                "Decisão",
                "Produto",
                "Fonte",
                "p vitrine",
                "Custo posto",
                "Tarifa",
                "Frete",
                "Margem",
                "Mín. piso",
                "Retorno 30d",
                "Lote",
                "Volume",
              ].map((label) => (
                <th key={label} className={headerCell}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.itemId === selectedId;
              return (
                <tr
                  key={row.itemId}
                  onClick={() => onSelect(row.itemId)}
                  className={
                    "cursor-pointer " + (selected ? "bg-amber-50" : "hover:bg-zinc-50")
                  }
                >
                  <td className={bodyCell}>
                    <DecisionBadge decision={row.decision} />
                    {row.cost.nearThreshold ? (
                      <div className="mt-0.5 text-[10px] text-amber-800">perto de US$ 50</div>
                    ) : null}
                  </td>
                  <td className={bodyCell}>
                    <div className="flex items-center gap-2">
                      {row.thumbnail ? (
                        <Image
                          src={row.thumbnail.replace(/^http:\/\//, "https://")}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 shrink-0 rounded border border-zinc-200 object-contain"
                        />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded bg-zinc-100" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{row.title}</p>
                        <p className="text-[10px] text-zinc-500">
                          {row.departmentName} · {matchLabel(row)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={bodyCell}>
                    {row.source === "aliexpress" ? "AliExpress" : "Alibaba"}
                    <div className="text-[10px] text-zinc-500">
                      {row.cost.supplyMode === "direct_to_customer" ? "envio direto" : "estoque"}
                    </div>
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.price)}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.cost.landedCostBrl)}
                    <div className="text-[10px] text-zinc-500">
                      fonte {formatMoney(row.supplierCostBrl)}
                    </div>
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.cost.mlPercentageFeeBrl)}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.cost.mlShippingBrl)}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    <span
                      className={
                        row.cost.contributionMarginBrl >= 0 ? "text-emerald-800" : "text-red-700"
                      }
                    >
                      {formatMoney(row.cost.contributionMarginBrl)}
                    </span>
                    <div className="text-[10px] text-zinc-500">
                      {formatPercent(row.cost.contributionMarginPct * 100)}
                    </div>
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.cost.minPriceBrl)}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {row.cost.capitalReturn30d == null
                      ? "—"
                      : formatPercent(row.cost.capitalReturn30d * 100, 0)}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                    {formatMoney(row.lotCapitalBrl)}
                    {row.minOrder != null && row.minOrder > 1 ? (
                      <div className="text-[10px] text-zinc-500">
                        mín. {formatNumber(row.minOrder)} {row.orderUnit || ""}
                      </div>
                    ) : null}
                  </td>
                  <td className={bodyCell + " whitespace-nowrap text-zinc-700"}>
                    {row.soldLabel || formatNumber(row.soldQuantity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductNotes({ row }: { row: OpportunityRow }) {
  return (
    <aside className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">Por que esta linha está assim</h2>
          <p className="mt-1 max-w-3xl text-xs text-zinc-600">{row.title}</p>
        </div>
        <div className="flex gap-3 text-xs">
          {row.permalink ? (
            <a href={row.permalink} target="_blank" rel="noreferrer" className="text-zinc-800 underline">
              Mercado Livre
            </a>
          ) : null}
          {row.supplierUrl ? (
            <a
              href={row.supplierUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-800 underline"
            >
              {row.source === "aliexpress" ? "AliExpress" : "Alibaba"}
            </a>
          ) : null}
        </div>
      </div>
      <ul className="mt-3 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
        {row.cost.caveats.map((caveat) => (
          <li key={caveat}>— {caveat}</li>
        ))}
      </ul>
    </aside>
  );
}

function SourcingSection({
  departments,
  rows,
}: {
  departments: DepartmentStat[];
  rows: SourcingRow[];
}) {
  const hot = useMemo(
    () =>
      [...departments]
        .filter((row) => row.products >= 50)
        .sort((left, right) => left.matchRate - right.matchRate || right.products - left.products)
        .slice(0, 10),
    [departments],
  );
  const maxProducts = Math.max(...hot.map((row) => row.products), 1);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Onde investir a busca de fornecedor
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Demanda já está na vitrine. Sem correspondência aceita não há margem para decidir
          compra. A fila abaixo prioriza volume declarado × preço — o sinal de quanto a
          categoria está girando, não uma previsão de faturamento.
        </p>
      </div>

      {hot.length > 0 ? (
        <figure className="flex flex-col gap-3">
          <figcaption className="text-sm font-medium text-zinc-900">
            Departamentos com mais vitrine e menos fornecedor
          </figcaption>
          <ul className="flex flex-col gap-2">
            {hot.map((row) => (
              <li
                key={row.department}
                className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_8rem] items-center gap-3"
              >
                <span className="truncate text-xs text-zinc-700">{row.department}</span>
                <div className="h-2 rounded-sm bg-zinc-100">
                  <div
                    className="h-2 rounded-sm bg-zinc-800"
                    style={{ width: `${(row.products / maxProducts) * 100}%` }}
                  />
                </div>
                <span className="text-right text-[11px] tabular-nums text-zinc-500">
                  {formatNumber(row.products)} · {formatPercent(row.matchRate * 100, 1)} casados
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zinc-500">
            Eixo: produtos únicos no departamento. A taxa de casados é cobertura, não margem.
          </p>
        </figure>
      ) : null}

      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-xs">
          <thead className="text-[10px] uppercase tracking-normal text-zinc-500">
            <tr>
              {["#", "Produto", "Departamento", "Preço", "Faixa ≥ R$ 79", "Promo", "Volume"].map(
                (label) => (
                  <th key={label} className={headerCell}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.itemId}>
                <td className={bodyCell + " text-zinc-500"}>{row.rank}</td>
                <td className={bodyCell}>
                  <div className="flex items-center gap-2">
                    {row.thumbnail ? (
                      <Image
                        src={row.thumbnail.replace(/^http:\/\//, "https://")}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded border border-zinc-200 object-contain"
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded bg-zinc-100" />
                    )}
                    {row.permalink ? (
                      <a
                        href={row.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                      >
                        {row.title}
                      </a>
                    ) : (
                      <span className="font-medium">{row.title}</span>
                    )}
                  </div>
                </td>
                <td className={bodyCell + " text-zinc-700"}>
                  {row.departmentName}
                  <div className="text-[10px] text-zinc-400">{row.categoryName}</div>
                </td>
                <td className={bodyCell + " whitespace-nowrap tabular-nums"}>
                  {formatMoney(row.price)}
                </td>
                <td className={bodyCell}>{row.aboveFreightThreshold ? "Paga frete" : "Abaixo"}</td>
                <td className={bodyCell}>{row.promo ? "Sim" : "Não"}</td>
                <td className={bodyCell + " whitespace-nowrap"}>
                  {row.soldLabel || formatNumber(row.soldQuantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "buy" | "watch" | "drop";
}) {
  const color =
    tone === "buy"
      ? "text-emerald-800"
      : tone === "watch"
        ? "text-amber-800"
        : tone === "drop"
          ? "text-zinc-700"
          : "text-zinc-900";
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={"text-2xl font-semibold tabular-nums tracking-tight " + color}>
        {value.toLocaleString("pt-BR")}
      </dd>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: OpportunityRow["decision"] }) {
  const styles = {
    comprar: "bg-emerald-100 text-emerald-900",
    observar: "bg-amber-100 text-amber-900",
    descartar: "bg-zinc-200 text-zinc-700",
  };
  return (
    <span className={"inline-block rounded px-1.5 py-0.5 text-[10px] font-medium " + styles[decision]}>
      {decision}
    </span>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      {label}
      {children}
    </label>
  );
}

function matchLabel(row: OpportunityRow) {
  if (row.verdict === "foto") return "mesma foto";
  if (row.verdict === "modelo") return "mesmo modelo";
  return "candidato por título";
}

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500";

const headerCell =
  "sticky top-0 z-10 bg-zinc-50 px-2 py-2 text-left font-medium shadow-[inset_0_-1px_0_0_rgb(228,228,231)]";

const bodyCell = "border-b border-zinc-100 px-2 py-2 align-middle";
