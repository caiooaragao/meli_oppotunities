"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { catalogHref, type BrowserFilters } from "./catalog-filters";
import { useFilterPanel } from "./filter-panel";

const PAGE_SIZE = 50;

export type BestSellerRow = {
  itemId: string;
  categoryId: string;
  categoryName: string;
  departmentName: string;
  title: string;
  price: number | null;
  originalPrice: number | null;
  currency: string;
  permalink: string | null;
  thumbnail: string | null;
  rank: number;
  freeShipping: boolean;
  soldQuantity: number | null;
  soldLabel: string | null;
  aliexpress: SupplierPrice | null;
  alibaba: SupplierPrice | null;
};

export type SupplierPrice = {
  title: string;
  priceBrl: number | null;
  unitPriceBrl: number | null;
  packRatio: number;
  url: string | null;
  verdict: string | null;
  crossChecked: boolean;
  minOrder: number | null;
  orderUnit: string | null;
};

export function BestSellersBrowser({
  rows,
  total,
  page,
  filters,
}: {
  rows: BestSellerRow[];
  total: number;
  page: number;
  filters: BrowserFilters;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const {
    open: filtersOpen,
    setOpen: setFiltersOpen,
    marginOn,
    margin,
    valueOn,
    valueMargin,
  } = useFilterPanel();
  const marginRule = marginRuleFrom(marginOn, margin);
  const valueRule = marginRuleFrom(valueOn, valueMargin);
  const activeFilterChips = useMemo(() => buildActiveFilterChips(filters), [filters]);
  const activeFilterCount = activeFilterChips.length;

  function go(partial: Partial<BrowserFilters>, resetPage = true) {
    const next = {
      ...filters,
      ...partial,
      page: resetPage ? 1 : (partial.page ?? filters.page),
    };
    const href = catalogHref(next);
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}` || "/";
      if (href === current) return;
    }
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function removeFilterChip(id: string) {
    switch (id) {
      case "query":
        go({ query: "" });
        break;
      case "department":
        go({ department: "todas", category: "todas" });
        break;
      case "category":
        go({ category: "todas" });
        break;
      case "shipping":
        go({ shipping: "todos" });
        break;
      case "minPrice":
        go({ minPrice: "" });
        break;
      case "maxPrice":
        go({ maxPrice: "" });
        break;
      case "minSold":
        go({ minSold: "" });
        break;
      case "aliMin":
        go({ aliMin: "" });
        break;
      case "aliMax":
        go({ aliMax: "" });
        break;
      case "alibabaMin":
        go({ alibabaMin: "" });
        break;
      case "alibabaMax":
        go({ alibabaMax: "" });
        break;
      case "presence":
        go({ presence: "algum" });
        break;
      case "sort":
        go({ sort: "rank" });
        break;
      default:
        break;
    }
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              aria-expanded={filtersOpen}
            >
              <FilterIcon />
              Filtros
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <p className="shrink-0 text-sm whitespace-nowrap text-zinc-600">
              {total.toLocaleString("pt-BR")} produtos
              {total > PAGE_SIZE ? ` · página ${page} de ${pageCount}` : ""}
            </p>
        {pageCount > 1 ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => go({ page: page - 1 }, false)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => go({ page: page + 1 }, false)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        ) : null}
          </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <ActiveFilterChips
            chips={activeFilterChips}
            onRemove={removeFilterChip}
          />
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-zinc-600">Nenhum produto com esses filtros.</p>
          ) : (
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-xs leading-snug">
              <thead className="text-[10px] uppercase tracking-normal text-zinc-500">
                <tr>
                  <th className={headerCell + " w-8 px-1"}>#</th>
                  <th className={headerCell}>Produto</th>
                  <th className={headerCell}>Categoria</th>
                  <th className={headerCell}>Preço ML</th>
                  <th className={headerCell}>AliExpress</th>
                  <th className={headerCell}>Dif. AliExpress</th>
                  <th className={headerCell}>Alibaba</th>
                  <th className={headerCell}>Dif. Alibaba</th>
                  <th className={headerCell}>Vendas</th>
                  <th className={headerCell}>Frete</th>
                  <th className={headerCell + " w-8 px-0.5"}>
                    <span className="sr-only">Links</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.itemId}-${row.categoryId}`}>
                    <td className={bodyCell + " w-8 px-1 font-medium text-zinc-500"}>{row.rank}</td>
                    <td className={bodyCell}>
                      <div className="flex items-center gap-2">
                        {row.thumbnail ? (
                          <Image
                            src={row.thumbnail.replace(/^http:\/\//, "https://")}
                            alt=""
                            width={40}
                            height={40}
                            className="h-10 w-10 shrink-0 rounded border border-zinc-200 object-contain"
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded bg-zinc-100" />
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
                      <div>{row.categoryName}</div>
                      {row.departmentName && row.departmentName !== row.categoryName ? (
                        <div className="text-[10px] text-zinc-400">{row.departmentName}</div>
                      ) : null}
                    </td>
                    <td className={bodyCell + " whitespace-nowrap"}>
                      <div className={priceClass}>{formatMoney(row.price, row.currency)}</div>
                      {row.originalPrice != null && row.originalPrice !== row.price ? (
                        <div className="text-[10px] text-zinc-400 line-through">
                          {formatMoney(row.originalPrice, row.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td className={bodyCell}>
                      <SupplierCell quote={row.aliexpress} />
                    </td>
                    <td className={bodyCell}>
                      <DifferenceCell
                        mlPrice={row.price}
                        sourcePrice={row.aliexpress?.priceBrl ?? null}
                        showPercent={marginRule.active}
                        tone={marginTone(row.price, row.aliexpress?.priceBrl ?? null, marginRule, valueRule)}
                      />
                    </td>
                    <td className={bodyCell}>
                      <SupplierCell quote={row.alibaba} wholesale />
                    </td>
                    <td className={bodyCell}>
                      <DifferenceCell
                        mlPrice={row.price}
                        sourcePrice={row.alibaba?.priceBrl ?? null}
                        showPercent={marginRule.active}
                        tone={marginTone(row.price, row.alibaba?.priceBrl ?? null, marginRule, valueRule)}
                      />
                    </td>
                    <td className={bodyCell + " whitespace-nowrap text-zinc-700"}>
                      {row.soldLabel ||
                        (row.soldQuantity != null
                          ? row.soldQuantity.toLocaleString("pt-BR")
                          : "—")}
                    </td>
                    <td className={bodyCell + " text-zinc-700"}>
                      {row.freeShipping ? "Grátis" : "Pago"}
                    </td>
                    <td className={bodyCell + " w-8 px-0.5"}>
                      <RowLinks
                        mercadoLivre={row.permalink}
                        aliexpress={row.aliexpress?.url ?? null}
                        alibaba={row.alibaba?.url ?? null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}

type ActiveFilterChip = { id: string; label: string };

const PRESENCE_CHIP_LABELS: Record<BrowserFilters["presence"], string> = {
  algum: "",
  ambos: "AliExpress e Alibaba",
  todos: "Todo o catálogo ML",
  so_meli: "Só no Mercado Livre",
  so_aliexpress: "Só no AliExpress",
};

const SORT_CHIP_LABELS: Record<BrowserFilters["sort"], string> = {
  rank: "",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
  "sold-desc": "Mais vendas",
  title: "Nome",
  "gap-desc": "Maior diferença vs fonte",
};

function buildActiveFilterChips(filters: BrowserFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const query = filters.query.trim();
  if (query) chips.push({ id: "query", label: `Busca: ${query}` });
  if (filters.department !== "todas") {
    chips.push({ id: "department", label: `Departamento: ${filters.department}` });
  }
  if (filters.category !== "todas") {
    chips.push({ id: "category", label: `Categoria: ${filters.category}` });
  }
  if (filters.shipping === "gratis") {
    chips.push({ id: "shipping", label: "Frete grátis" });
  } else if (filters.shipping === "pago") {
    chips.push({ id: "shipping", label: "Frete pago" });
  }
  if (filters.minPrice.trim()) {
    chips.push({ id: "minPrice", label: `Preço mín.: ${filters.minPrice}` });
  }
  if (filters.maxPrice.trim()) {
    chips.push({ id: "maxPrice", label: `Preço máx.: ${filters.maxPrice}` });
  }
  if (filters.minSold.trim()) {
    chips.push({ id: "minSold", label: `Vendas mín.: ${filters.minSold}` });
  }
  if (filters.aliMin.trim()) {
    chips.push({ id: "aliMin", label: `Dif. Ali mín.: ${filters.aliMin}` });
  }
  if (filters.aliMax.trim()) {
    chips.push({ id: "aliMax", label: `Dif. Ali máx.: ${filters.aliMax}` });
  }
  if (filters.alibabaMin.trim()) {
    chips.push({ id: "alibabaMin", label: `Dif. Alibaba mín.: ${filters.alibabaMin}` });
  }
  if (filters.alibabaMax.trim()) {
    chips.push({ id: "alibabaMax", label: `Dif. Alibaba máx.: ${filters.alibabaMax}` });
  }
  if (filters.presence !== "algum") {
    const label = PRESENCE_CHIP_LABELS[filters.presence];
    if (label) chips.push({ id: "presence", label });
  }
  if (filters.sort !== "rank") {
    const label = SORT_CHIP_LABELS[filters.sort];
    if (label) chips.push({ id: "sort", label: `Ordem: ${label}` });
  }
  return chips;
}

function ActiveFilterChips({
  chips,
  onRemove,
}: {
  chips: ActiveFilterChip[];
  onRemove: (id: string) => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="border-b border-zinc-100 bg-zinc-50/90 px-3 py-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            title={`Remover ${chip.label}`}
            onClick={() => onRemove(chip.id)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-medium leading-none text-amber-950 shadow-sm hover:border-amber-300 hover:bg-amber-100"
            aria-label={`Remover filtro ${chip.label}`}
          >
            <span className="whitespace-nowrap">{chip.label}</span>
            <span aria-hidden="true" className="text-sm leading-none text-amber-800">
              ×
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2.628 4.5A1.5 1.5 0 0 1 4.118 3h11.764a1.5 1.5 0 0 1 1.115 2.502l-4.652 5.351v4.147a.75.75 0 0 1-1.127.648l-2.5-1.5a.75.75 0 0 1-.373-.648v-2.647L2.628 4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const headerCell =
  "sticky top-0 z-10 bg-zinc-50 px-1.5 py-1.5 text-left font-medium shadow-[inset_0_-1px_0_0_rgb(228,228,231)]";

const bodyCell = "border-b border-zinc-100 px-1.5 py-1.5 align-middle";

const priceClass = "font-semibold text-emerald-700";

function SupplierCell({
  quote,
  wholesale = false,
}: {
  quote: SupplierPrice | null;
  wholesale?: boolean;
}) {
  if (!quote || quote.priceBrl == null) {
    return <span className="text-zinc-400">—</span>;
  }
  const amountClass = "font-medium text-zinc-900";

  const label = VERDICT_LABEL[quote.verdict ?? ""] ?? "Verificado";
  const order =
    wholesale && quote.minOrder != null
      ? `mín. ${formatQuantity(quote.minOrder)} ${quote.orderUnit || ""}`.trim()
      : null;
  const pack =
    quote.packRatio > 1 && quote.unitPriceBrl != null
      ? `${quote.packRatio} × ${formatMoney(quote.unitPriceBrl, "BRL")}`
      : null;

  return (
    <div className="min-w-0 max-w-[9rem]">
      {quote.url ? (
        <a
          href={quote.url}
          target="_blank"
          rel="noreferrer"
          className={`${amountClass} underline-offset-2 hover:underline`}
          title={quote.title}
        >
          {formatMoney(quote.priceBrl, "BRL")}
        </a>
      ) : (
        <div className={amountClass}>{formatMoney(quote.priceBrl, "BRL")}</div>
      )}
      <div className="text-[10px] leading-tight text-zinc-500">{label}</div>
      {quote.crossChecked ? (
        <div className="text-[10px] leading-tight text-emerald-700">Bate com o outro site</div>
      ) : null}
      {pack ? <div className="text-[10px] leading-tight text-zinc-500">{pack}</div> : null}
      {order ? <div className="text-[10px] leading-tight text-zinc-500">{order}</div> : null}
    </div>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  foto: "Mesma foto",
  modelo: "Mesmo modelo",
  provavel: "Título e foto batem",
};

function DifferenceCell({
  mlPrice,
  sourcePrice,
  tone = null,
  showPercent = false,
}: {
  mlPrice: number | null;
  sourcePrice: number | null;
  tone?: MarginTone;
  showPercent?: boolean;
}) {
  if (mlPrice == null || sourcePrice == null) {
    return <span className="text-zinc-400">—</span>;
  }

  const gap = mlPrice - sourcePrice;
  const prefix = gap > 0 ? "+" : "";
  const percent = marginPercent(mlPrice, sourcePrice);

  return (
    <div className="whitespace-nowrap">
      <div className={differenceToneClass(tone)}>
        {prefix}
        {formatMoney(gap, "BRL")}
      </div>
      <div
        className={
          "text-[10px] leading-tight " +
          (tone === "below"
            ? "text-red-600"
            : tone === "above"
              ? "text-emerald-700"
              : "text-zinc-500")
        }
      >
        {showPercent && percent != null
          ? `${formatPercent(percent)} de margem`
          : gap > 0
            ? "fonte mais barata"
            : gap < 0
              ? "fonte mais cara"
              : "mesmo preço"}
      </div>
    </div>
  );
}

type MarginTone = "above" | "below" | null;

function marginPercent(mlPrice: number | null, sourcePrice: number | null) {
  if (mlPrice == null || sourcePrice == null || mlPrice === 0) return null;
  return ((mlPrice - sourcePrice) / mlPrice) * 100;
}

type MarginRule = { active: boolean; threshold: number };

function marginRuleFrom(on: boolean, raw: string): MarginRule {
  const threshold = Number(raw);
  return {
    active: on && raw.trim() !== "" && !Number.isNaN(threshold),
    threshold,
  };
}

function marginTone(
  mlPrice: number | null,
  sourcePrice: number | null,
  percentRule: MarginRule,
  valueRule: MarginRule,
): MarginTone {
  if (mlPrice == null || sourcePrice == null) return null;
  const checks: boolean[] = [];
  if (percentRule.active) {
    const percent = marginPercent(mlPrice, sourcePrice);
    if (percent == null) return null;
    checks.push(percent >= percentRule.threshold);
  }
  if (valueRule.active) checks.push(mlPrice - sourcePrice >= valueRule.threshold);
  if (checks.length === 0) return null;
  return checks.every(Boolean) ? "above" : "below";
}

function differenceToneClass(tone: MarginTone) {
  if (tone === "below") return "font-semibold text-red-600";
  if (tone === "above") return "font-semibold text-emerald-700";
  return "font-medium text-zinc-800";
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function RowLinks({
  mercadoLivre,
  aliexpress,
  alibaba,
}: {
  mercadoLivre: string | null;
  aliexpress: string | null;
  alibaba: string | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const links = [
    mercadoLivre ? { label: "Mercado Livre", href: mercadoLivre } : null,
    aliexpress ? { label: "AliExpress", href: aliexpress } : null,
    alibaba ? { label: "Alibaba", href: alibaba } : null,
  ].filter((link): link is { label: string; href: string } => link != null);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = links.length * 40 + 8;
    const top =
      window.innerHeight - rect.bottom < menuHeight ? rect.top - menuHeight : rect.bottom;
    setPosition({ top, left: rect.right });
  }

  function show() {
    if (links.length === 0) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }

  function hide() {
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Ver anúncio"
        disabled={links.length === 0}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300"
      >
        <GearIcon />
      </button>
      {open && links.length > 0 ? (
        <div
          className="fixed z-50 min-w-40 -translate-x-full rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.53 1.53 0 0 1-2.28.95c-1.37-.84-2.94.73-2.1 2.1.54.88.06 2.04-.95 2.28-1.56.38-1.56 2.6 0 2.98a1.53 1.53 0 0 1 .95 2.28c-.84 1.37.73 2.94 2.1 2.1.88-.54 2.04-.06 2.28.95.38 1.56 2.6 1.56 2.98 0a1.53 1.53 0 0 1 2.28-.95c1.37.84 2.94-.73 2.1-2.1a1.53 1.53 0 0 1 .95-2.28c1.56-.38 1.56-2.6 0-2.98a1.53 1.53 0 0 1-.95-2.28c.84-1.37-.73-2.94-2.1-2.1a1.53 1.53 0 0 1-2.28-.95ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(value);
}
