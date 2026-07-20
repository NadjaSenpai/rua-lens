import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
let systemDark = false;
const mediaQueries = new Map<string, TestMediaQueryList>();

if (typeof globalThis.localStorage?.getItem !== "function") {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    } satisfies Storage,
  });
}

Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => {
    let mediaQuery = mediaQueries.get(query);
    if (!mediaQuery) {
      mediaQuery = new TestMediaQueryList(query);
      mediaQueries.set(query, mediaQuery);
    }
    return mediaQuery.value;
  },
});

export function setSystemColorScheme(theme: "light" | "dark"): void {
  systemDark = theme === "dark";
  for (const mediaQuery of mediaQueries.values()) {
    mediaQuery.notify();
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  systemDark = false;
  mediaQueries.clear();
  delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.remove();
});

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute("open", "");
};

HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute("open");
};

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver;

class TestMediaQueryList {
  readonly value: MediaQueryList;
  private matches: boolean;
  private readonly listeners = new Set<EventListenerOrEventListenerObject>();
  private readonly legacyListeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(private readonly query: string) {
    this.matches = this.currentMatches();
    const getMatches = () => this.matches;
    const value = {
      get matches() { return getMatches(); },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        this.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        this.listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        this.legacyListeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        this.legacyListeners.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        this.dispatch(event as MediaQueryListEvent);
        return true;
      },
    } as MediaQueryList;
    this.value = value;
  }

  notify(): void {
    const matches = this.currentMatches();
    if (matches === this.matches) {
      return;
    }
    this.matches = matches;
    const event = new Event("change") as MediaQueryListEvent;
    Object.defineProperties(event, {
      matches: { value: matches },
      media: { value: this.query },
    });
    this.dispatch(event);
  }

  private currentMatches(): boolean {
    return this.query === DARK_COLOR_SCHEME_QUERY && systemDark;
  }

  private dispatch(event: MediaQueryListEvent): void {
    for (const listener of this.listeners) {
      if (typeof listener === "function") {
        listener.call(this.value, event);
      } else {
        listener.handleEvent(event);
      }
    }
    for (const listener of this.legacyListeners) {
      listener.call(this.value, event);
    }
    this.value.onchange?.call(this.value, event);
  }
}
