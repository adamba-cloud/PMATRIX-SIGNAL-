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

export type Mt5SubStatus = "ACTIVE" | "EXPIRED" | "PENDING";

export interface Mt5BillingSettings {
  feePerAccountPerDay: number;
  minimumSubscriptionDays: number;
  maximumMt5Accounts: number;
}

export interface Mt5AccountSubscription {
  id: number;
  userId: number;
  slaveAccountId: number;
  numberOfDays: number;
  feePerAccountPerDay: number;
  amount: number;
  startDate: string | null;
  expiryDate: string | null;
  status: Mt5SubStatus;
  createdAt: string;
  daysRemaining: number;
  mt5Login: string;
  brokerServer: string;
}

export interface AdminMt5AccountSubscription extends Mt5AccountSubscription {
  userName: string;
  userEmail: string;
}

export interface Mt5BillingAnalytics {
  activeAccounts: number;
  expiredAccounts: number;
  totalRevenue: number;
  revenueByPeriod: { numberOfDays: number; count: number; revenue: number }[];
}

export interface Mt5PaymentResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  paymentId: number;
  message: string;
  totalAmount: number;
  numAccounts: number;
  numberOfDays: number;
}

export interface Mt5ActiveSubCheck {
  hasActive: boolean;
  subscription: Mt5AccountSubscription | null;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const getMt5BillingSettingsQueryKey = () => ["/api/mt5/billing/settings"] as const;
export const getMyMt5SubscriptionsQueryKey = () => ["/api/mt5/billing/subscriptions/mine"] as const;
export const getMt5ActiveSubQueryKey = (slaveAccountId: number) =>
  [`/api/mt5/billing/subscriptions/${slaveAccountId}/active`] as const;
export const getAdminMt5BillingSettingsQueryKey = () => ["/api/admin/mt5/billing/settings"] as const;
export const getAdminMt5SubscriptionsQueryKey = () => ["/api/admin/mt5/billing/subscriptions"] as const;
export const getAdminMt5BillingAnalyticsQueryKey = () => ["/api/admin/mt5/billing/analytics"] as const;

// ─── User Hooks ───────────────────────────────────────────────────────────────

export const useGetMt5BillingSettings = <TData = Mt5BillingSettings, TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<Mt5BillingSettings, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getMt5BillingSettingsQueryKey(),
    queryFn: () => customFetch<Mt5BillingSettings>("/api/mt5/billing/settings", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Mt5BillingSettings, TError, TData>);

export const useGetMyMt5Subscriptions = <TData = Mt5AccountSubscription[], TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<Mt5AccountSubscription[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getMyMt5SubscriptionsQueryKey(),
    queryFn: () => customFetch<Mt5AccountSubscription[]>("/api/mt5/billing/subscriptions/mine", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Mt5AccountSubscription[], TError, TData>);

export const useGetMt5ActiveSub = <TData = Mt5ActiveSubCheck, TError = ErrorType<unknown>>(
  slaveAccountId: number,
  options?: { query?: UseQueryOptions<Mt5ActiveSubCheck, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getMt5ActiveSubQueryKey(slaveAccountId),
    queryFn: () =>
      customFetch<Mt5ActiveSubCheck>(`/api/mt5/billing/subscriptions/${slaveAccountId}/active`, { method: "GET" }),
    enabled: slaveAccountId > 0,
    ...options?.query,
  } as UseQueryOptions<Mt5ActiveSubCheck, TError, TData>);

export const useInitiateMt5Payment = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Mt5PaymentResponse,
      TError,
      { phoneNumber: string; slaveAccountIds: number[]; numberOfDays: number },
      TContext
    >;
  }
): UseMutationResult<
  Mt5PaymentResponse,
  TError,
  { phoneNumber: string; slaveAccountIds: number[]; numberOfDays: number },
  TContext
> => {
  const mutationFn: MutationFunction<
    Mt5PaymentResponse,
    { phoneNumber: string; slaveAccountIds: number[]; numberOfDays: number }
  > = (data) =>
    customFetch<Mt5PaymentResponse>("/api/mt5/billing/pay", {
      method: "POST",
      body: JSON.stringify(data),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Admin Hooks ──────────────────────────────────────────────────────────────

export const useGetAdminMt5BillingSettings = <TData = Mt5BillingSettings, TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<Mt5BillingSettings, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminMt5BillingSettingsQueryKey(),
    queryFn: () => customFetch<Mt5BillingSettings>("/api/admin/mt5/billing/settings", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Mt5BillingSettings, TError, TData>);

export const useGetAdminMt5Subscriptions = <TData = AdminMt5AccountSubscription[], TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<AdminMt5AccountSubscription[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminMt5SubscriptionsQueryKey(),
    queryFn: () =>
      customFetch<AdminMt5AccountSubscription[]>("/api/admin/mt5/billing/subscriptions", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<AdminMt5AccountSubscription[], TError, TData>);

export const useGetAdminMt5BillingAnalytics = <TData = Mt5BillingAnalytics, TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<Mt5BillingAnalytics, TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminMt5BillingAnalyticsQueryKey(),
    queryFn: () =>
      customFetch<Mt5BillingAnalytics>("/api/admin/mt5/billing/analytics", { method: "GET" }),
    ...options?.query,
  } as UseQueryOptions<Mt5BillingAnalytics, TError, TData>);

export const useUpdateMt5BillingSettings = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Mt5BillingSettings,
      TError,
      { feePerAccountPerDay?: number; minimumSubscriptionDays?: number; maximumMt5Accounts?: number },
      TContext
    >;
  }
): UseMutationResult<
  Mt5BillingSettings,
  TError,
  { feePerAccountPerDay?: number; minimumSubscriptionDays?: number; maximumMt5Accounts?: number },
  TContext
> => {
  const mutationFn: MutationFunction<
    Mt5BillingSettings,
    { feePerAccountPerDay?: number; minimumSubscriptionDays?: number; maximumMt5Accounts?: number }
  > = (data) =>
    customFetch<Mt5BillingSettings>("/api/admin/mt5/billing/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

export const useAdminGrantMt5Subscription = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Mt5AccountSubscription,
      TError,
      { slaveAccountId: number; numberOfDays: number },
      TContext
    >;
  }
): UseMutationResult<Mt5AccountSubscription, TError, { slaveAccountId: number; numberOfDays: number }, TContext> => {
  const mutationFn: MutationFunction<
    Mt5AccountSubscription,
    { slaveAccountId: number; numberOfDays: number }
  > = (data) =>
    customFetch<Mt5AccountSubscription>("/api/admin/mt5/billing/grant", {
      method: "POST",
      body: JSON.stringify(data),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};
