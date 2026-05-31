export function toFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : fallback;
  }

  if (typeof error === 'string') {
    const message = error.trim();
    return message.length > 0 ? message : fallback;
  }

  return fallback;
}
