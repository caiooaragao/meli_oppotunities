"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  FILTER_PANEL_WIDTH,
  useFilterPanel,
} from "./filter-panel";
import type { CatalogCategory } from "@/lib/best-sellers";

export type BrowserFilters = {
  query: string;
  department: string;
  category: string;
  shipping: "todos" | "gratis" | "pago";
  minPrice: string;
  maxPrice: string;
  minSold: string;
  aliMin: string;
  aliMax: string;
  alibabaMin: string;
  alibabaMax: string;
  presence: "algum" | "ambos" | "todos" | "so_meli" | "so_aliexpress";
  sort: "rank" | "price-asc" | "price-desc" | "sold-desc" | "title" | "gap-desc";
  page: number;
};

export function HydrateCatalogFacets({
  departments,
  categories,
}: {
  departments: string[];
  categories: CatalogCategory[];
}) {
  const { setFacets } = useFilterPanel();
  useEffect(() => {
    setFacets({ departments, categories });
  }, [departments, categories, setFacets]);
  return null;
}

const TEXT_DEBOUNCE_MS = 450;

export function catalogHref(next: BrowserFilters) {
  const params = new URLSearchParams();
  if (next.query.trim()) params.set("q", next.query.trim());
  if (next.department !== "todas") params.set("departamento", next.department);
  if (next.category !== "todas") params.set("categoria", next.category);
  if (next.shipping !== "todos") params.set("frete", next.shipping);
  if (next.minPrice.trim()) params.set("precoMin", next.minPrice.trim());
  if (next.maxPrice.trim()) params.set("precoMax", next.maxPrice.trim());
  if (next.minSold.trim()) params.set("vendas", next.minSold.trim());
  if (next.aliMin.trim()) params.set("aliMin", next.aliMin.trim());
  if (next.aliMax.trim()) params.set("aliMax", next.aliMax.trim());
  if (next.alibabaMin.trim()) params.set("alibabaMin", next.alibabaMin.trim());
  if (next.alibabaMax.trim()) params.set("alibabaMax", next.alibabaMax.trim());
  if (next.presence !== "algum") params.set("presenca", next.presence);
  if (next.sort !== "rank") params.set("ordem", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  return params.size ? `/?${params.toString()}` : "/";
}

export function filtersFromSearchParams(params: URLSearchParams): BrowserFilters {
  const sort = params.get("ordem") || "";
  const sorts = new Set<BrowserFilters["sort"]>([
    "rank",
    "price-asc",
    "price-desc",
    "sold-desc",
    "title",
    "gap-desc",
  ]);
  const shipping = params.get("frete") || "";
  const presence = params.get("presenca") || "";
  const page = Number(params.get("page") || "1");
  return {
    query: params.get("q") || "",
    department: params.get("departamento") || "todas",
    category: params.get("categoria") || "todas",
    shipping: shipping === "gratis" || shipping === "pago" ? shipping : "todos",
    minPrice: params.get("precoMin") || "",
    maxPrice: params.get("precoMax") || "",
    minSold: params.get("vendas") || "",
    aliMin: params.get("aliMin") || "",
    aliMax: params.get("aliMax") || "",
    alibabaMin: params.get("alibabaMin") || "",
    alibabaMax: params.get("alibabaMax") || "",
    presence:
      presence === "ambos" ||
      presence === "todos" ||
      presence === "so_meli" ||
      presence === "so_aliexpress"
        ? presence
        : "algum",
    sort: sorts.has(sort as BrowserFilters["sort"]) ? (sort as BrowserFilters["sort"]) : "rank",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export function CatalogFilterSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const urlFilters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );

  const [query, setQuery] = useState(urlFilters.query);
  const [minPrice, setMinPrice] = useState(urlFilters.minPrice);
  const [maxPrice, setMaxPrice] = useState(urlFilters.maxPrice);
  const [minSold, setMinSold] = useState(urlFilters.minSold);
  const [aliMin, setAliMin] = useState(urlFilters.aliMin);
  const [aliMax, setAliMax] = useState(urlFilters.aliMax);
  const [alibabaMin, setAlibabaMin] = useState(urlFilters.alibabaMin);
  const [alibabaMax, setAlibabaMax] = useState(urlFilters.alibabaMax);
  const [department, setDepartment] = useState(urlFilters.department);
  const [category, setCategory] = useState(urlFilters.category);
  const [shipping, setShipping] = useState(urlFilters.shipping);
  const [presence, setPresence] = useState(urlFilters.presence);
  const [sort, setSort] = useState(urlFilters.sort);
  const focused = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useRef<BrowserFilters>(urlFilters);
  const {
    open: filtersOpen,
    setOpen: setFiltersOpen,
    marginOn,
    setMarginOn,
    margin,
    setMargin,
    valueOn,
    setValueOn,
    valueMargin,
    setValueMargin,
    departments = [],
    categories = [],
  } = useFilterPanel();

  draft.current = {
    query,
    department,
    category,
    shipping,
    minPrice,
    maxPrice,
    minSold,
    aliMin,
    aliMax,
    alibabaMin,
    alibabaMax,
    presence,
    sort,
    page: urlFilters.page,
  };

  useEffect(() => {
    const next = filtersFromSearchParams(searchParams);
    const skip = focused.current;
    if (skip !== "busca") setQuery(next.query);
    if (skip !== "preco-min") setMinPrice(next.minPrice);
    if (skip !== "preco-max") setMaxPrice(next.maxPrice);
    if (skip !== "vendas-min") setMinSold(next.minSold);
    if (skip !== "ali-min") setAliMin(next.aliMin);
    if (skip !== "ali-max") setAliMax(next.aliMax);
    if (skip !== "alibaba-min") setAlibabaMin(next.alibabaMin);
    if (skip !== "alibaba-max") setAlibabaMax(next.alibabaMax);
    setDepartment(next.department);
    setCategory(next.category);
    setShipping(next.shipping);
    setPresence(next.presence);
    setSort(next.sort);
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const source =
      department === "todas"
        ? categories
        : categories.filter((item) => item.department === department);
    return [...new Set(source.map((item) => item.name))].sort((left, right) =>
      left.localeCompare(right, "pt-BR"),
    );
  }, [categories, department]);
  const activeCategory = categoryOptions.includes(category) ? category : "todas";

  function go(partial: Partial<BrowserFilters>, resetPage = true) {
    const next = {
      ...draft.current,
      ...partial,
      page: resetPage ? 1 : (partial.page ?? draft.current.page),
    };
    draft.current = next;
    const href = catalogHref(next);
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}` || "/";
      if (href === current) return;
    }
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function scheduleText() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({}), TEXT_DEBOUNCE_MS);
  }

  function flushText() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    go({});
  }

  function onText(
    setter: (value: string) => void,
    key: keyof BrowserFilters,
    value: string,
  ) {
    setter(value);
    draft.current = { ...draft.current, [key]: value };
    scheduleText();
  }

  const panelMotion =
    "transition-transform duration-300 ease-in-out motion-reduce:transition-none";

  return (
    <>
      {filtersOpen ? (
        <button
          type="button"
          aria-label="Fechar painel de filtros"
          className="fixed inset-0 z-40 bg-zinc-900/40 lg:hidden"
          onClick={() => setFiltersOpen(false)}
        />
      ) : null}

      <aside
        style={{ width: FILTER_PANEL_WIDTH }}
        className={
          "fixed top-0 left-0 z-50 flex h-dvh flex-col border-r border-zinc-200 bg-white shadow-xl " +
          panelMotion +
          " " +
          (filtersOpen ? "translate-x-0" : "-translate-x-full")
        }
        aria-hidden={!filtersOpen}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Filtros</h2>
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            <ChevronLeftIcon />
            Recolher
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field label="Busca" htmlFor="busca">
            <input
              id="busca"
              value={query}
              onFocus={() => {
                focused.current = "busca";
              }}
              onBlur={() => {
                focused.current = null;
                flushText();
              }}
              onChange={(event) => onText(setQuery, "query", event.target.value)}
              placeholder="Nome do produto"
              className={inputClass}
            />
          </Field>
          <Field label="Departamento" htmlFor="departamento">
            <select
              id="departamento"
              value={department}
              onChange={(event) => {
                const nextDepartment = event.target.value;
                const names =
                  nextDepartment === "todas"
                    ? categories.map((item) => item.name)
                    : categories
                        .filter((item) => item.department === nextDepartment)
                        .map((item) => item.name);
                const nextCategory = names.includes(category) ? category : "todas";
                setDepartment(nextDepartment);
                setCategory(nextCategory);
                go({ department: nextDepartment, category: nextCategory });
              }}
              className={inputClass}
            >
              <option value="todas">Todos</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoria" htmlFor="categoria">
            <select
              id="categoria"
              value={activeCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setCategory(nextCategory);
                go({ category: nextCategory });
              }}
              className={inputClass}
            >
              <option value="todas">Todas</option>
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nos outros sites" htmlFor="presenca">
            <select
              id="presenca"
              value={presence}
              onChange={(event) => {
                const nextPresence = event.target.value as BrowserFilters["presence"];
                setPresence(nextPresence);
                go({ presence: nextPresence });
              }}
              className={inputClass}
            >
              <option value="algum">Com AliExpress ou Alibaba</option>
              <option value="so_aliexpress">Só no AliExpress (sem Alibaba)</option>
              <option value="ambos">AliExpress e Alibaba</option>
              <option value="so_meli">Só no Mercado Livre</option>
              <option value="todos">Todos do catálogo ML</option>
            </select>
          </Field>
          <Field label="Frete" htmlFor="frete">
            <select
              id="frete"
              value={shipping}
              onChange={(event) => {
                const nextShipping = event.target.value as BrowserFilters["shipping"];
                setShipping(nextShipping);
                go({ shipping: nextShipping });
              }}
              className={inputClass}
            >
              <option value="todos">Todos</option>
              <option value="gratis">Grátis</option>
              <option value="pago">Pago</option>
            </select>
          </Field>
          <TextNumber
            id="preco-min"
            label="Preço mínimo"
            value={minPrice}
            focused={focused}
            onChange={(value) => onText(setMinPrice, "minPrice", value)}
            onBlurFlush={flushText}
          />
          <TextNumber
            id="preco-max"
            label="Preço máximo"
            value={maxPrice}
            focused={focused}
            onChange={(value) => onText(setMaxPrice, "maxPrice", value)}
            onBlurFlush={flushText}
          />
          <MarginControl
            id="margem"
            label="Margem (%)"
            value={margin}
            step="0.1"
            on={marginOn}
            title="Margem sobre o preço do Mercado Livre. (preço ML − preço da fonte) ÷ preço ML."
            switchLabel="Colorir pela margem em porcentagem"
            onChange={setMargin}
            onToggle={() => setMarginOn((current) => !current)}
          />
          <MarginControl
            id="margem-valor"
            label="Margem (R$)"
            value={valueMargin}
            step="0.01"
            on={valueOn}
            title="Diferença em reais. Preço do Mercado Livre menos o preço da fonte."
            switchLabel="Colorir pela margem em reais"
            onChange={setValueMargin}
            onToggle={() => setValueOn((current) => !current)}
          />
          <TextNumber
            id="vendas-min"
            label="Vendas mínimas"
            value={minSold}
            step="1"
            focused={focused}
            onChange={(value) => onText(setMinSold, "minSold", value)}
            onBlurFlush={flushText}
          />
          <TextNumber
            id="ali-min"
            label="Dif. mín. AliExpress"
            title="Preço do Mercado Livre menos o do AliExpress. Positivo significa que o AliExpress está mais barato."
            value={aliMin}
            focused={focused}
            onChange={(value) => onText(setAliMin, "aliMin", value)}
            onBlurFlush={flushText}
          />
          <TextNumber
            id="ali-max"
            label="Dif. máx. AliExpress"
            title="Preço do Mercado Livre menos o do AliExpress."
            value={aliMax}
            focused={focused}
            onChange={(value) => onText(setAliMax, "aliMax", value)}
            onBlurFlush={flushText}
          />
          <TextNumber
            id="alibaba-min"
            label="Dif. mín. Alibaba"
            title="Preço do Mercado Livre menos o do Alibaba. Positivo significa que o Alibaba está mais barato."
            value={alibabaMin}
            focused={focused}
            onChange={(value) => onText(setAlibabaMin, "alibabaMin", value)}
            onBlurFlush={flushText}
          />
          <TextNumber
            id="alibaba-max"
            label="Dif. máx. Alibaba"
            title="Preço do Mercado Livre menos o do Alibaba."
            value={alibabaMax}
            focused={focused}
            onChange={(value) => onText(setAlibabaMax, "alibabaMax", value)}
            onBlurFlush={flushText}
          />
          <Field label="Ordenar" htmlFor="ordenar">
            <select
              id="ordenar"
              value={sort}
              onChange={(event) => {
                const nextSort = event.target.value as BrowserFilters["sort"];
                setSort(nextSort);
                go({ sort: nextSort });
              }}
              className={inputClass}
            >
              <option value="rank">Posição</option>
              <option value="sold-desc">Mais vendas</option>
              <option value="price-asc">Menor preço</option>
              <option value="price-desc">Maior preço</option>
              <option value="gap-desc">Maior diferença vs fonte</option>
              <option value="title">Nome</option>
            </select>
          </Field>
        </form>
      </aside>

      {!filtersOpen ? (
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label="Abrir filtros"
          className={
            "fixed top-1/2 left-0 z-40 -translate-y-1/2 rounded-r-lg border border-l-0 border-zinc-200 bg-white py-3 pl-1 pr-2 shadow-md " +
            panelMotion +
            " hover:bg-zinc-50"
          }
        >
          <ChevronRightIcon />
        </button>
      ) : null}
    </>
  );
}

function TextNumber({
  id,
  label,
  value,
  step = "0.01",
  title,
  focused,
  onChange,
  onBlurFlush,
}: {
  id: string;
  label: string;
  value: string;
  step?: string;
  title?: string;
  focused: { current: string | null };
  onChange: (value: string) => void;
  onBlurFlush: () => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        min="0"
        step={step}
        value={value}
        title={title}
        onFocus={() => {
          focused.current = id;
        }}
        onBlur={() => {
          focused.current = null;
          onBlurFlush();
        }}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

function MarginControl({
  id,
  label,
  value,
  step,
  title,
  on,
  switchLabel,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  step: string;
  title: string;
  on: boolean;
  switchLabel: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex h-10 items-center gap-2">
        <input
          id={id}
          type="number"
          step={step}
          value={value}
          disabled={!on}
          title={title}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass + " min-w-0 flex-1 disabled:bg-zinc-50 disabled:text-zinc-400"}
        />
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={switchLabel}
          onClick={onToggle}
          className={
            "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
            (on ? "bg-emerald-600" : "bg-zinc-300")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform " +
              (on ? "translate-x-5" : "")
            }
          />
        </button>
      </div>
    </Field>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      {label}
      {children}
    </label>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500";
