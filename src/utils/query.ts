/** Escapa un texto para usarlo dentro de un RegExp de búsqueda. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: any, defaultLimit = 20, maxLimit = 100): Pagination {
  const page = Math.max(1, Math.floor(Number(query?.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query?.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Montos en centavos: enteros no negativos. */
export function toCents(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}
