import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMapEvents, CircleMarker, Tooltip, Rectangle } from "react-leaflet";
import L from "leaflet";
import type { Route, CorridorNetworkGeoJson } from "@tailwind-loops/clients-react";
import { routeToGeoJson } from "../../utils/routeGeoJson.js";
import { corridorPopupHtml, connectorPopupHtml, routeSummaryPopupHtml } from "../../utils/popups.js";
import { drawElevationChart } from "../../utils/elevationChart.js";

import "leaflet/dist/leaflet.css";

interface LatLng {
  lat: number;
  lng: number;
}

interface TunerMapProps {
  startLatLng: LatLng;
  onStartChange: (latlng: LatLng) => void;
  route: Route | null;
  corridorNetwork: CorridorNetworkGeoJson | null;
  visibleTypes: Record<string, boolean>;
  showArrows: boolean;
  showNetwork: boolean;
  showConnectors: boolean;
  cacheHitZones: { id: string; sizeMB: number; networkBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }; hitBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } }[];
}

const startIcon = L.divIcon({
  className: "start-picker",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Component that handles map click to move start point */
function MapClickHandler({ onStartChange }: { onStartChange: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onStartChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Directional arrow markers along route segments */
function RouteArrows({ routeGeoJson, visible }: { routeGeoJson: GeoJSON.FeatureCollection; visible: boolean }) {
  const map = useMapEvents({ zoomend() {} }); // just to get map ref
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible) return;

    const arrows: L.Marker[] = [];
    const zoom = map.getZoom();

    for (const feature of routeGeoJson.features) {
      const props = feature.properties as Record<string, unknown>;
      if (!props["isSegment"]) continue;
      const geom = feature.geometry as GeoJSON.LineString;
      const coords = geom.coordinates as [number, number][];
      const color = (props["stroke"] as string) || "#2563eb";

      const intervalPx = 80;
      const firstCoord = coords[0];
      if (!firstCoord) continue;
      const intervalMeters =
        intervalPx * 156543.03 * Math.cos((firstCoord[1]!) * Math.PI / 180) / Math.pow(2, zoom);
      let accumulated = 0;

      for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1]!;
        const curr = coords[i]!;
        const [lng1, lat1] = prev;
        const [lng2, lat2] = curr;
        if (lng1 === undefined || lat1 === undefined || lng2 === undefined || lat2 === undefined) continue;
        const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180) * 111320;
        const dy = (lat2 - lat1) * 111320;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        accumulated += segLen;

        if (accumulated >= intervalMeters) {
          accumulated = 0;
          const angle = (Math.atan2(lng2 - lng1, lat2 - lat1) * 180) / Math.PI;
          const midLat = (lat1 + lat2) / 2;
          const midLng = (lng1 + lng2) / 2;
          const arrowIcon = L.divIcon({
            className: "route-arrow",
            html: `<div style="transform:rotate(${angle - 90}deg);color:${color};font-size:16px;font-weight:bold;text-shadow:0 0 3px rgba(0,0,0,0.5);">&#9654;</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          arrows.push(L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }));
        }
      }
    }

    const group = L.layerGroup(arrows);
    group.addTo(map);
    layerRef.current = group;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [routeGeoJson, visible, map]);

  return null;
}

export function TunerMap({
  startLatLng,
  onStartChange,
  route,
  corridorNetwork,
  visibleTypes,
  showArrows,
  showNetwork,
  showConnectors,
  cacheHitZones,
}: TunerMapProps) {
  const [highlightLayer, setHighlightLayer] = useState<L.LayerGroup | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const clearHighlight = useCallback(() => {
    if (highlightLayer && mapRef.current) {
      mapRef.current.removeLayer(highlightLayer);
      setHighlightLayer(null);
    }
  }, [highlightLayer]);

  // Convert Route to GeoJSON for rendering
  const routeGeoJson = useMemo(() => {
    if (!route) return null;
    return routeToGeoJson(route);
  }, [route]);

  // Filter corridor network by visible types
  const filteredNetwork = useMemo(() => {
    if (!corridorNetwork) return null;
    return {
      ...corridorNetwork,
      features: corridorNetwork.features.filter((f) => {
        const props = f as { properties?: { corridorType?: string } };
        const ct = props.properties?.corridorType;
        return ct ? visibleTypes[ct] !== false : true;
      }),
    };
  }, [corridorNetwork, visibleTypes]);

  // Corridor network key for re-rendering GeoJSON
  const networkKey = useMemo(
    () => `network-${JSON.stringify(visibleTypes)}-${corridorNetwork?._meta?.corridorCount ?? 0}`,
    [visibleTypes, corridorNetwork],
  );

  // Route key for re-rendering
  const routeKey = useMemo(
    () => `route-${route?.id ?? "none"}-${route?.score ?? 0}`,
    [route],
  );

  const onCorridorEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const pathLayer = layer as L.Path;
      pathLayer.on("click", () => {
        clearHighlight();
        const geom = feature.geometry;
        if (geom.type !== "LineString" && geom.type !== "MultiLineString") return;

        const coords =
          geom.type === "MultiLineString"
            ? (geom.coordinates as number[][][]).flat()
            : (geom.coordinates as number[][]);
        const latlngs = coords.map((c) => [c[1]!, c[0]!] as [number, number]);

        const highlight = L.polyline(latlngs, {
          color: "#00ffff", weight: 7, opacity: 1, interactive: false,
        });
        const startPt = latlngs[0]!;
        const endPt = latlngs[latlngs.length - 1]!;
        const sm = L.circleMarker(startPt, {
          radius: 6, color: "#fff", fillColor: "#22cc22", fillOpacity: 1, weight: 2, interactive: false,
        });
        const em = L.circleMarker(endPt, {
          radius: 6, color: "#fff", fillColor: "#cc2222", fillOpacity: 1, weight: 2, interactive: false,
        });

        const group = L.layerGroup([highlight, sm, em]);
        if (mapRef.current) group.addTo(mapRef.current);
        setHighlightLayer(group);

        const html = corridorPopupHtml(feature.properties as Record<string, unknown>);
        pathLayer.bindPopup(html, { maxWidth: 350 }).openPopup();

        // Draw elevation chart after popup opens
        pathLayer.on("popupopen", () => {
          setTimeout(() => {
            const canvas = document.querySelector(".elev-chart-canvas") as HTMLCanvasElement | null;
            if (canvas) {
              const profileData = JSON.parse(canvas.dataset["profile"] ?? "[]") as number[];
              const lengthKm = parseFloat(canvas.dataset["lengthKm"] ?? "0");
              if (profileData.length > 1) drawElevationChart(canvas, profileData, lengthKm);
            }
          }, 10);
        });
      });

      pathLayer.on("popupclose", clearHighlight);
    },
    [clearHighlight],
  );

  const corridorStyle = useCallback((feature?: GeoJSON.Feature) => {
    if (!feature) return {};
    const p = feature.properties as Record<string, unknown>;
    return {
      color: (p["stroke"] as string) ?? "#888",
      weight: (p["stroke-width"] as number) ?? 3,
      opacity: (p["stroke-opacity"] as number) ?? 0.85,
    };
  }, []);

  const routeStyle = useCallback((feature?: GeoJSON.Feature) => {
    if (!feature) return {};
    const p = feature.properties as Record<string, unknown>;
    if (!p["isSegment"]) {
      return { color: "transparent", weight: 12, opacity: 0 };
    }
    return {
      color: (p["stroke"] as string) ?? "#2563eb",
      weight: (p["stroke-width"] as number) ?? 4,
      opacity: (p["stroke-opacity"] as number) ?? 0.9,
    };
  }, []);

  const onRouteEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const p = feature.properties as Record<string, unknown>;
      if (p["isSegment"]) {
        const name = (p["corridorName"] as string) || (p["corridorType"] as string) || "connector";
        (layer as L.Path).bindTooltip(`${name} (${p["surface"]})`, { sticky: true });
      } else {
        const html = routeSummaryPopupHtml(p);
        (layer as L.Path).bindPopup(html, { maxWidth: 300 });
      }
    },
    [],
  );

  return (
    <MapContainer
      center={[startLatLng.lat, startLatLng.lng]}
      zoom={12}
      className="map-container"
      ref={(m) => { mapRef.current = m ?? null; }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={19}
      />

      <MapClickHandler onStartChange={onStartChange} />

      {/* Cached network extent (outer) + cache hit zone (inner) */}
      {cacheHitZones.map((zone) => (
        <>
          <Rectangle
            key={`${zone.id}-network`}
            bounds={[
              [zone.networkBounds.minLat, zone.networkBounds.minLng],
              [zone.networkBounds.maxLat, zone.networkBounds.maxLng],
            ]}
            pathOptions={{
              color: "#64748b",
              weight: 1,
              opacity: 0.4,
              fillColor: "#64748b",
              fillOpacity: 0.04,
              dashArray: "4 4",
            }}
          >
            <Tooltip sticky>
              Cached network ({zone.sizeMB} MB)
            </Tooltip>
          </Rectangle>
          <Rectangle
            key={`${zone.id}-hit`}
            bounds={[
              [zone.hitBounds.minLat, zone.hitBounds.minLng],
              [zone.hitBounds.maxLat, zone.hitBounds.maxLng],
            ]}
            pathOptions={{
              color: "#6366f1",
              weight: 2,
              opacity: 0.6,
              fillColor: "#6366f1",
              fillOpacity: 0.08,
              dashArray: "6 4",
            }}
          >
            <Tooltip sticky>
              Cache hit zone ({zone.sizeMB} MB)
            </Tooltip>
          </Rectangle>
        </>
      ))}

      {/* Corridor network layer */}
      {showNetwork && filteredNetwork && filteredNetwork.features.length > 0 && (
        <GeoJSON
          key={networkKey}
          data={filteredNetwork as GeoJSON.FeatureCollection}
          style={corridorStyle}
          onEachFeature={onCorridorEachFeature}
        />
      )}

      {/* Route layer */}
      {routeGeoJson && (
        <GeoJSON
          key={routeKey}
          data={routeGeoJson as unknown as GeoJSON.FeatureCollection}
          style={routeStyle}
          onEachFeature={onRouteEachFeature}
        />
      )}

      {/* Route arrows */}
      {routeGeoJson && <RouteArrows routeGeoJson={routeGeoJson as unknown as GeoJSON.FeatureCollection} visible={showArrows} />}

      {/* Draggable start marker */}
      <Marker
        position={[startLatLng.lat, startLatLng.lng]}
        icon={startIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onStartChange({ lat: pos.lat, lng: pos.lng });
          },
        }}
      />

      {/* Start point circle when route is present */}
      {route && (
        <CircleMarker
          center={[startLatLng.lat, startLatLng.lng]}
          radius={8}
          pathOptions={{ color: "#fff", fillColor: "#2563eb", fillOpacity: 1, weight: 3 }}
        >
          <Tooltip permanent direction="right" offset={[10, 0]}>
            Start
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
