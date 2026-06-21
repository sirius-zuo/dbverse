// Tauri rejects with a serialized AppError object, not a JS Error instance.
export function extractApiError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === "string" ? e.message : fallback;
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${message}: ${details}` : message;
  }
  return fallback;
}
