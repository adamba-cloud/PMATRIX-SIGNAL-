/**
 * Copy trading API client — hand-written to match generated patterns.
 */
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CopyTradeLink {
  id: number;
  masterAccountId: number;
  slaveAccountId: number;
  volumeMultiplier: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCopyTradeLinkInput {
  masterAccountId: number;
  slaveAccountId: number;
  volumeMultiplier?: number;
}

export interface UpdateCopyTradeLinkInput {
  isActive?: boolean;
  volumeMultiplier?: number;
}

export type CopyTradeStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface CopyTradeLog {
  id: number;
  masterAccountId: number;
  slaveAccountId: number;
  jobId: string | null;
  masterTicket: string;
  slaveTicket: string | null;
  symbol: string;
  direction: string;
  volume: string;
  entryPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  status: CopyTradeStatus;
  errorMessage: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopyTradeLogsResponse {
  logs: CopyTradeLog[];
  limit: number;
  offset: number;
}

// ─── Links ────────────────────────────────────────────────────────────────────

export const getGetCopyTradeLinksQueryKey = () => ["/api/copy-trading/links"] as const;

export const getGetCopyTradeLinksUrl = () => `/api/copy-trading/links`;

export const getCopyTradeLinks = async (options?: RequestInit): Promise<CopyTradeLink[]> =>
  customFetch<CopyTradeLink[]>(getGetCopyTradeLinksUrl(), { ...options, method: "GET" });

export const useGetCopyTradeLinks = <
  TData = Awaited<ReturnType<typeof getCopyTradeLinks>>,
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof getCopyTradeLinks>>, TError, TData> }
): UseQueryResult<TData, TError> => {
  const queryOptions = options?.query ?? {};
  return useQuery({
    queryKey: getGetCopyTradeLinksQueryKey(),
    queryFn: () => getCopyTradeLinks(),
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof getCopyTradeLinks>>, TError, TData>);
};

export const createCopyTradeLink = async (
  data: CreateCopyTradeLinkInput,
  options?: RequestInit
): Promise<CopyTradeLink> =>
  customFetch<CopyTradeLink>(getGetCopyTradeLinksUrl(), {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });

export const useCreateCopyTradeLink = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createCopyTradeLink>>,
      TError,
      { data: CreateCopyTradeLinkInput },
      TContext
    >;
  }
): UseMutationResult<
  Awaited<ReturnType<typeof createCopyTradeLink>>,
  TError,
  { data: CreateCopyTradeLinkInput },
  TContext
> => {
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof createCopyTradeLink>>,
    { data: CreateCopyTradeLinkInput }
  > = ({ data }) => createCopyTradeLink(data);
  return useMutation({ mutationFn, ...options?.mutation });
};

export const updateCopyTradeLink = async (
  id: number,
  data: UpdateCopyTradeLinkInput,
  options?: RequestInit
): Promise<CopyTradeLink> =>
  customFetch<CopyTradeLink>(`/api/copy-trading/links/${id}`, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const useUpdateCopyTradeLink = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateCopyTradeLink>>,
      TError,
      { id: number; data: UpdateCopyTradeLinkInput },
      TContext
    >;
  }
): UseMutationResult<
  Awaited<ReturnType<typeof updateCopyTradeLink>>,
  TError,
  { id: number; data: UpdateCopyTradeLinkInput },
  TContext
> => {
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateCopyTradeLink>>,
    { id: number; data: UpdateCopyTradeLinkInput }
  > = ({ id, data }) => updateCopyTradeLink(id, data);
  return useMutation({ mutationFn, ...options?.mutation });
};

export const deleteCopyTradeLink = async (id: number, options?: RequestInit): Promise<void> =>
  customFetch<void>(`/api/copy-trading/links/${id}`, { ...options, method: "DELETE" });

export const useDeleteCopyTradeLink = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteCopyTradeLink>>,
      TError,
      { id: number },
      TContext
    >;
  }
): UseMutationResult<
  Awaited<ReturnType<typeof deleteCopyTradeLink>>,
  TError,
  { id: number },
  TContext
> => {
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteCopyTradeLink>>,
    { id: number }
  > = ({ id }) => deleteCopyTradeLink(id);
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const getGetCopyTradeLogsQueryKey = (params?: { limit?: number; offset?: number }) =>
  ["/api/copy-trading/logs", params] as const;

export const getCopyTradeLogs = async (
  params?: { limit?: number; offset?: number },
  options?: RequestInit
): Promise<CopyTradeLogsResponse> => {
  const qs = params ? `?limit=${params.limit ?? 50}&offset=${params.offset ?? 0}` : "";
  return customFetch<CopyTradeLogsResponse>(`/api/copy-trading/logs${qs}`, {
    ...options,
    method: "GET",
  });
};

export const useGetCopyTradeLogs = <
  TData = Awaited<ReturnType<typeof getCopyTradeLogs>>,
  TError = ErrorType<unknown>,
>(
  params?: { limit?: number; offset?: number },
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof getCopyTradeLogs>>, TError, TData> }
): UseQueryResult<TData, TError> => {
  return useQuery({
    queryKey: getGetCopyTradeLogsQueryKey(params),
    queryFn: () => getCopyTradeLogs(params),
    ...options?.query,
  } as UseQueryOptions<Awaited<ReturnType<typeof getCopyTradeLogs>>, TError, TData>);
};
