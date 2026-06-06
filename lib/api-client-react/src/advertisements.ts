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

export type AdStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "PAUSED";
export type AdMediaType = "IMAGE" | "VIDEO" | "LINK";

export interface Advertisement {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  mediaType: AdMediaType;
  mediaUrl: string | null;
  externalLink: string | null;
  status: AdStatus;
  totalDays: number;
  totalAmount: string;
  startDate: string | null;
  endDate: string | null;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdPaymentResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  paymentId: number;
  message: string;
}

export interface AdvertisementSettings {
  id: number;
  feePerDay: string;
  minDays: number;
  maxDays: number;
  broadcastIntervalSeconds: number;
  updatedAt: string;
}

export interface AdBroadcastConfig {
  broadcastIntervalSeconds: number;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const getActiveAdsQueryKey = () => ["/api/advertisements/active"] as const;
export const getAdSettingsQueryKey = () => ["/api/advertisements/settings"] as const;
export const getMyAdsQueryKey = () => ["/api/advertisements/mine"] as const;
export const getMyAdPaymentsQueryKey = () => ["/api/advertisements/payments/mine"] as const;
export const getAdBroadcastConfigQueryKey = () => ["/api/advertisements/config"] as const;

export interface AdPayment {
  id: number;
  advertisementId: number | null;
  amount: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  method: string;
  phoneNumber: string | null;
  mpesaReceiptNumber: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  adTitle: string;
  adMediaType: AdMediaType;
}
export const getAdminAdsQueryKey = () => ["/api/admin/advertisements"] as const;
export const getAdminAdSettingsQueryKey = () => ["/api/admin/advertisements/settings"] as const;

// ─── Broadcast Config (public — no auth) ─────────────────────────────────────

export const useGetAdBroadcastConfig = <
  TData = AdBroadcastConfig,
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<AdBroadcastConfig, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdBroadcastConfigQueryKey(),
    queryFn: () => customFetch<AdBroadcastConfig>("/api/advertisements/config", { method: "GET" }),
    staleTime: 60_000,
    ...options?.query,
  } as UseQueryOptions<AdBroadcastConfig, TError, TData>);

// ─── My Ad Payments ───────────────────────────────────────────────────────────

export const useGetMyAdPayments = <
  TData = AdPayment[],
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<AdPayment[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getMyAdPaymentsQueryKey(),
    queryFn: () => customFetch<AdPayment[]>("/api/advertisements/payments/mine", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<AdPayment[], TError, TData>);

// ─── Active Ads (public carousel) ────────────────────────────────────────────

export const useGetActiveAdvertisements = <
  TData = Advertisement[],
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<Advertisement[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getActiveAdsQueryKey(),
    queryFn: () => customFetch<Advertisement[]>("/api/advertisements/active", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Advertisement[], TError, TData>);

// ─── Ad Settings (user) ───────────────────────────────────────────────────────

export const useGetAdvertisementSettings = <
  TData = AdvertisementSettings,
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<AdvertisementSettings, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdSettingsQueryKey(),
    queryFn: () => customFetch<AdvertisementSettings>("/api/advertisements/settings", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<AdvertisementSettings, TError, TData>);

// ─── My Ads (user) ────────────────────────────────────────────────────────────

export const useGetMyAdvertisements = <
  TData = Advertisement[],
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<Advertisement[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getMyAdsQueryKey(),
    queryFn: () => customFetch<Advertisement[]>("/api/advertisements/mine", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Advertisement[], TError, TData>);

// ─── Initiate Ad Payment (M-Pesa STK Push) ───────────────────────────────────

export const useInitiateAdPayment = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<AdPaymentResponse, TError, { id: number; phoneNumber: string }, TContext>;
  }
): UseMutationResult<AdPaymentResponse, TError, { id: number; phoneNumber: string }, TContext> => {
  const mutationFn: MutationFunction<AdPaymentResponse, { id: number; phoneNumber: string }> = ({ id, phoneNumber }) =>
    customFetch<AdPaymentResponse>(`/api/advertisements/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Create Ad (user) ─────────────────────────────────────────────────────────

export const useCreateAdvertisement = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<Advertisement, TError, { data: FormData }, TContext>;
  }
): UseMutationResult<Advertisement, TError, { data: FormData }, TContext> => {
  const mutationFn: MutationFunction<Advertisement, { data: FormData }> = ({ data }) =>
    fetch("/api/advertisements", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      body: data,
    }).then(async (r) => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to create advertisement");
      }
      return r.json() as Promise<Advertisement>;
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Admin Ads ────────────────────────────────────────────────────────────────

export const useGetAdminAdvertisements = <
  TData = Advertisement[],
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<Advertisement[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminAdsQueryKey(),
    queryFn: () => customFetch<Advertisement[]>("/api/admin/advertisements", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Advertisement[], TError, TData>);

// ─── Admin Settings ───────────────────────────────────────────────────────────

export const useGetAdminAdvertisementSettings = <
  TData = AdvertisementSettings,
  TError = ErrorType<unknown>,
>(
  options?: { query?: UseQueryOptions<AdvertisementSettings, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminAdSettingsQueryKey(),
    queryFn: () => customFetch<AdvertisementSettings>("/api/admin/advertisements/settings", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<AdvertisementSettings, TError, TData>);

export const useUpdateAdvertisementSettings = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      AdvertisementSettings,
      TError,
      { data: { feePerDay: number; minDays: number; maxDays: number; broadcastIntervalSeconds?: number } },
      TContext
    >;
  }
): UseMutationResult<
  AdvertisementSettings,
  TError,
  { data: { feePerDay: number; minDays: number; maxDays: number; broadcastIntervalSeconds?: number } },
  TContext
> => {
  const mutationFn: MutationFunction<
    AdvertisementSettings,
    { data: { feePerDay: number; minDays: number; maxDays: number; broadcastIntervalSeconds?: number } }
  > = ({ data }) =>
    customFetch<AdvertisementSettings>("/api/admin/advertisements/settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Admin Actions ────────────────────────────────────────────────────────────

export const useApproveAdvertisement = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Advertisement, TError, { id: number }, TContext> }
): UseMutationResult<Advertisement, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<Advertisement, { id: number }> = ({ id }) =>
    customFetch<Advertisement>(`/api/admin/advertisements/${id}/approve`, { method: "PATCH" });
  return useMutation({ mutationFn, ...options?.mutation });
};

export const useRejectAdvertisement = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Advertisement, TError, { id: number }, TContext> }
): UseMutationResult<Advertisement, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<Advertisement, { id: number }> = ({ id }) =>
    customFetch<Advertisement>(`/api/admin/advertisements/${id}/reject`, { method: "PATCH" });
  return useMutation({ mutationFn, ...options?.mutation });
};

export const usePauseAdvertisement = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Advertisement, TError, { id: number }, TContext> }
): UseMutationResult<Advertisement, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<Advertisement, { id: number }> = ({ id }) =>
    customFetch<Advertisement>(`/api/admin/advertisements/${id}/pause`, { method: "PATCH" });
  return useMutation({ mutationFn, ...options?.mutation });
};

export const useDeleteAdvertisement = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<void, TError, { id: number }, TContext> }
): UseMutationResult<void, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<void, { id: number }> = ({ id }) =>
    customFetch<void>(`/api/admin/advertisements/${id}`, { method: "DELETE" });
  return useMutation({ mutationFn, ...options?.mutation });
};
