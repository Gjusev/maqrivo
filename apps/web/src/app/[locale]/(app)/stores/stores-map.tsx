"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCustomStoreAction, setStorePrefsAction } from "@/server/stores/actions";
import { Dialog } from "@/components/dialog";
import { MapPinLineIcon } from "@phosphor-icons/react/dist/csr/MapPinLine";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";

/** Minimal GeoJSON shapes (the @types/geojson package is not a dependency). */
interface PointFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown> | null;
}
interface StoresCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapStore {
  id: string;
  name: string;
  retailer: string | null;
  format: string | null;
  lat: number;
  lng: number;
  enabled: boolean;
  favorite: boolean;
  avoided: boolean;
  custom: boolean;
  distanceLabel: string | null;
}

/** kind drives circle colors on the map (match expression). */
type StoreKind = "enabled" | "favorite" | "avoided" | "custom" | "nearby";

function kindOf(s: MapStore): StoreKind {
  if (s.avoided) return "avoided";
  if (s.enabled) return "enabled";
  if (s.favorite) return "favorite";
  if (s.custom) return "custom";
  return "nearby";
}

const KIND_COLORS: Record<StoreKind, string> = {
  enabled: "#059669",
  favorite: "#d97706",
  avoided: "#dc2626",
  custom: "#d97706",
  nearby: "#a1a1aa",
};

/** Same format options as /stores/new; labels live under Stores.formats.*. */
const FORMAT_OPTIONS = ["supermarket", "butcher", "bakery", "vegetables", "market", "specialty"] as const;

/** Coordinates are persisted at 6-decimal precision (~11 cm). */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function toCollection(list: MapStore[]): StoresCollection {
  return {
    type: "FeatureCollection",
    features: list.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: { id: s.id, kind: kindOf(s) },
    })),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * MapLibre + OpenFreeMap vector tiles (no key, no view limits). Dense areas
 * surface 180+ stores: points render as a clustered GeoJSON source, and each
 * unclustered point opens a popup with the real follow/unfollow action —
 * the map is a first-class citizen of the store list, not a decoration.
 * The home marker is placed at the user's own coordinates — only their own
 * browser ever sees it; external services see grid-snapped points only.
 */
export function StoresMap({
  home,
  stores,
}: {
  home: { lat: number; lng: number } | null;
  stores: MapStore[];
}) {
  const t = useTranslations("Stores");
  const tc = useTranslations("Common");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMap, setShowMap] = useState(false);

  // "Add a store here" sheet — opened by long-press or right-click on the map.
  const [sheet, setSheet] = useState<{ lat: number; lng: number } | null>(null);
  const [sheetPending, setSheetPending] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const sheetOpenRef = useRef(false);

  // Fresh values for popup handlers without remounting the map.
  const storesRef = useRef(stores);
  const routerRef = useRef(router);
  const mapRef = useRef<MaplibreMap | null>(null);
  const byIdRef = useRef(new Map<string, MapStore>());
  useEffect(() => {
    storesRef.current = stores;
    routerRef.current = router;
    byIdRef.current = new Map(stores.map((s) => [s.id, s]));
    // Fresh server data (e.g. a just-created store) reaches the live map
    // source without remounting the whole map.
    const source = mapRef.current?.getSource("stores") as GeoJSONSource | undefined;
    source?.setData(toCollection(stores));
  }, [stores, router]);

  function closeSheet() {
    sheetOpenRef.current = false;
    setSheet(null);
    setSheetError(null);
  }

  // Same action contract as /stores/new: name + format, coords from the press.
  async function submitSheet(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sheet || sheetPending) return;
    const form = new FormData(event.currentTarget);
    const lat = round6(sheet.lat);
    const lng = round6(sheet.lng);
    setSheetPending(true);
    setSheetError(null);
    const result = await createCustomStoreAction({
      name: String(form.get("name") ?? ""),
      format: String(form.get("format") ?? "supermarket"),
      lat,
      lng,
    });
    if (result.ok) {
      closeSheet();
      setSheetPending(false);
      router.refresh();
      const map = mapRef.current;
      if (map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 500 });
    } else {
      setSheetPending(false);
      setSheetError(tc("error"));
    }
  }

  useEffect(() => {
    if (!showMap || !containerRef.current) return;
    const container = containerRef.current;
    let map: MaplibreMap | null = null;
    let cancelled = false;
    // Long-press state shared with the cleanup below (map handlers are wired
    // once the async import resolves).
    let pressTimer: number | undefined;
    let pressStart: { x: number; y: number } | null = null;
    const cancelPress = () => {
      if (pressTimer !== undefined) window.clearTimeout(pressTimer);
      pressTimer = undefined;
      pressStart = null;
    };

    void (async () => {
      // Dynamic by design: maplibre-gl (~800 kB) loads only when the user
      // opens the map; the stores page itself must stay light.
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: home ? [home.lng, home.lat] : [2.2454, 48.8967],
        zoom: 13,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      // Long-press (touch, 600 ms) or right-click opens the "add store here"
      // sheet at that point; movement beyond ~8 px cancels a pending press.
      const openSheet = (lat: number, lng: number) => {
        if (sheetOpenRef.current) return;
        sheetOpenRef.current = true;
        setSheet({ lat, lng });
      };
      map.on("touchstart", (e) => {
        const start = e.points.length === 1 ? e.points[0] : undefined;
        if (!map || !start) {
          cancelPress();
          return;
        }
        pressStart = { x: start.x, y: start.y };
        pressTimer = window.setTimeout(() => {
          pressTimer = undefined;
          if (!map || !pressStart) return;
          const point = map.unproject([pressStart.x, pressStart.y]);
          openSheet(point.lat, point.lng);
        }, 600);
      });
      map.on("touchmove", (e) => {
        if (!pressStart) return;
        const p = e.points[0];
        if (p && Math.hypot(p.x - pressStart.x, p.y - pressStart.y) > 8) cancelPress();
      });
      map.on("touchend", cancelPress);
      map.on("touchcancel", cancelPress);
      map.on("contextmenu", (e) => {
        cancelPress();
        if (!map) return;
        openSheet(e.lngLat.lat, e.lngLat.lng);
      });

      map.on("load", () => {
        if (cancelled || !map) return;
        map.addSource("stores", {
          type: "geojson",
          data: toCollection(storesRef.current),
          cluster: true,
          clusterRadius: 55,
          clusterMaxZoom: 14,
        });
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "stores",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0f766e",
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 25, 28],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "stores",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 13,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "store-points",
          type: "circle",
          source: "stores",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "kind"],
              "enabled", KIND_COLORS.enabled,
              "favorite", KIND_COLORS.favorite,
              "avoided", KIND_COLORS.avoided,
              "custom", KIND_COLORS.custom,
              KIND_COLORS.nearby,
            ],
            "circle-radius": 7,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
          },
        });
        // Pointer cursor over anything actionable.
        for (const layer of ["clusters", "store-points"]) {
          map.on("mouseenter", layer, () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            if (map) map.getCanvas().style.cursor = "";
          });
        }
        // Zoom into clusters on click.
        map.on("click", "clusters", (e) => {
          if (!map) return;
          const feature = e.features?.[0];
          if (!feature) return;
          const clusterId = feature?.properties?.cluster_id as number | undefined;
          const src = map.getSource("stores") as GeoJSONSource | undefined;
          if (!feature || clusterId === undefined || !src) return;
          void src.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (map && feature.geometry.type === "Point") {
              const [lng, lat] = feature.geometry.coordinates;
              map.easeTo({ center: [lng, lat], zoom: Math.min(zoom + 0.3, 16) });
            }
          });
        });
        map.on("click", "store-points", (e) => {
          if (!map) return;
          const feature = e.features?.[0];
          const id = feature?.properties?.id as string | undefined;
          if (!id || !feature) return;
          const s = byIdRef.current.get(id);
          if (!s || feature.geometry.type !== "Point") return;
          const [lng, lat] = feature.geometry.coordinates;
          const meta = [s.retailer, s.format, s.distanceLabel].filter(Boolean).join(" · ");
          const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px", offset: 12 })
            .setLngLat([lng, lat])
            .setHTML(
              `<div class="p-1" data-store-popup="${escapeHtml(s.id)}">` +
                `<p class="text-sm font-semibold text-zinc-900">${escapeHtml(s.name)}</p>` +
                (meta ? `<p class="mt-0.5 text-xs text-zinc-500">${escapeHtml(meta)}</p>` : "") +
                `<div class="mt-2 flex gap-1.5">` +
                  `<button type="button" data-action="toggle" class="min-h-9 rounded-lg px-3 text-xs font-medium ${s.enabled ? "bg-zinc-100 text-zinc-700" : "bg-brand-600 text-white"}">${escapeHtml(s.enabled ? t("disable") : t("enable"))}</button>` +
                  `<button type="button" data-action="favorite" class="min-h-9 rounded-lg px-3 text-xs ${s.favorite ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"}">★</button>` +
                `</div></div>`,
            )
            .addTo(map);
          popup.on("open", () => {
            const el = popup.getElement()?.querySelector<HTMLElement>(`[data-store-popup="${CSS.escape(s.id)}"]`);
            el?.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const action = btn.dataset.action;
                const next =
                  action === "toggle"
                    ? { enabled: !s.enabled, avoided: false }
                    : { favorite: !s.favorite };
                btn.disabled = true;
                await setStorePrefsAction(s.id, next);
                popup.remove();
                routerRef.current.refresh();
              });
            });
          });
        });
      });

      // Home: DOM marker with a pulse so it stays distinguishable from stores.
      if (home) {
        const el = document.createElement("div");
        el.className = "relative";
        el.innerHTML =
          '<div class="size-4 rounded-full border-2 border-white bg-zinc-900 shadow"></div>' +
          '<div class="absolute inset-0 -m-1.5 animate-ping rounded-full border border-zinc-900/40"></div>';
        new maplibregl.Marker({ element: el }).setLngLat([home.lng, home.lat]).addTo(map);
      }

      // Fit to the visible stores once.
      if (storesRef.current.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const s of storesRef.current) bounds.extend([s.lng, s.lat]);
        if (home) bounds.extend([home.lng, home.lat]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
      cancelPress();
      mapRef.current = null;
      map?.remove();
      map = null;
    };
  }, [showMap, home, t]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          {(["enabled", "favorite", "avoided", "nearby"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[k] }} aria-hidden />
              {t(k)}
            </span>
          ))}
        </div>
        <button type="button" className="btn-secondary px-3 text-xs" onClick={() => setShowMap((v) => !v)}>
          <MapPinLineIcon size={14} aria-hidden />
          {showMap ? t("list") : t("map")}
        </button>
      </div>
      {showMap ? (
        <div className="relative">
          <div ref={containerRef} className="h-80 overflow-hidden rounded-xl border border-zinc-200 md:h-96" />
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
            {t("mapLongPressHint")}
          </p>
        </div>
      ) : null}

      <Dialog
        open={sheet !== null}
        onClose={closeSheet}
        closeLabel={tc("close")}
        labelledBy="map-store-sheet-title"
      >
        <form onSubmit={submitSheet} className="mt-4 space-y-3">
          <h2 id="map-store-sheet-title" className="text-lg font-bold text-zinc-900">
            {t("addCustom")}
          </h2>
          <div>
            <label htmlFor="map-store-name">{t("name")}</label>
            <input id="map-store-name" name="name" required minLength={2} maxLength={120} />
          </div>
          <div>
            <label htmlFor="map-store-format">{t("format")}</label>
            <select id="map-store-format" name="format" defaultValue="supermarket">
              {FORMAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`formats.${option}`)}
                </option>
              ))}
            </select>
          </div>
          {sheet ? (
            <p className="text-xs text-zinc-500">
              {sheet.lat.toFixed(4)}, {sheet.lng.toFixed(4)}
            </p>
          ) : null}
          {sheetError ? <p className="field-error">{sheetError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeSheet}>
              {tc("cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={sheetPending}>
              {t("createStore")}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
