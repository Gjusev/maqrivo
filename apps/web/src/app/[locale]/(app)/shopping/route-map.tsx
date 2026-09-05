"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MapTrifoldIcon } from "@phosphor-icons/react/dist/csr/MapTrifold";
import type { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface RouteStop {
  sequenceIndex: number;
  name: string;
  lat: number;
  lng: number;
  itemCount: number;
  totalCents: number | null;
}

/**
 * The recommended shopping itinerary on a map: numbered stops in solver
 * order, dashed legs home → 1 → 2 …, popup per stop with what to buy there.
 * Reading "Itinéraire conseillé: 1. Aldi → 2. Lidl" as text and holding it
 * in your head is exactly what a map should be doing for you.
 */
export function RouteMap({
  home,
  stops,
}: {
  home: { lat: number; lng: number } | null;
  stops: RouteStop[];
}) {
  const t = useTranslations("Shopping");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!show || !containerRef.current || stops.length === 0) return;
    const container = containerRef.current;
    let map: MaplibreMap | null = null;
    let cancelled = false;

    void (async () => {
      // Dynamic by design: maplibre-gl (~800 kB) loads on demand only.
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      const startPoint = home ?? { lat: stops[0]!.lat, lng: stops[0]!.lng };
      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [startPoint.lng, startPoint.lat],
        zoom: 13,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        if (cancelled || !map) return;
        // Dashed itinerary: home → stop 1 → stop 2 → …
        const coordinates: [number, number][] = [[startPoint.lng, startPoint.lat]];
        for (const s of stops) coordinates.push([s.lng, s.lat]);
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#0f766e",
            "line-width": 3,
            "line-dasharray": [2, 1.5],
            "line-opacity": 0.8,
          },
        });
      });

      // Numbered DOM markers for stops (tap → what to buy there).
      for (const s of stops) {
        const el = document.createElement("button");
        el.type = "button";
        el.className =
          "flex size-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-sm font-bold text-white shadow";
        el.textContent = String(s.sequenceIndex + 1);
        el.setAttribute("aria-label", s.name);
        const popup = new maplibregl.Popup({ offset: 14, maxWidth: "220px" }).setHTML(
          `<p class="text-sm font-semibold text-zinc-900">${s.name.replace(/[<>&"]/g, "")}</p>` +
            `<p class="mt-0.5 text-xs text-zinc-500">${String(s.itemCount)} article${s.itemCount > 1 ? "s" : ""}` +
            (s.totalCents != null
              ? ` · ${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(s.totalCents / 100)}`
              : "") +
            `</p>`,
        );
        new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
      }
      if (home) {
        const el = document.createElement("div");
        el.className = "relative";
        el.innerHTML =
          '<div class="flex size-4 items-center justify-center rounded-full border-2 border-white bg-zinc-900 shadow"></div>' +
          '<div class="absolute inset-0 -m-1.5 animate-ping rounded-full border border-zinc-900/40"></div>';
        new maplibregl.Marker({ element: el }).setLngLat([home.lng, home.lat]).addTo(map);
      }

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([startPoint.lng, startPoint.lat]);
      for (const s of stops) bounds.extend([s.lng, s.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [show, home, stops, locale]);

  if (stops.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 p-3.5">
        <p className="text-sm font-semibold text-zinc-900">{t("routeMap")}</p>
        <button type="button" className="btn-secondary px-3 text-xs" onClick={() => setShow((v) => !v)}>
          <MapTrifoldIcon size={14} aria-hidden />
          {show ? t("hideMap") : t("showMap")}
        </button>
      </div>
      {show ? <div ref={containerRef} className="h-64 md:h-80" /> : null}
    </div>
  );
}
