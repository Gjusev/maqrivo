import { describe, expect, it } from "vitest";
import {
  osmExternalIds,
  osmReferenceFromExternalIds,
  osmReferenceKey,
} from "../src/server/integrations/osm/reference";

describe("typed OSM references", () => {
  it("does not mislabel ways and relations as nodes", () => {
    expect(osmExternalIds("node", 10)).toEqual({ osm_node: "10" });
    expect(osmExternalIds("way", 20)).toEqual({ osm_way: "20" });
    expect(osmExternalIds("relation", 30)).toEqual({ osm_relation: "30" });
  });

  it("maps stored references to Open Prices OSM types", () => {
    expect(osmReferenceFromExternalIds({ osm_way: "20" })).toEqual({ id: 20, type: "WAY" });
    expect(osmReferenceKey({ osm_relation: "30" })).toBe("RELATION:30");
    expect(osmReferenceFromExternalIds({ osm_node: "not-a-number" })).toBeNull();
  });
});
