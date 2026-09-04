"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPinLineIcon } from "@phosphor-icons/react/dist/csr/MapPinLine";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  enabled: boolean;
  custom: boolean;
}

/**
 * MapLibre + OpenFreeMap vector tiles (no key, no view limits). The home
 * marker is placed at the user's own coordinates — only their own browser
 * ever sees it; external services see grid-snapped points only.
 */
export function StoresMap({
  home,
  stores,
}: {
  home: { lat: number; lng: number } | null;
  stores: MapStore[];
}) {
  const t = useTranslations("Stores");
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (!showMap || !containerRef.current) return;
    const container = containerRef.current;
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;

    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: home ? [home.lng, home.lat] : [2.2454, 48.8967],
        zoom: 13,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      // Markers are DOM overlays: they do not depend on style loading.
      if (home) {
        new maplibregl.Marker({ color: "#18181b" }).setLngLat([home.lng, home.lat]).addTo(map);
      }
      for (const s of stores) {
        const el = document.createElement("button");
        el.type = "button";
        el.title = s.name;
        el.className = "size-3.5 rounded-full border-2 border-white shadow";
        el.style.backgroundColor = s.enabled ? "#059669" : s.custom ? "#d97706" : "#a1a1aa";
        el.addEventListener("click", () => window.alert(s.name));
        new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [showMap, home, stores]);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" className="btn-secondary px-3 text-xs" onClick={() => setShowMap((v) => !v)}>
          <MapPinLineIcon size={14} aria-hidden />
          {showMap ? t("list") : t("map")}
        </button>
      </div>
      {showMap ? (
        <div ref={containerRef} className="h-80 overflow-hidden rounded-xl border border-zinc-200 md:h-96" />
      ) : null}
    </div>
  );
}
