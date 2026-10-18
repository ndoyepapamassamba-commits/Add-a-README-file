// Catalogue: products, templates and their prices.
import type { Config, Product, Template } from "./types.ts";

export const PRODUCTS: readonly Product[] = ["cv", "lettre", "pack", "premium"];
export const TEMPLATES: readonly Template[] = ["classique", "moderne", "elegant"];
export const DEFAULT_TEMPLATE: Template = "classique";

export function isProduct(v: unknown): v is Product {
  return typeof v === "string" && (PRODUCTS as readonly string[]).includes(v);
}

export function isTemplate(v: unknown): v is Template {
  return typeof v === "string" && (TEMPLATES as readonly string[]).includes(v);
}

export function priceOf(product: Product, config: Pick<Config, "prices">): number {
  return config.prices[product];
}

export function needsCv(product: Product): boolean {
  return product !== "lettre";
}

export function needsLetter(product: Product): boolean {
  return product === "lettre" || product === "pack";
}
