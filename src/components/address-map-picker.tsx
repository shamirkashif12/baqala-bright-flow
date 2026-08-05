import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Loader2, MapPin } from "lucide-react";

// Vite serves these as hashed URLs rather than the relative paths Leaflet's default icon
// class expects, so its built-in lookup 404s unless overridden — the standard fix for
// Leaflet + Vite/webpack bundlers.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Riyadh — a sane fallback center for a SAR/ZATCA-only tenant when geolocation isn't
// granted, so the map never opens somewhere meaningless like (0, 0).
const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.display_name === "string" ? data.display_name : null;
  } catch {
    // Nominatim's fair-use endpoint occasionally rate-limits — the pin/coordinates are
    // still captured either way, only the address auto-fill is skipped.
    return null;
  }
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// react-leaflet's `center` prop only sets the INITIAL view — recentering after
// geolocation resolves (or after a pick) needs an imperative `setView` via useMap().
function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(position); }, [map, position]);
  return null;
}

export interface AddressMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number, lng: number, resolvedAddress: string | null) => void;
}

// "Choose from map" address picker for the public checkout page: drag/tap a pin,
// reverse-geocoded via OpenStreetMap's Nominatim (no API key) into a human-readable
// address the checkout form auto-fills — but never silently overwrites afterward, since
// the caller only applies the resolved address when the field is still empty/untouched.
export function AddressMapPicker({ latitude, longitude, onLocationChange }: AddressMapPickerProps) {
  const [position, setPosition] = useState<[number, number]>(
    latitude != null && longitude != null ? [latitude, longitude] : DEFAULT_CENTER,
  );
  const [resolving, setResolving] = useState(false);
  const askedForLocation = useRef(false);

  useEffect(() => {
    if (askedForLocation.current || (latitude != null && longitude != null)) return;
    askedForLocation.current = true;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      () => { /* permission denied/unavailable — keep the default center */ },
      { timeout: 5000 },
    );
  }, [latitude, longitude]);

  const handlePick = async (lat: number, lng: number) => {
    setPosition([lat, lng]);
    setResolving(true);
    const address = await reverseGeocode(lat, lng);
    setResolving(false);
    onLocationChange(lat, lng, address);
  };

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg overflow-hidden border border-border/60 relative" style={{ height: 220 }}>
        {/* scrollWheelZoom off. This map is always embedded mid-form inside something scrollable —
            the "New delivery zone" dialog, the public checkout page — and Leaflet's wheel handler
            swallows the event to zoom instead of letting it bubble. In the zone dialog that left
            the form literally unfinishable: 1025px of content in an 808px box, the map parked in
            the middle of it, so a wheel anywhere over the map scrolled the dialog by nothing and
            "Create rule" stayed permanently below the fold. Zooming still works via the +/− control
            and double-click, neither of which is the gesture people use to move down a form. */}
        <MapContainer center={position} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={position}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                handlePick(lat, lng);
              },
            }}
          />
          <ClickHandler onPick={handlePick} />
          <Recenter position={position} />
        </MapContainer>
        {resolving && (
          <div className="absolute top-2 right-2 bg-background/90 rounded-md px-2 py-1 flex items-center gap-1.5 text-xs text-muted-foreground shadow">
            <Loader2 className="h-3 w-3 animate-spin" /> Finding address…
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3 shrink-0" />
        Tap or drag the pin to your delivery location — it fills the address below, which you can still edit.
      </p>
    </div>
  );
}

// Small read-only pin preview for the admin/branch-manager order detail view.
export function AddressMapPreview({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border/60" style={{ height: 160 }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} />
      </MapContainer>
    </div>
  );
}
