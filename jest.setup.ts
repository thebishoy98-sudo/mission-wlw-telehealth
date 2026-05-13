import "@testing-library/jest-dom";

// In jsdom environment, localStorage is already available via window.
// We just need to clear it between tests and ensure window is defined.

// Reset localStorage between tests
beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});
