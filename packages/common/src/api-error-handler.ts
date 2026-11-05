/**
 * Utility for handling API errors consistently across services
 */
export interface ApiErrorResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

/** Longest text error body passed back to the model; HTML error pages can run to many kilobytes. */
export const MAX_TEXT_ERROR_DETAILS = 500;

export function summarizeErrorDetails(body: unknown): unknown {
  if (typeof body !== 'string' || body.length <= MAX_TEXT_ERROR_DETAILS) {
    return body;
  }
  return `${body.slice(0, MAX_TEXT_ERROR_DETAILS)}… (truncated, ${body.length} characters)`;
}

/**
 * Handle API errors in a consistent way across services
 * @param operation Function that performs the API operation
 * @param errorPrefix Prefix for the error message
 * @returns Standardized response with success status, data, and error details
 */
export async function handleApiOperation<T>(
  operation: () => Promise<T>,
  errorPrefix: string
): Promise<ApiErrorResponse<T>> {
  try {
    const data = await operation();
    return {
      success: true,
      data
    };
  } catch (e) {
    let errorMessage = e instanceof Error ? e.message : String(e);
    let errorDetails = undefined;

    if (e && typeof e === 'object' && 'status' in e && 'body' in e) {
      const apiError = e as {status: number; body: any; statusText: string};
      errorMessage = `${errorPrefix}: ${apiError.status} ${apiError.statusText}`;
      errorDetails = summarizeErrorDetails(apiError.body);
    }

    return {
      success: false,
      error: errorMessage,
      details: errorDetails
    };
  }
}
