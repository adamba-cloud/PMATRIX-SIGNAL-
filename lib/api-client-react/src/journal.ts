import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export type TradeOutcome = "WIN" | "LOSS" | "BREAK_EVEN";
export type TradeDirection = "BUY" | "SELL";

export interface TradeEntry {
  id: number;
  pair: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  lotSize: string;
  outcome: TradeOutcome;
  pnl: string;
  pips: string | null;
  notes: string | null;
  tradeDate: string;
  createdAt: string;
}

export interface TradeListResponse {
  trades: TradeEntry[];
  limit: number;
  offset: number;
}

export interface JournalStats {
  total: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  currentStreak: number;
  currentStreakType: string;
  bestWinStreak: number;
  dailyPnl: { date: string; pnl: number }[];
  topPairs: { pair: string; trades: number; pnl: number; wins: number }[];
}

export interface CreateTradeInput {
  pair: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  lotSize?: string;
  outcome: TradeOutcome;
  pnl: string;
  pips?: string;
  notes?: string;
  tradeDate: string;
}

export type UpdateTradeInput = Partial<CreateTradeInput>;

// ─── Stats ────────────────────────────────────────────────────────────────────

export const getJournalStatsQueryKey = () => ["/api/journal/stats"] as const;

export const getJournalStats = async (options?: RequestInit): Promise<JournalStats> =>
  customFetch<JournalStats>("/api/journal/stats", { ...options, method: "GET" });

export const useGetJournalStats = <
  TData = Awaited<ReturnType<typeof getJournalStats>>,
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof getJournalStats>>, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getJournalStatsQueryKey(),
    queryFn: () => getJournalStats(),
    ...options?.query,
  } as UseQueryOptions<Awaited<ReturnType<typeof getJournalStats>>, TError, TData>);

// ─── List ─────────────────────────────────────────────────────────────────────

export const getJournalQueryKey = (params?: { limit?: number; offset?: number }) =>
  ["/api/journal", params] as const;

export const getJournalTrades = async (
  params?: { limit?: number; offset?: number },
  options?: RequestInit
): Promise<TradeListResponse> => {
  const qs = params ? `?limit=${params.limit ?? 100}&offset=${params.offset ?? 0}` : "";
  return customFetch<TradeListResponse>(`/api/journal${qs}`, { ...options, method: "GET" });
};

export const useGetJournalTrades = <
  TData = Awaited<ReturnType<typeof getJournalTrades>>,
  TError = ErrorType<unknown>,
>(
  params?: { limit?: number; offset?: number },
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof getJournalTrades>>, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getJournalQueryKey(params),
    queryFn: () => getJournalTrades(params),
    ...options?.query,
  } as UseQueryOptions<Awaited<ReturnType<typeof getJournalTrades>>, TError, TData>);

// ─── Create ───────────────────────────────────────────────────────────────────

export const createJournalTrade = async (data: CreateTradeInput, options?: RequestInit): Promise<TradeEntry> =>
  customFetch<TradeEntry>("/api/journal", { ...options, method: "POST", body: JSON.stringify(data) });

export const useCreateJournalTrade = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createJournalTrade>>,
      TError,
      { data: CreateTradeInput },
      TContext
    >;
  }
): UseMutationResult<Awaited<ReturnType<typeof createJournalTrade>>, TError, { data: CreateTradeInput }, TContext> => {
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof createJournalTrade>>, { data: CreateTradeInput }> =
    ({ data }) => createJournalTrade(data);
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateJournalTrade = async (
  id: number,
  data: UpdateTradeInput,
  options?: RequestInit
): Promise<TradeEntry> =>
  customFetch<TradeEntry>(`/api/journal/${id}`, { ...options, method: "PATCH", body: JSON.stringify(data) });

export const useUpdateJournalTrade = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateJournalTrade>>,
      TError,
      { id: number; data: UpdateTradeInput },
      TContext
    >;
  }
): UseMutationResult<
  Awaited<ReturnType<typeof updateJournalTrade>>,
  TError,
  { id: number; data: UpdateTradeInput },
  TContext
> => {
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateJournalTrade>>,
    { id: number; data: UpdateTradeInput }
  > = ({ id, data }) => updateJournalTrade(id, data);
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Delete ───────────────────────────────────────────────────────────────────

export const deleteJournalTrade = async (id: number, options?: RequestInit): Promise<void> =>
  customFetch<void>(`/api/journal/${id}`, { ...options, method: "DELETE" });

export const useDeleteJournalTrade = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<void, TError, { id: number }, TContext>;
  }
): UseMutationResult<void, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<void, { id: number }> = ({ id }) => deleteJournalTrade(id);
  return useMutation({ mutationFn, ...options?.mutation });
};
