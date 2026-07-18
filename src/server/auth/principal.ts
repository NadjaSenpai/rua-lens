export type Principal = {
  email: string;
  isAdmin: boolean;
};

export type VerifiedAccessIdentity = {
  email: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseEmailList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(",").map(normalizeEmail).filter(Boolean))];
}

export function createPrincipal(email: string, adminEmails: readonly string[]): Principal {
  const normalizedEmail = normalizeEmail(email);

  return {
    email: normalizedEmail,
    isAdmin: adminEmails.includes(normalizedEmail),
  };
}
