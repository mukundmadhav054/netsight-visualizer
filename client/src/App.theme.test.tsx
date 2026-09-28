import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  // jsdom lacks these browser APIs used by React Flow / the overlay canvas.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof realGetContext;
});

afterAll(() => {
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

afterEach(cleanup);

describe("theme toggle", () => {
  it("toggles the dark class on <html> and flips the button label", () => {
    document.documentElement.classList.add("dark");
    render(<App />);
    const btn = screen.getByRole("button", { name: "Toggle color theme" });
    expect(btn.textContent).toBe("Light mode");
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(btn.textContent).toBe("Dark mode");
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
