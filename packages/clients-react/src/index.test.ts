import { describe, it, expect } from "vitest";
import * as clientsReact from "./index.js";

describe("clients-react exports", () => {
  it("exports context provider and hook", () => {
    expect(clientsReact.TwlContext).toBeDefined();
    expect(clientsReact.TwlProvider).toBeDefined();
  });

  it("exports client hooks", () => {
    expect(clientsReact.useRouteClient).toBeTypeOf("function");
    expect(clientsReact.useRegionClient).toBeTypeOf("function");
    expect(clientsReact.useConfigClient).toBeTypeOf("function");
    expect(clientsReact.useHealthClient).toBeTypeOf("function");
  });

  it("exports API hooks", () => {
    expect(clientsReact.useGenerateRoutes).toBeTypeOf("function");
    expect(clientsReact.useRegionCache).toBeTypeOf("function");
    expect(clientsReact.useScoringDefaults).toBeTypeOf("function");
    expect(clientsReact.useHealth).toBeTypeOf("function");
  });

  it("exports query utilities", () => {
    expect(clientsReact.useRemote).toBeTypeOf("function");
    expect(clientsReact.useDataMutation).toBeTypeOf("function");
    expect(clientsReact.invalidateQueriesContaining).toBeTypeOf("function");
  });
});
