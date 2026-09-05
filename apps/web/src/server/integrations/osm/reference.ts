export type OsmReferenceType = "NODE" | "WAY" | "RELATION";

export interface OsmReference {
  readonly id: number;
  readonly type: OsmReferenceType;
}

const KEY_BY_TYPE = {
  node: "osm_node",
  way: "osm_way",
  relation: "osm_relation",
} as const;

export function osmExternalIds(
  type: "node" | "way" | "relation",
  id: number,
): Record<string, string> {
  return { [KEY_BY_TYPE[type]]: String(id) };
}

export function osmReferenceFromExternalIds(
  externalIds: Readonly<Record<string, string>> | null | undefined,
): OsmReference | null {
  if (!externalIds) return null;
  for (const [key, type] of [
    ["osm_node", "NODE"],
    ["osm_way", "WAY"],
    ["osm_relation", "RELATION"],
  ] as const) {
    const id = Number(externalIds[key]);
    if (Number.isSafeInteger(id) && id > 0) return { id, type };
  }
  return null;
}

export function osmReferenceKey(
  externalIds: Readonly<Record<string, string>> | null | undefined,
): string | null {
  const reference = osmReferenceFromExternalIds(externalIds);
  return reference ? `${reference.type}:${String(reference.id)}` : null;
}
