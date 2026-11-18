export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;
