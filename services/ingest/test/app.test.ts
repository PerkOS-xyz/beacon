import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok when the database answers", async () => {
    const app = createApp({ db: { query: async () => ({ rows: [{ "?column?": 1 }] }) } });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 when the database is down", async () => {
    const app = createApp({
      db: {
        query: async () => {
          throw new Error("connection refused");
        },
      },
    });
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable", reason: "database" });
  });
});
