import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { BestSellersBrowser, type BestSellerRow } from "./best-sellers-browser";
import { CatalogFilterSidebar, HydrateCatalogFacets } from "./catalog-filters";
import { FilterPanelProvider, FilterPanelShift } from "./filter-panel";
import {
  listBestSellers,
  listCatalogFacets,
  type BestSeller,
  type CatalogFilters,
  type SupplierQuote,
} from "@/lib/best-sellers";

export const metadata = {
  title: "Catálogo de mais vendidos",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <FilterPanelProvider>
      <div className="flex min-h-0 flex-1 flex-col bg-zinc-100 font-sans text-zinc-950">
        <main className="mx-auto flex w-full min-h-0 max-w-[90rem] flex-1 flex-col px-4 py-8 sm:px-6">
          <FilterPanelShift className="flex min-h-0 flex-1 flex-col gap-6">
            <header className="flex shrink-0 flex-col gap-2">
              <p className="text-sm font-medium text-amber-700">Mercado Livre</p>
              <h1 className="text-3xl font-semibold tracking-tight">Mais vendidos</h1>
              <p className="max-w-3xl text-balance text-zinc-600">
                Os mais vendidos de cada categoria do Mercado Livre que também existem
                no AliExpress ou no Alibaba. Os dois sites são pesquisados em real: AliExpress
                é o preço de vitrine sem frete, Alibaba é o preço do menor lote. Só entra a
                oferta que passou na verificação: mesmo tipo, mesmas especificações, mesma
                quantidade e marca, e foto parecida. “Mesma foto” e “mesmo modelo” são as
                confirmações mais fortes. A decisão de compra e de investimento está em{" "}
                <Link href="/oportunidades" className="text-zinc-900 underline underline-offset-2">
                  Oportunidades
                </Link>
                .
              </p>
            </header>
            <Suspense fallback={null}>
              <CatalogFilterSidebar />
            </Suspense>
            <Suspense fallback={null}>
              <FilterFacets />
            </Suspense>
            <Suspense fallback={<TableSkeleton />}>
              <BestSellersTable searchParams={searchParams} />
            </Suspense>
          </FilterPanelShift>
        </main>
      </div>
    </FilterPanelProvider>
  );
}

async function FilterFacets() {
  await connection();
  try {
    const facets = await listCatalogFacets();
    return (
      <HydrateCatalogFacets
        departments={facets.departments}
        categories={facets.categories}
      />
    );
  } catch {
    return null;
  }
}

async function BestSellersTable({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const filters = parseFilters(await searchParams);

  try {
    const [facets, catalog] = await Promise.all([
      listCatalogFacets(),
      listBestSellers(filters),
    ]);

    if (facets.products === 0) {
      return (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-zinc-600">
          Nenhum item salvo. Rode <code className="font-mono">npm run scrape</code>.
        </p>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-sm text-zinc-600">
          Atualizado em{" "}
          {facets.scrapedAt
            ? new Date(facets.scrapedAt).toLocaleString("pt-BR")
            : "agora"}
          .
        </p>
        <BestSellersBrowser
          rows={catalog.rows.map(toRow)}
          total={catalog.total}
          page={catalog.page}
          filters={{ ...filters, page: catalog.page }}
        />
      </div>
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

function parseFilters(params: SearchParams): CatalogFilters {
  const sort = text(params.ordem);
  const sorts = new Set<CatalogFilters["sort"]>([
    "rank",
    "price-asc",
    "price-desc",
    "sold-desc",
    "title",
    "gap-desc",
  ]);
  const shipping = text(params.frete);
  const presence = text(params.presenca);
  const page = Number(text(params.page) || "1");

  return {
    query: text(params.q),
    department: text(params.departamento) || "todas",
    category: text(params.categoria) || "todas",
    shipping: shipping === "gratis" || shipping === "pago" ? shipping : "todos",
    minPrice: text(params.precoMin),
    maxPrice: text(params.precoMax),
    minSold: text(params.vendas),
    aliMin: text(params.aliMin),
    aliMax: text(params.aliMax),
    alibabaMin: text(params.alibabaMin),
    alibabaMax: text(params.alibabaMax),
    presence: parsePresence(presence),
    sort: sorts.has(sort as CatalogFilters["sort"])
      ? (sort as CatalogFilters["sort"])
      : "rank",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function text(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || "";
}

const PRESENCE_VALUES = new Set<CatalogFilters["presence"]>([
  "algum",
  "ambos",
  "todos",
  "so_meli",
  "so_aliexpress",
]);

function parsePresence(value: string): CatalogFilters["presence"] {
  return PRESENCE_VALUES.has(value as CatalogFilters["presence"])
    ? (value as CatalogFilters["presence"])
    : "algum";
}

function toRow(row: BestSeller): BestSellerRow {
  return {
    itemId: row.item_id,
    categoryId: row.category_id,
    categoryName: row.category_name || row.category_id,
    departmentName: row.department_name || "Outros",
    title: row.title,
    price: numberOrNull(row.price),
    originalPrice: numberOrNull(row.original_price),
    currency: row.currency_id || "BRL",
    permalink: row.permalink,
    thumbnail: row.thumbnail,
    rank: row.rank,
    freeShipping: row.free_shipping,
    soldQuantity: row.sold_quantity,
    soldLabel: row.sold_label,
    aliexpress: toQuote(row.aliexpress),
    alibaba: toQuote(row.alibaba),
  };
}

function toQuote(quote: SupplierQuote | null) {
  if (!quote) return null;
  return {
    title: quote.title,
    priceBrl: quote.priceBrl,
    unitPriceBrl: quote.unitPriceBrl,
    packRatio: quote.packRatio,
    url: quote.url,
    verdict: quote.verdict,
    crossChecked: quote.crossChecked,
    minOrder: quote.minOrder,
    orderUnit: quote.orderUnit,
  };
}

function numberOrNull(value: string | null) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function TableSkeleton() {
  return <div className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-white" />;
}
