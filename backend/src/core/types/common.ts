export type Nullable<T> = T | null;

export interface Principal {
  userId: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  /** Set only inside the hub portal: the franchisee's own hub. */
  hubId?: string;
}

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: Nullable<string>;
  hasMore: boolean;
}
