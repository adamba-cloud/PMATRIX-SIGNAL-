/**
 * Payment verification hook — hand-written to match generated patterns.
 * Triggers an immediate Daraja STK query on the server (60-second fallback).
 */
import { useMutation } from "@tanstack/react-query";
import type { MutationFunction, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export interface VerifyPaymentResult {
  status: "COMPLETED" | "FAILED" | "PENDING";
  paymentId: number;
  verified?: boolean;
  alreadyCompleted?: boolean;
  subscriptionActivated?: boolean;
  failureReason?: string | null;
  resultCode?: number;
  reason?: string;
}

const verifyPayment: MutationFunction<VerifyPaymentResult, string> = (checkoutRequestId) =>
  customFetch<VerifyPaymentResult>(`/api/payments/mpesa/verify/${encodeURIComponent(checkoutRequestId)}`, {
    method: "POST",
  });

export function useVerifyPayment(
  options?: UseMutationOptions<VerifyPaymentResult, ErrorType, string>,
): UseMutationResult<VerifyPaymentResult, ErrorType, string> {
  return useMutation<VerifyPaymentResult, ErrorType, string>({
    mutationFn: verifyPayment,
    ...options,
  });
}
