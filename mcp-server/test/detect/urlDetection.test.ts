import { describe, it, expect } from "vitest";
import { parseStartupUrl } from "../../src/detect/urlDetection.js";

describe("parseStartupUrl", () => {
  it("extracts a Vite-style local URL", () => {
    expect(parseStartupUrl("  ➜  Local:   http://localhost:5173/\n")).toBe("http://localhost:5173/");
  });

  it("extracts a Flask-style URL", () => {
    expect(parseStartupUrl("Running on http://127.0.0.1:5000")).toBe("http://127.0.0.1:5000");
  });

  it("normalizes 0.0.0.0 to localhost", () => {
    expect(parseStartupUrl("Listening on http://0.0.0.0:8000")).toBe("http://localhost:8000");
  });

  it("returns null when no URL is present", () => {
    expect(parseStartupUrl("Compiling...\nDone.")).toBeNull();
  });
});
