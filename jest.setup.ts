import "@testing-library/jest-dom";

// In jsdom environment, localStorage is already available via window.
// We just need to clear it between tests and ensure window is defined.

// Reset browser storage between tests. The app intentionally stores PHI in
// sessionStorage, so tests must clear it too or patient/order data leaks across
// cases and masks real regressions.
beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.clear();
  }
});
