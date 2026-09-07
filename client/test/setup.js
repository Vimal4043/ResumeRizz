import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount rendered components after each test.
afterEach(() => {
  cleanup();
});

// happy-dom doesn't ship matchMedia by default; provide a minimal,
// controllable implementation so any code using it in tests works.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
