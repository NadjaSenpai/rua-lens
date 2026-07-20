import { InvalidRequestError } from "./errors";

const SECONDS_PER_DAY = 24 * 60 * 60;

export type ReportScope = {
  domain?: string;
  from?: number;
  toExclusive?: number;
};

export function parseReportScope(query: Record<string, string>): ReportScope {
  const domain = query.domain?.trim().toLowerCase();
  if (query.domain !== undefined && !domain) {
    throw new InvalidRequestError();
  }

  const from = query.from === undefined ? undefined : utcDate(query.from);
  const to = query.to === undefined ? undefined : utcDate(query.to);
  const toExclusive = to === undefined ? undefined : to + SECONDS_PER_DAY;
  if (from !== undefined && toExclusive !== undefined && from >= toExclusive) {
    throw new InvalidRequestError();
  }

  return { domain, from, toExclusive };
}

function utcDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidRequestError();
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0 ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  ) {
    throw new InvalidRequestError();
  }
  return milliseconds / 1000;
}
