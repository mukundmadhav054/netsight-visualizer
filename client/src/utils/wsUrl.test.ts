import { describe, expect, it } from "vitest";
import { resolveWsUrl } from "./wsUrl";

describe("resolveWsUrl", () => {
  it("defaults to local dev", () => {
    expect(resolveWsUrl(undefined)).toBe("ws://localhost:4001");
  });
  it("passes explicit schemes through", () => {
    expect(resolveWsUrl("ws://localhost:4001")).toBe("ws://localhost:4001");
    expect(resolveWsUrl("wss://foo.onrender.com")).toBe("wss://foo.onrender.com");
  });
  it("upgrades bare remote hosts to wss (Render fromService host)", () => {
    expect(resolveWsUrl("netsight-server-abc.onrender.com")).toBe(
      "wss://netsight-server-abc.onrender.com"
    );
  });
  it("keeps bare loopback on ws", () => {
    expect(resolveWsUrl("localhost:4001")).toBe("ws://localhost:4001");
  });
});
