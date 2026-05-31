/**
 * Admin user management API client — hand-written hooks.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  mustChangePassword: boolean;
  suspended: boolean;
  createdAt: string;
}

export interface ResetPasswordResult {
  tempPassword: string;
  mustChangePassword: boolean;
}

export interface BulkActionInput {
  ids: number[];
  action: "suspend" | "unsuspend" | "force-password-change";
}

export interface BulkActionResult {
  success: number;
  failed: number;
}

// ─── List users (extended with suspended) ────────────────────────────────────

export const getAdminListUsersQueryKey = () => ["/api/users", "admin"] as const;

export const adminListUsers = async (options?: RequestInit): Promise<AdminUser[]> =>
  customFetch<AdminUser[]>("/api/users", { ...options, method: "GET" });

export const useAdminListUsers = <TData = AdminUser[], TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<AdminUser[], TError, TData> }
): UseQueryResult<TData, TError> =>
  useQuery({
    queryKey: getAdminListUsersQueryKey(),
    queryFn: () => adminListUsers(),
    ...options?.query,
  } as UseQueryOptions<AdminUser[], TError, TData>);

// ─── Reset password ───────────────────────────────────────────────────────────

export const useAdminResetPassword = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<ResetPasswordResult, TError, { id: number }, TContext>;
  }
): UseMutationResult<ResetPasswordResult, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<ResetPasswordResult, { id: number }> = ({ id }) =>
    customFetch<ResetPasswordResult>(`/api/admin/users/${id}/reset-password`, { method: "POST" });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Force password change ────────────────────────────────────────────────────

export const useAdminForcePasswordChange = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<AdminUser, TError, { id: number }, TContext>;
  }
): UseMutationResult<AdminUser, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<AdminUser, { id: number }> = ({ id }) =>
    customFetch<AdminUser>(`/api/admin/users/${id}/force-password-change`, { method: "POST" });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Suspend / Unsuspend ──────────────────────────────────────────────────────

export const useAdminSetSuspended = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<AdminUser, TError, { id: number; suspended: boolean }, TContext>;
  }
): UseMutationResult<AdminUser, TError, { id: number; suspended: boolean }, TContext> => {
  const mutationFn: MutationFunction<AdminUser, { id: number; suspended: boolean }> = ({ id, suspended }) =>
    customFetch<AdminUser>(`/api/admin/users/${id}/suspend`, {
      method: "PATCH",
      body: JSON.stringify({ suspended }),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Change role ──────────────────────────────────────────────────────────────

export const useAdminChangeRole = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<AdminUser, TError, { id: number; role: "ADMIN" | "USER" }, TContext>;
  }
): UseMutationResult<AdminUser, TError, { id: number; role: "ADMIN" | "USER" }, TContext> => {
  const mutationFn: MutationFunction<AdminUser, { id: number; role: "ADMIN" | "USER" }> = ({ id, role }) =>
    customFetch<AdminUser>(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Delete user ──────────────────────────────────────────────────────────────

export const useAdminDeleteUser = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<void, TError, { id: number }, TContext>;
  }
): UseMutationResult<void, TError, { id: number }, TContext> => {
  const mutationFn: MutationFunction<void, { id: number }> = ({ id }) =>
    customFetch<void>(`/api/admin/users/${id}`, { method: "DELETE" });
  return useMutation({ mutationFn, ...options?.mutation });
};

// ─── Bulk actions ─────────────────────────────────────────────────────────────

export const useAdminBulkAction = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<BulkActionResult, TError, BulkActionInput, TContext>;
  }
): UseMutationResult<BulkActionResult, TError, BulkActionInput, TContext> => {
  const mutationFn: MutationFunction<BulkActionResult, BulkActionInput> = (data) =>
    customFetch<BulkActionResult>("/api/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  return useMutation({ mutationFn, ...options?.mutation });
};
