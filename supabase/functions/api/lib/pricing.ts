// Catalogue: products, templates and their prices.
import type { Config, OrderInput, Product, Template } from "./types.ts";

export const PRODUCTS: readonly Product[] = ["cv", "lettre", "pack", "stage", "premium"];
export const TEMPLATES: readonly Template[] = ["classique", "moderne", "elegant"];
export const DEFAULT_TEMPLATE: Template = "classique";

/** Pack Stage: 1 to 5 target companies; from 2 companies on, the multi-company price applies. */
export const STAGE_MAX_COMPANIES = 5;
export const STAGE_MULTI_FROM = 2;

export function isProduct(v: unknown): v is Product {
  return typeof v === "string" && (PRODUCTS as readonly string[]).includes(v);
}

export function isTemplate(v: unknown): v is Template {
  return typeof v === "string" && (TEMPLATES as readonly string[]).includes(v);
}

export function priceOf(product: Product, config: Pick<Config, "prices">): number {
  return config.prices[product];
}

/**
 * Amount charged for a validated order. Pack Stage: `prices.stage` for one company,
 * `stageMultiPrice` for 2–5 companies (counted server-side from internship.companies).
 */
export function orderPrice(
  product: Product,
  data: Pick<OrderInput, "internship">,
  config: Pick<Config, "prices" | "stageMultiPrice">,
): number {
  const companies = data.internship?.companies.length ?? 0;
  if (product === "stage" && companies >= STAGE_MULTI_FROM) return config.stageMultiPrice;
  return priceOf(product, config);
}

export function needsCv(product: Product): boolean {
  return product !== "lettre";
}

/** Products whose letter comes from `letter` (the Pack Stage writes its letters from `internship`). */
export function needsLetter(product: Product): boolean {
  return product === "lettre" || product === "pack";
}

export function needsInternship(product: Product): boolean {
  return product === "stage";
}
