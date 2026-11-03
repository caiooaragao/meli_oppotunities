"use client";

import type { FunnelStep, OpportunityRow } from "@/lib/opportunities";
import { formatMoney, formatPercent } from "@/lib/format";
import { BASE_SCENARIO, outboundFreight } from "@/lib/margin";

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((step) => step.value), 1);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium text-zinc-900">
        Funil da coleta até a decisão de compra
      </figcaption>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-600">{step.label}</p>
              <div className="mt-1 h-2 rounded-sm bg-zinc-100">
                <div
                  className={
                    "h-2 rounded-sm " + (step.key === "buy" ? "bg-emerald-700" : "bg-zinc-800")
                  }
                  style={{ width: `${Math.max(2, (step.value / max) * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-right text-sm tabular-nums text-zinc-900">
              {step.value.toLocaleString("pt-BR")}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-zinc-500">
        Unidade: produtos únicos. Fonte: best_sellers + supplier_matches · cenário{" "}
        {BASE_SCENARIO.name}.
      </p>
    </figure>
  );
}

export function HistogramChart({
  bins,
  floorPct,
}: {
  bins: { bin: string; count: number }[];
  floorPct: number;
}) {
  const max = Math.max(...bins.map((bin) => bin.count), 1);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium text-zinc-900">
        Distribuição da margem de contribuição
      </figcaption>
      <div className="flex h-40 items-end gap-2">
        {bins.map((bin) => (
          <div key={bin.bin} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] tabular-nums text-zinc-600">{bin.count}</span>
            <div className="flex h-28 w-full items-end rounded-sm bg-zinc-100">
              <div
                className={
                  "w-full rounded-sm " +
                  (bin.bin.startsWith("25") || bin.bin.startsWith("35")
                    ? "bg-emerald-700"
                    : "bg-zinc-700")
                }
                style={{ height: `${Math.max(bin.count === 0 ? 0 : 8, (bin.count / max) * 100)}%` }}
              />
            </div>
            <span className="text-center text-[10px] leading-tight text-zinc-500">{bin.bin}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">
        Eixo x: margem de contribuição em faixas. Eixo y: produtos casados. Verde a partir do
        piso de {floorPct}%. Só correspondência; confiança baixa não entra em comprar.
      </p>
    </figure>
  );
}

export function ScatterChart({
  rows,
  selectedId,
  onSelect,
}: {
  rows: OpportunityRow[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const width = 640;
  const height = 340;
  const pad = { top: 16, right: 16, bottom: 44, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const prices = rows.map((row) => row.price);
  const landed = rows.map((row) => row.cost.landedCostBrl);
  const maxX = Math.max(120, ...prices) * 1.08;
  const maxY = Math.max(120, ...landed) * 1.08;
  const x = (value: number) => pad.left + (value / maxX) * innerW;
  const y = (value: number) => pad.top + innerH - (value / maxY) * innerH;

  const line = (floorPct: number) => {
    const points: string[] = [];
    for (const price of [1, 78.99, 79, maxX]) {
      const ceiling = landedCeiling(price, floorPct);
      points.push(`${x(price)},${y(Math.max(0, ceiling))}`);
    }
    return points.join(" ");
  };

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium text-zinc-900">
        Mapa de oportunidade: preço de vitrine × custo posto
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        <title>Custo posto contra preço de vitrine, com linhas de margem zero e piso de 25%</title>
        {[0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y(maxY * tick)}
              y2={y(maxY * tick)}
              stroke="#e4e4e7"
            />
            <text
              x={pad.left - 8}
              y={y(maxY * tick) + 4}
              textAnchor="end"
              className="fill-zinc-500"
              fontSize="10"
            >
              {Math.round(maxY * tick)}
            </text>
          </g>
        ))}
        <polyline fill="none" stroke="#a1a1aa" strokeDasharray="4 4" points={line(0)} />
        <polyline fill="none" stroke="#047857" points={line(0.25)} />
        {rows.map((row) => {
          const selected = row.itemId === selectedId;
          return (
            <circle
              key={row.itemId}
              cx={x(row.price)}
              cy={y(row.cost.landedCostBrl)}
              r={selected ? 7 : 5}
              className="cursor-pointer"
              fill={
                row.decision === "comprar"
                  ? "#047857"
                  : row.decision === "observar"
                    ? "#b45309"
                    : "#71717a"
              }
              stroke={selected ? "#18181b" : "white"}
              strokeWidth={selected ? 2 : 1}
              onClick={() => onSelect(row.itemId)}
            >
              <title>{`${row.title} · ML ${formatMoney(row.price)} · posto ${formatMoney(row.cost.landedCostBrl)}`}</title>
            </circle>
          );
        })}
        <text
          x={pad.left + innerW / 2}
          y={height - 8}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="11"
        >
          Preço de vitrine (R$)
        </text>
        <text
          x={16}
          y={pad.top + innerH / 2}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="11"
          transform={`rotate(-90 16 ${pad.top + innerH / 2})`}
        >
          Custo posto (R$)
        </text>
      </svg>
      <p className="text-[11px] text-zinc-500">
        Cada ponto é um produto casado. Abaixo da linha verde o custo posto cabe no piso de 25%
        (tarifa e frete medianos do cenário). Tracejada: margem zero. Âmbar observar, cinza
        descartar.
      </p>
    </figure>
  );
}

export function Waterfall({ row }: { row: OpportunityRow }) {
  const items = [
    { label: "Mercadoria", value: row.cost.itemCostBrl },
    ...(row.cost.taxApplied
      ? [
          { label: "II", value: row.cost.dutyBrl },
          { label: "ICMS", value: row.cost.icmsBrl },
        ]
      : []),
    { label: "Embalagem", value: row.cost.packagingBrl },
    { label: "Tarifa ML", value: row.cost.mlPercentageFeeBrl },
    { label: "Frete de saída", value: row.cost.mlShippingBrl },
  ];
  const costTotal = items.reduce((sum, item) => sum + item.value, 0);
  const scale = Math.max(row.price, costTotal, 1);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium text-zinc-900">
        Composição do preço · {row.title}
      </figcaption>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.label} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2">
            <span className="text-xs text-zinc-600">{item.label}</span>
            <div className="h-2 rounded-sm bg-zinc-100">
              <div
                className="h-2 rounded-sm bg-zinc-700"
                style={{ width: `${(item.value / scale) * 100}%` }}
              />
            </div>
            <span className="text-right text-xs tabular-nums text-zinc-800">
              {formatMoney(item.value)}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2">
          <span className="text-xs text-zinc-600">Margem</span>
          <div className="h-2 rounded-sm bg-zinc-100">
            <div
              className={
                "h-2 rounded-sm " +
                (row.cost.contributionMarginBrl >= 0 ? "bg-emerald-700" : "bg-red-700")
              }
              style={{
                width: `${(Math.abs(row.cost.contributionMarginBrl) / scale) * 100}%`,
              }}
            />
          </div>
          <span
            className={
              "text-right text-xs tabular-nums " +
              (row.cost.contributionMarginBrl >= 0 ? "text-emerald-800" : "text-red-700")
            }
          >
            {formatMoney(row.cost.contributionMarginBrl)}
          </span>
        </li>
      </ul>
      <p className="text-xs text-zinc-600">
        Preço de referência {formatMoney(row.price)} · margem{" "}
        {formatPercent(row.cost.contributionMarginPct * 100)} · preço mínimo para o piso{" "}
        {formatMoney(row.cost.minPriceBrl)}.
      </p>
      <p className="text-[11px] text-zinc-500">
        Componentes em R$. A soma deve encostar no preço de vitrine. Fonte: mart calculada ·{" "}
        {row.cost.supplyMode === "direct_to_customer" ? "envio direto" : "importar e estocar"} ·
        tarifa {row.cost.feeSource}.
      </p>
    </figure>
  );
}

function landedCeiling(price: number, floorPct: number) {
  return (
    price -
    BASE_SCENARIO.packagingBrl -
    price * BASE_SCENARIO.feePct -
    outboundFreight(price) -
    price * floorPct
  );
}
