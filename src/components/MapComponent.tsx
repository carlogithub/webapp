'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useState, useEffect } from 'react';

// Fix for default marker icons in React-Leaflet
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapProps {
  onLocationSelect: (lat: number, lng: number) => void;
  selectedLocation?: { lat: number; lng: number } | null;
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onLocationSelect]);

  return null;
}

export default function MapComponent({ onLocationSelect, selectedLocation }: MapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="h-96 w-full bg-gray-200 animate-pulse rounded-lg" />;
  }

  const center: LatLngExpression = selectedLocation ? [selectedLocation.lat, selectedLocation.lng] : [51.505, -0.09];
  const markerPosition: LatLngExpression = selectedLocation ? [selectedLocation.lat, selectedLocation.lng] : [51.505, -0.09];

  return (
    <div className="w-full rounded-lg overflow-hidden shadow-md">
      <MapContainer
        center={center}
        zoom={selectedLocation ? 7 : 3}
        style={{ height: '400px', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapClickHandler onLocationSelect={onLocationSelect} />
        {selectedLocation && (
          <Marker
            position={markerPosition}
            icon={defaultIcon}
          >
            <Popup>
              Selected Location<br />
              Lat: {selectedLocation.lat.toFixed(3)}<br />
              Lng: {selectedLocation.lng.toFixed(3)}
            </Popup>
          </Marker>
        )}
      </MapContainer>
      <p className="mt-2 text-sm text-gray-600">Click on the map to select a location</p>
    </div>
  );
}
