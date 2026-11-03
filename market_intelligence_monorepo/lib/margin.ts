import { round2 } from "./format";

export const BASE_SCENARIO = {
  name: "base_prospeccao",
  listingType: "gold_special",
  feePct: 0.12,
  packagingBrl: 1.5,
  adsPct: 0,
  icmsRate: 0.17,
  uf: "SP",
  fxUsdBrl: 5.4,
  customsThresholdUsd: 50,
  dutyAbove: 0.6,
  deductionUsd: 30,
  outboundFreightAbove79: 18,
  outboundFreightBelow79: 0,
  freeShippingThreshold: 79,
  marginFloorPct: 0.25,
  marginFloorBrl: 15,
  cycleDaysDirect: 39,
  cycleDaysStock: 60,
  ruleVersion: "plano-2026-10-22",
} as const;

export type SupplyMode = "direct_to_customer" | "import_then_ml";
export type Decision = "comprar" | "observar" | "descartar";
export type MatchStrength = "strong" | "candidate" | "none";

export type CostBreakdown = {
  itemCostBrl: number;
  intlFreightBrl: number;
  vUsd: number | null;
  dutyBrl: number;
  icmsBrl: number;
  landedCostBrl: number;
  packagingBrl: number;
  mlPercentageFeeBrl: number;
  mlShippingBrl: number;
  adsBrl: number;
  contributionMarginBrl: number;
  contributionMarginPct: number;
  minPriceBrl: number | null;
  capitalReturn30d: number | null;
  nearThreshold: boolean;
  taxApplied: boolean;
  missingFreight: boolean;
  missingDimensions: boolean;
  feeSource: "fallback";
  freightSource: "fallback";
  inputConfidence: "low";
  supplyMode: SupplyMode;
  caveats: string[];
};

export function computeImportTax(customsValueBrl: number, fxUsdBrl: number = BASE_SCENARIO.fxUsdBrl) {
  const vUsd = customsValueBrl / fxUsdBrl;
  const dutyBrl =
    vUsd <= BASE_SCENARIO.customsThresholdUsd
      ? 0
      : BASE_SCENARIO.dutyAbove * customsValueBrl - BASE_SCENARIO.deductionUsd * fxUsdBrl;
  const icmsBrl =
    (customsValueBrl + dutyBrl) / (1 - BASE_SCENARIO.icmsRate) * BASE_SCENARIO.icmsRate;
  return {
    vUsd,
    dutyBrl: round2(Math.max(0, dutyBrl)),
    icmsBrl: round2(Math.max(0, icmsBrl)),
    nearThreshold: vUsd >= 45 && vUsd <= 60,
  };
}

export function outboundFreight(priceBrl: number) {
  return priceBrl >= BASE_SCENARIO.freeShippingThreshold
    ? BASE_SCENARIO.outboundFreightAbove79
    : BASE_SCENARIO.outboundFreightBelow79;
}

export function minPriceForFloor(landedCostBrl: number) {
  const denom =
    1 - BASE_SCENARIO.feePct - BASE_SCENARIO.adsPct - BASE_SCENARIO.marginFloorPct;
  if (denom <= 0) return null;

  const candidates = [
    {
      freight: BASE_SCENARIO.outboundFreightBelow79,
      inBand: (price: number) => price > 0 && price < BASE_SCENARIO.freeShippingThreshold,
    },
    {
      freight: BASE_SCENARIO.outboundFreightAbove79,
      inBand: (price: number) => price >= BASE_SCENARIO.freeShippingThreshold,
    },
  ];

  const valid = candidates
    .map(({ freight, inBand }) => {
      const price = (landedCostBrl + BASE_SCENARIO.packagingBrl + freight) / denom;
      return inBand(price) ? round2(price) : null;
    })
    .filter((price): price is number => price != null);

  return valid.length > 0 ? Math.min(...valid) : null;
}

export function scoreMatch(verdict: string | null): MatchStrength {
  if (verdict === "foto" || verdict === "modelo") return "strong";
  if (verdict) return "candidate";
  return "none";
}

export function computeCost(input: {
  priceBrl: number;
  supplierCostBrl: number;
  source: "aliexpress" | "alibaba";
  matchStrength: MatchStrength;
}): CostBreakdown {
  const caveats: string[] = [];
  const taxApplied = input.source === "aliexpress";
  const supplyMode: SupplyMode =
    input.source === "aliexpress" ? "direct_to_customer" : "import_then_ml";
  const itemCostBrl = round2(input.supplierCostBrl);
  const intlFreightBrl = 0;
  const missingFreight = true;
  const missingDimensions = true;

  caveats.push("Frete internacional ausente; custo posto fica otimista.");
  caveats.push("Tarifa ML 12% é fallback, sem cotação de listing_prices.");
  caveats.push("Frete de saída é premissa (R$ 18 acima de R$ 79, R$ 0 abaixo).");
  caveats.push("Peso e dimensão ausentes: fora do ranking de compra.");

  let dutyBrl = 0;
  let icmsBrl = 0;
  let vUsd: number | null = null;
  let nearThreshold = false;

  if (taxApplied) {
    const tax = computeImportTax(itemCostBrl + intlFreightBrl);
    dutyBrl = tax.dutyBrl;
    icmsBrl = tax.icmsBrl;
    vUsd = tax.vUsd;
    nearThreshold = tax.nearThreshold;
    caveats.push("II e ICMS estimados (Remessa Conforme PF). Checkout do AliExpress pode já ter imposto.");
  } else {
    caveats.push("Importação formal sem NCM: imposto de entrada não entra na conta.");
  }

  const landedCostBrl = round2(itemCostBrl + intlFreightBrl + dutyBrl + icmsBrl);
  const packagingBrl = BASE_SCENARIO.packagingBrl;
  const mlPercentageFeeBrl = round2(input.priceBrl * BASE_SCENARIO.feePct);
  const mlShippingBrl = outboundFreight(input.priceBrl);
  const adsBrl = round2(input.priceBrl * BASE_SCENARIO.adsPct);
  const contributionMarginBrl = round2(
    input.priceBrl -
      landedCostBrl -
      packagingBrl -
      mlPercentageFeeBrl -
      mlShippingBrl -
      adsBrl,
  );
  const contributionMarginPct = input.priceBrl === 0 ? 0 : contributionMarginBrl / input.priceBrl;
  const disbursement = landedCostBrl + packagingBrl;
  const cycleDays =
    supplyMode === "direct_to_customer"
      ? BASE_SCENARIO.cycleDaysDirect
      : BASE_SCENARIO.cycleDaysStock;
  const capitalReturn30d =
    disbursement > 0 ? (contributionMarginBrl / disbursement) * (30 / cycleDays) : null;

  if (input.matchStrength !== "strong") {
    caveats.push("Correspondência não aceita (sem GTIN). Fica candidata até revisão.");
  }
  if (nearThreshold) {
    caveats.push("Valor aduaneiro perto de US$ 50: o degrau de II pode virar a margem.");
  }

  return {
    itemCostBrl,
    intlFreightBrl,
    vUsd,
    dutyBrl,
    icmsBrl,
    landedCostBrl,
    packagingBrl,
    mlPercentageFeeBrl,
    mlShippingBrl,
    adsBrl,
    contributionMarginBrl,
    contributionMarginPct,
    minPriceBrl: minPriceForFloor(landedCostBrl),
    capitalReturn30d,
    nearThreshold,
    taxApplied,
    missingFreight,
    missingDimensions,
    feeSource: "fallback",
    freightSource: "fallback",
    inputConfidence: "low",
    supplyMode,
    caveats,
  };
}

export function decide(input: {
  hasMatch: boolean;
  matchStrength: MatchStrength;
  cost: CostBreakdown | null;
}): Decision {
  if (!input.hasMatch || !input.cost) return "observar";
  if (input.cost.contributionMarginBrl < 0) return "descartar";
  const floorsMet =
    input.cost.contributionMarginPct >= BASE_SCENARIO.marginFloorPct &&
    input.cost.contributionMarginBrl >= BASE_SCENARIO.marginFloorBrl;
  const officialEnough =
    input.cost.inputConfidence !== "low" &&
    !input.cost.missingDimensions &&
    input.matchStrength === "strong";
  if (floorsMet && officialEnough) return "comprar";
  return "observar";
}

assertTaxRegression();

function assertTaxRegression() {
  const below = computeImportTax(100, 5);
  const above = computeImportTax(330, 5);
  if (below.dutyBrl !== 0 || below.icmsBrl !== 20.48) {
    throw new Error(
      `Regressão de imposto abaixo de US$ 50 falhou: II=${below.dutyBrl} ICMS=${below.icmsBrl}`,
    );
  }
  if (above.dutyBrl !== 48 || above.icmsBrl !== 77.42) {
    throw new Error(
      `Regressão de imposto acima de US$ 50 falhou: II=${above.dutyBrl} ICMS=${above.icmsBrl}`,
    );
  }
}
