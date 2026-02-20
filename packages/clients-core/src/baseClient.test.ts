import { describe, it, expect } from "vitest";
import { BaseClient } from "./baseClient.js";

// Expose protected methods for testing via a thin subclass
class TestClient extends BaseClient {
  constructor(resource: string, config: { baseUrl: string; timeout?: number; token?: string }) {
    super(resource, config);
  }
  public exposedBuildPath(params: { path?: string }) {
    return this.buildPath(params);
  }
  public exposedBuildConfig(params: { path?: string; query?: Record<string, unknown> }) {
    return this.buildConfig(params);
  }
}

describe("BaseClient", () => {
  describe("buildPath", () => {
    it("returns resource root when no sub-path", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      expect(client.exposedBuildPath({})).toBe("/routes");
    });

    it("appends sub-path to resource", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      expect(client.exposedBuildPath({ path: "generate" })).toBe("/routes/generate");
    });
  });

  describe("buildConfig", () => {
    it("sets baseURL and default timeout", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      const config = client.exposedBuildConfig({});
      expect(config.baseURL).toBe("http://localhost:3000");
      expect(config.timeout).toBe(30000);
    });

    it("uses custom timeout when provided", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000", timeout: 5000 });
      const config = client.exposedBuildConfig({});
      expect(config.timeout).toBe(5000);
    });

    it("sets JSON content headers", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      const config = client.exposedBuildConfig({});
      expect(config.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
    });

    it("includes Authorization header when token is set", () => {
      const client = new TestClient("routes", {
        baseUrl: "http://localhost:3000",
        token: "my-token",
      });
      const config = client.exposedBuildConfig({});
      expect(config.headers).toMatchObject({
        Authorization: "Bearer my-token",
      });
    });

    it("omits Authorization header when no token", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      const config = client.exposedBuildConfig({});
      expect(config.headers).not.toHaveProperty("Authorization");
    });

    it("passes query params through", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      const config = client.exposedBuildConfig({ query: { activityType: "running" } });
      expect(config.params).toEqual({ activityType: "running" });
    });
  });

  describe("setToken", () => {
    it("updates the token used in subsequent requests", () => {
      const client = new TestClient("routes", { baseUrl: "http://localhost:3000" });
      // Initially no token
      let config = client.exposedBuildConfig({});
      expect(config.headers).not.toHaveProperty("Authorization");

      // Set token
      client.setToken("new-token");
      config = client.exposedBuildConfig({});
      expect(config.headers).toMatchObject({ Authorization: "Bearer new-token" });
    });

    it("clears the token when set to undefined", () => {
      const client = new TestClient("routes", {
        baseUrl: "http://localhost:3000",
        token: "initial",
      });
      client.setToken(undefined);
      const config = client.exposedBuildConfig({});
      expect(config.headers).not.toHaveProperty("Authorization");
    });
  });
});
