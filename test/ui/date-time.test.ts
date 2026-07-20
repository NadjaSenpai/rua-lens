import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_TIME_ZONE,
  DISPLAY_TIME_ZONE_STORAGE_KEY,
  formatDisplayDate,
  formatDisplayDateTime,
  persistDisplayTimeZone,
  readDisplayTimeZone,
} from "../../src/client/date-time";

describe("display time zone", () => {
  it("defaults to UTC and rejects unknown stored values", () => {
    expect(readDisplayTimeZone()).toBe(DEFAULT_DISPLAY_TIME_ZONE);

    localStorage.setItem(DISPLAY_TIME_ZONE_STORAGE_KEY, "Europe/London");
    expect(readDisplayTimeZone()).toBe("UTC");
  });

  it("persists the Tokyo display preference", () => {
    persistDisplayTimeZone("Asia/Tokyo");

    expect(localStorage.getItem(DISPLAY_TIME_ZONE_STORAGE_KEY)).toBe("Asia/Tokyo");
    expect(readDisplayTimeZone()).toBe("Asia/Tokyo");
  });

  it("formats boundary-crossing timestamps in the selected display zone", () => {
    const value = "2023-11-14T18:30:00.000Z";

    expect(formatDisplayDate(value, "UTC")).toContain("2023/11/14");
    expect(formatDisplayDate(value, "Asia/Tokyo")).toContain("2023/11/15");
    expect(formatDisplayDateTime(value, "Asia/Tokyo")).toContain("3:30");
  });
});
