"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => <div className="h-96 w-full bg-gray-200 rounded-lg animate-pulse" />,
});

interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  anomaly: {
    temperature_anomaly: number;
    historical_frequency_percent: number;
  };
  temperature_percentiles: {
    min5: number;
    min95: number;
    max5: number;
    max95: number;
  };
  daily_forecast: Array<{
    date: string;
    tmin: number;
    tmax: number;
    precip: number;
    weather_code: number;
    temperature_anomaly: number;
    temperature_min_anomaly: number;
    temperature_max_anomaly: number;
    precipitation_anomaly: number;
    min_historical_frequency_percent: number;
    max_historical_frequency_percent: number;
    wet_historical_frequency_percent: number;
    return_period_min_years: number;
    return_period_max_years: number;
    return_period_wet_years: number;
    min_rarity_score: number;
    max_rarity_score: number;
    wet_rarity_score: number;
    rarity_score: number;
  }>;
}

interface ClimateData {
  scenario: string;
  projections: {
    temperature_change_2050: number;
    temperature_change_2100: number;
    precipitation_change_percent: number;
    extremes_frequency_increase: number;
  };
  model: string;
  region?: string;
  resolution?: string;
  current_event_frequency: number;
  future_event_frequency: number;
  frequency_increase_percent: number;
  current_return_period_years: number;
  future_return_period_years: number;
  climatology_window?: {
    center_date: string;
    window_days: number;
    start_day: number;
    end_day: number;
    window_period: string;
  };
}

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [selectedForecastDay, setSelectedForecastDay] = useState<WeatherData['daily_forecast'][0] | null>(null);
  const [climateData, setClimateData] = useState<ClimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{display_name: string; lat: number; lon: number}>>([]);
  const [extremeMode, setExtremeMode] = useState<'hot' | 'cold' | 'wet'>('hot');

  useEffect(() => {
    if (selectedLocation) {
      // refresh climate projections when extreme mode changes
      (async () => {
        setLoading(true);
        try {
          const climateRes = await fetch(`/api/climate?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lng}&scenario=ssp245&extreme=${extremeMode}`);
          if (!climateRes.ok) throw new Error('Failed to fetch climate data');
          const climate = await climateRes.json();
          setClimateData(climate);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [extremeMode, selectedLocation]);

  const handleLocationSelect = async (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setLoading(true);
    setError(null);

    try {
      // Fetch real weather data
      const weatherRes = await fetch(`/api/weather?latitude=${lat}&longitude=${lng}`);
      if (!weatherRes.ok) throw new Error("Failed to fetch weather data");
      const weather = await weatherRes.json();
      setWeatherData(weather);
      setSelectedForecastDay(weather.daily_forecast?.[0] ?? null);

      // Fetch climate projections for selected extreme mode
      const climateRes = await fetch(`/api/climate?latitude=${lat}&longitude=${lng}&scenario=ssp245&extreme=${extremeMode}`);
      if (!climateRes.ok) throw new Error("Failed to fetch climate data");
      const climate = await climateRes.json();
      setClimateData(climate);

      setShowMap(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCitySearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const normalized = encodeURIComponent(searchQuery);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${normalized}`);
      const results = await response.json();
      const mapped = results.slice(0, 5).map((item: any) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));
      setSearchResults(mapped);
    } catch (err) {
      setSearchResults([]);
      console.error('City search error', err);
    }
  };

  const handleSearchSelect = (lat: number, lon: number) => {
    handleLocationSelect(lat, lon);
    setSearchResults([]);
    setShowMap(true);
  };

  const getWeatherDescription = (code: number): string => {
    const weatherCodes: { [key: number]: string } = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Foggy",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Slight snow",
      73: "Moderate snow",
      75: "Heavy snow",
      77: "Snow grains",
      80: "Slight rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      85: "Slight snow showers",
      86: "Heavy snow showers",
      95: "Thunderstorm",
      96: "Thunderstorm with hail",
      99: "Thunderstorm with heavy hail",
    };
    return weatherCodes[code] || "Unknown";
  };

  const calculateAnomalyScore = (tempAnomaly: number, mode: 'hot' | 'cold' | 'wet', currentFreq: number, futureFreq: number): number => {
    if (mode === 'hot') return Math.min(100, Math.max(0, tempAnomaly * 10));
    if (mode === 'cold') return Math.min(100, Math.max(0, -tempAnomaly * 10));
    // wet: use climate ratio
    if (currentFreq === 0) return 100;
    return Math.min(100, Math.max(0, (futureFreq / currentFreq - 1) * 10));
  };

  const getAnomalyLevel = (score: number): { level: string; color: string } => {
    if (score >= 80) return { level: "Extreme", color: "text-red-700" };
    if (score >= 60) return { level: "Very High", color: "text-orange-600" };
    if (score >= 40) return { level: "High", color: "text-yellow-600" };
    if (score >= 20) return { level: "Moderate", color: "text-blue-600" };
    return { level: "Normal", color: "text-green-600" };
  };

  const getTemperaturePhrase = (delta: number): { text: string; icon: string; color: string } => {
    if (delta >= 3) return { text: 'unusually warm', icon: '🔥', color: 'text-red-600' };
    if (delta >= 1) return { text: 'warmer than usual', icon: '🌡️', color: 'text-orange-600' };
    if (delta > -1) return { text: 'near normal', icon: '🟢', color: 'text-green-600' };
    if (delta > -3) return { text: 'cooler than usual', icon: '🧊', color: 'text-blue-600' };
    return { text: 'unusually cool', icon: '❄️', color: 'text-blue-700' };
  };

  const getPrecipitationPhrase = (change: number): { text: string; icon: string; color: string } => {
    if (change >= 10) return { text: 'much wetter', icon: '🌧️', color: 'text-cyan-700' };
    if (change >= 2) return { text: 'wetter', icon: '☔', color: 'text-cyan-600' };
    if (change > -2) return { text: 'near normal', icon: '⛅', color: 'text-green-600' };
    if (change > -10) return { text: 'drier', icon: '🌤️', color: 'text-yellow-600' };
    return { text: 'much drier', icon: '☀️', color: 'text-orange-700' };
  };

  const getRarityLevel = (rarity: number): { label: string; color: string } => {
    if (rarity >= 80) return { label: 'Extreme rarity', color: 'text-red-600' };
    if (rarity >= 60) return { label: 'High rarity', color: 'text-orange-600' };
    if (rarity >= 40) return { label: 'Moderate rarity', color: 'text-yellow-700' };
    if (rarity >= 20) return { label: 'Low rarity', color: 'text-blue-600' };
    return { label: 'Common', color: 'text-green-700' };
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-5xl font-bold text-gray-900">
            Weather Anomaly Analyzer
          </h1>
          <p className="text-xl text-gray-600">
            Compare current weather against 20-year CMIP climate projections
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {/* Map Section */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-800">
              {selectedLocation ? "Location Selected" : "Select Location"}
            </h2>
            <button
              onClick={() => setShowMap(!showMap)}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-600"
            >
              {showMap ? "Hide Map" : "Show Map"}
            </button>
          </div>

          {selectedLocation && (
            <div className="mb-4 rounded bg-indigo-50 p-3">
              <p className="text-sm font-semibold text-indigo-900">
                Latitude: {selectedLocation.lat.toFixed(3)} | Longitude: {selectedLocation.lng.toFixed(3)}
              </p>
            </div>
          )}

          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-600">City / Place Search</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCitySearch(); }}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="e.g. Paris, France"
                />
                <button
                  onClick={handleCitySearch}
                  className="rounded bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                >Search</button>
              </div>
              {searchResults.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded border bg-white p-2 text-xs">
                  {searchResults.map((result) => (
                    <li
                      key={`${result.lat}-${result.lon}`}
                      onClick={() => handleSearchSelect(result.lat, result.lon)}
                      className="cursor-pointer p-1 hover:bg-indigo-50"
                    >
                      {result.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Extreme mode</label>
              <div className="mt-1 flex gap-2">
                {['hot', 'cold', 'wet'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setExtremeMode(mode as 'hot' | 'cold' | 'wet')}
                    className={`rounded px-3 py-2 text-sm font-medium ${extremeMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    {mode === 'hot' ? 'Hot (max)' : mode === 'cold' ? 'Cold (min)' : 'Wet'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showMap && (
            <MapComponent
              onLocationSelect={handleLocationSelect}
              selectedLocation={selectedLocation}
            />
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mb-8 text-center">
            <div className="inline-block">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600"></div>
              <p className="mt-2 text-gray-600">Fetching real weather and climate data...</p>
            </div>
          </div>
        )}

        {/* Data Display */}
        {!loading && selectedLocation && weatherData && climateData && (() => {
          const firstDay = weatherData.daily_forecast?.[0];
          const anomalyScore = firstDay
            ? (extremeMode === 'hot' ? firstDay.max_rarity_score : extremeMode === 'cold' ? firstDay.min_rarity_score : firstDay.wet_rarity_score)
            : calculateAnomalyScore(weatherData.anomaly.temperature_anomaly, extremeMode, climateData.current_event_frequency, climateData.future_event_frequency);
          const anomalyInfo = getAnomalyLevel(anomalyScore);

          const forecastDays = weatherData.daily_forecast || [];
          const curveValues = forecastDays.map((day) => {
            if (extremeMode === 'hot') return day.tmax;
            if (extremeMode === 'cold') return day.tmin;
            return day.precip;
          });
          const minCurve = Math.min(...curveValues);
          const maxCurve = Math.max(...curveValues);
          const curveLabel = extremeMode === 'hot' ? 'Max Temperature' : extremeMode === 'cold' ? 'Min Temperature' : 'Precipitation';
          const curveUnits = extremeMode === 'wet' ? 'mm' : '°C';

          const tempCurvePoints = forecastDays
            .map((day, idx) => {
              const value = extremeMode === 'hot' ? day.tmax : extremeMode === 'cold' ? day.tmin : day.precip;
              const norm = maxCurve === minCurve ? 0.5 : (value - minCurve) / (maxCurve - minCurve);
              const x = 12 + idx * (280 / Math.max(1, forecastDays.length - 1));
              const y = 120 - norm * 100;
              return `${x},${y}`;
            })
            .join(' ');

          const percentiles = weatherData.temperature_percentiles;
          const yForValue = (value: number) => {
            const rangeMin = (extremeMode === 'wet' ? minCurve : Math.min(minCurve, percentiles.min5, percentiles.min95, percentiles.max5, percentiles.max95));
            const rangeMax = (extremeMode === 'wet' ? maxCurve : Math.max(maxCurve, percentiles.min5, percentiles.min95, percentiles.max5, percentiles.max95));
            const clamped = Math.max(rangeMin, Math.min(rangeMax, value));
            return 120 - ((clamped - rangeMin) / (rangeMax - rangeMin || 1)) * 100;
          };

          return (
            <>
              {/* Anomaly Score Banner */}
              <div className={`mb-8 rounded-lg border-l-4 p-6 shadow-lg ${
                anomalyScore >= 80 ? 'bg-red-50 border-red-500' :
                anomalyScore >= 60 ? 'bg-orange-50 border-orange-500' :
                anomalyScore >= 40 ? 'bg-yellow-50 border-yellow-500' :
                anomalyScore >= 20 ? 'bg-blue-50 border-blue-500' :
                'bg-green-50 border-green-500'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="mb-2 text-xl font-bold text-gray-800">Weather Anomaly Score</h3>
                    <p className={`text-sm ${anomalyInfo.color}`}>
                      {anomalyInfo.level} - {
                        anomalyScore >= 60
                          ? "This weather pattern is unusual for this location"
                          : anomalyScore >= 40
                            ? "This weather pattern is somewhat unusual for this location"
                            : anomalyScore >= 20
                              ? "This weather pattern is moderately typical for this location"
                              : "This weather pattern is near normal for this location"
                      }
                    </p>
                  </div>
                  <div className="text-center">
                    <div className={`text-5xl font-bold ${anomalyInfo.color}`}>
                      {Math.round(anomalyScore)}
                    </div>
                    <p className="text-xs text-gray-600">/ 100</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {weatherData && climateData && (
                    (() => {
                      const temp = getTemperaturePhrase(weatherData.anomaly.temperature_anomaly);
                      const prec = getPrecipitationPhrase(climateData.projections.precipitation_change_percent);
                      return (
                        <>
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-500">Temperature</p>
                            <p className="text-lg font-bold" style={{ color: temp.color }}>
                              {temp.icon} {temp.text} ({weatherData.anomaly.temperature_anomaly.toFixed(1)}°C anomaly)
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-500">Precipitation</p>
                            <p className="text-lg font-bold" style={{ color: prec.color }}>
                              {prec.icon} {prec.text} ({climateData.projections.precipitation_change_percent.toFixed(1)}%)
                            </p>
                          </div>
                        </>
                      );
                    })()
                  )}
                </div>
              </div>

              {weatherData.daily_forecast && weatherData.daily_forecast.length > 0 && (
                <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
                  <h2 className="mb-3 text-2xl font-semibold text-gray-800">5-day Rarity Forecast</h2>
                  <div className="flex items-center gap-3 overflow-x-auto pb-3">
                    {weatherData.daily_forecast.map((day) => {
                      const dayRarityValue = extremeMode === 'hot'
                        ? day.max_rarity_score
                        : extremeMode === 'cold'
                          ? day.min_rarity_score
                          : day.wet_rarity_score;
                      const rarity = getRarityLevel(dayRarityValue);
                      const isSelected = selectedForecastDay?.date === day.date;
                      return (
                        <button
                          key={day.date}
                          onClick={() => setSelectedForecastDay(day)}
                          className={`min-w-[115px] rounded-lg border p-3 text-left transition ${
                            isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300'
                          }`}
                        >
                          <p className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</p>
                          <p className="font-bold text-lg">{Math.round(dayRarityValue)}</p>
                          <p className={`text-xs font-semibold ${rarity.color}`}>{rarity.label}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="h-44 w-full rounded-lg border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500 mb-2">5-day {curveLabel} curve [{curveUnits}] (click points to view day-specific values)</p>
                    <div className="relative">
                      <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">
                        <polyline
                          fill="none"
                          stroke="#4f46e5"
                          strokeWidth="3"
                          points={tempCurvePoints}
                        />
                        {weatherData.temperature_percentiles && (extremeMode !== 'wet') && (
                          <>
                            <line x1="0" y1={yForValue(weatherData.temperature_percentiles.min5)} x2="300" y2={yForValue(weatherData.temperature_percentiles.min5)} stroke="#3b82f6" strokeDasharray="4 2" />
                            <line x1="0" y1={yForValue(weatherData.temperature_percentiles.min95)} x2="300" y2={yForValue(weatherData.temperature_percentiles.min95)} stroke="#3b82f6" strokeDasharray="4 2" />
                            <line x1="0" y1={yForValue(weatherData.temperature_percentiles.max5)} x2="300" y2={yForValue(weatherData.temperature_percentiles.max5)} stroke="#ef4444" strokeDasharray="4 2" />
                            <line x1="0" y1={yForValue(weatherData.temperature_percentiles.max95)} x2="300" y2={yForValue(weatherData.temperature_percentiles.max95)} stroke="#ef4444" strokeDasharray="4 2" />
                          </>
                        )}
                        {forecastDays.map((day, idx) => {
                          const value = extremeMode === 'hot' ? day.tmax : extremeMode === 'cold' ? day.tmin : day.precip;
                          const norm = maxCurve === minCurve ? 0.5 : (value - minCurve) / (maxCurve - minCurve);
                          const x = 12 + idx * (280 / Math.max(1, forecastDays.length - 1));
                          const y = 120 - norm * 100;
                          return (
                            <circle
                              key={day.date}
                              cx={x}
                              cy={y}
                              r={4}
                              fill={selectedForecastDay?.date === day.date ? '#4f46e5' : '#a5b4fc'}
                              onClick={() => setSelectedForecastDay(day)}
                              style={{ cursor: 'pointer' }}
                            />
                          );
                        })}
                      </svg>
                      {/* Horizontal line labels — HTML overlay, same y% as SVG lines */}
                      {weatherData.temperature_percentiles && extremeMode !== 'wet' && (() => {
                        const p = weatherData.temperature_percentiles;
                        return [
                          { label: `min p5 ${p.min5}°C`,  value: p.min5,  color: '#3b82f6' },
                          { label: `min p95 ${p.min95}°C`, value: p.min95, color: '#3b82f6' },
                          { label: `max p5 ${p.max5}°C`,  value: p.max5,  color: '#ef4444' },
                          { label: `max p95 ${p.max95}°C`, value: p.max95, color: '#ef4444' },
                        ].map(({ label, value, color }) => (
                          <span
                            key={label}
                            className="absolute right-1 text-xs -translate-y-1/2 bg-gray-50 px-0.5 leading-none"
                            style={{ top: `${yForValue(value) / 120 * 100}%`, color }}
                          >
                            {label}
                          </span>
                        ));
                      })()}
                      <div className="relative h-5">
                        {forecastDays.map((day, idx) => {
                          const pct = (12 + idx * (280 / Math.max(1, forecastDays.length - 1))) / 300 * 100;
                          return (
                            <span
                              key={day.date}
                              className="absolute text-xs text-gray-500 -translate-x-1/2"
                              style={{ left: `${pct}%` }}
                            >
                              {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Min {curveLabel.toLowerCase()}: {minCurve.toFixed(1)}{curveUnits}, max {curveLabel.toLowerCase()}: {maxCurve.toFixed(1)}{curveUnits}.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Forecast-Day Detail Card */}
                <div className="rounded-lg bg-white p-6 shadow-md">
                  <h2 className="mb-4 text-2xl font-semibold text-gray-800">
                    Selected Forecast Day
                  </h2>
                  {selectedForecastDay ? (
                    <div className="space-y-3 text-gray-700">
                      <p className="text-sm text-gray-500">{new Date(selectedForecastDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                      <p className="text-xl font-bold">Rarity Score: {extremeMode === 'hot' ? selectedForecastDay.max_rarity_score.toFixed(1) : extremeMode === 'cold' ? selectedForecastDay.min_rarity_score.toFixed(1) : selectedForecastDay.wet_rarity_score.toFixed(1)} / 100</p>
                      <p className="text-xs text-gray-500">100 means conditions are beyond the 40-year record and effectively unprecedented in this estimated baseline (based on {extremeMode} extreme).</p>
                      <p className="text-sm font-semibold text-gray-600">{getRarityLevel(extremeMode === 'hot' ? selectedForecastDay.max_rarity_score : extremeMode === 'cold' ? selectedForecastDay.min_rarity_score : selectedForecastDay.wet_rarity_score).label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Temp Min</p>
                          <p className="text-lg font-bold text-blue-600">{selectedForecastDay.tmin}°C</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Temp Max</p>
                          <p className="text-lg font-bold text-red-600">{selectedForecastDay.tmax}°C</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Precipitation</p>
                        <p className="text-lg font-bold text-teal-600">{selectedForecastDay.precip} mm</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Temperature Anomaly</p>
                        <p className="text-lg font-bold">{selectedForecastDay.temperature_anomaly.toFixed(1)}°C</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Precipitation Anomaly</p>
                        <p className="text-lg font-bold">{selectedForecastDay.precipitation_anomaly.toFixed(1)} mm</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Daily Return Period ({curveLabel})</p>
                        <p className="text-lg font-bold">
                          1 in {extremeMode === 'hot' ? selectedForecastDay.return_period_max_years.toFixed(1) : extremeMode === 'cold' ? selectedForecastDay.return_period_min_years.toFixed(1) : selectedForecastDay.return_period_wet_years.toFixed(1)} years
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Historical Frequency ({curveLabel})</p>
                        <p className="text-lg font-bold">
                          {extremeMode === 'hot' ? selectedForecastDay.max_historical_frequency_percent.toFixed(1) : extremeMode === 'cold' ? selectedForecastDay.min_historical_frequency_percent.toFixed(1) : selectedForecastDay.wet_historical_frequency_percent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-600">No day selected yet.</p>
                  )}
                </div>

                {/* Frequency Comparison Card */}
                <div className="rounded-lg bg-white p-6 shadow-md">
                  <h2 className="mb-4 text-2xl font-semibold text-gray-800">
                    Return Period
                  </h2>
                  <p className="mb-2 text-xs text-gray-500">How often this event occurs on average</p>
                  {climateData.climatology_window && (
                    <p className="mb-4 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      📅 Based on climatology for ±7 days around {new Date(climateData.climatology_window.center_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <br />
                      <span className="text-xs text-gray-600">({climateData.climatology_window.window_period})</span>
                    </p>
                  )}
                  <div className="space-y-4">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-gray-500">Selected Forecast Day Return Period (based on daily {extremeMode === 'hot' ? 'max temperature' : extremeMode === 'cold' ? 'min temperature' : 'precipitation'})</p>
                      {selectedForecastDay ? (
                        <p className="text-lg font-bold text-purple-600">
                          1 in {extremeMode === 'hot' ? selectedForecastDay.return_period_max_years.toFixed(1) : extremeMode === 'cold' ? selectedForecastDay.return_period_min_years.toFixed(1) : selectedForecastDay.return_period_wet_years.toFixed(1)} years
                          <span className="text-xs text-gray-500">
                            ({extremeMode === 'hot' ? selectedForecastDay.max_historical_frequency_percent.toFixed(1) : extremeMode === 'cold' ? selectedForecastDay.min_historical_frequency_percent.toFixed(1) : selectedForecastDay.precipitation_anomaly.toFixed(1)}% extreme probability)
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">Select a day from the 5-day curve ({curveLabel}) to see day-specific return period.</p>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-600">Present Climate</p>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            1 in {climateData.current_return_period_years.toFixed(1)} years
                          </p>
                          <p className="text-xs text-gray-500">
                            ({climateData.current_event_frequency.toFixed(1)}% annual probability)
                          </p>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${Math.min(100, (100 / climateData.current_return_period_years) * 5)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-600">Future Climate</p>
                        <div className="text-right">
                          <p className="text-lg font-bold text-red-600">
                            1 in {climateData.future_return_period_years.toFixed(1)} years
                          </p>
                          <p className="text-xs text-gray-500">
                            ({climateData.future_event_frequency.toFixed(1)}% annual probability)
                          </p>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-red-600 transition-all"
                          style={{ width: `${Math.min(100, (100 / climateData.future_return_period_years) * 5)}%` }}
                        />
                      </div>
                    </div>
                    <div className="border-t pt-3 bg-orange-50 -m-6 mt-4 p-3 px-6 rounded-b-lg">
                      <p className="text-xs font-semibold text-gray-600">Change by 2050</p>
                      <p className="text-sm text-gray-700 mt-1">
                        {climateData.frequency_increase_percent >= 0
                          ? <>Event frequency expected to increase <span className="font-bold text-orange-600">+{climateData.frequency_increase_percent}%</span></>
                          : <>Its frequency is expected to decrease by <span className="font-bold text-blue-600">{Math.abs(climateData.frequency_increase_percent)}%</span></>
                        }
                        <br />
                        <span className="text-xs">
                          (from ~1 in {climateData.current_return_period_years.toFixed(0)} years to ~1 in {climateData.future_return_period_years.toFixed(0)} years)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Climate Projections Card */}
                <div className="rounded-lg bg-white p-6 shadow-md">
                  <h2 className="mb-4 text-2xl font-semibold text-gray-800">
                    Climate Projections
                  </h2>
                  <div className="mb-3 space-y-1">
                    <p className="text-sm text-gray-500">Scenario: {climateData.scenario.toUpperCase()}</p>
                    <p className="text-xs font-semibold text-blue-600">
                      {climateData.model}
                    </p>
                    <p className="text-xs text-gray-500">
                      Resolution: {climateData.resolution}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-600">By 2050</p>
                      <p className="text-2xl font-bold text-orange-600">
                        +{climateData.projections.temperature_change_2050}°C
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600">By 2100</p>
                      <p className="text-2xl font-bold text-red-600">
                        +{climateData.projections.temperature_change_2100}°C
                      </p>
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-600">Precipitation</p>
                      <p className="text-lg font-bold text-green-600">
                        {climateData.projections.precipitation_change_percent > 0 ? "+" : ""}
                        {climateData.projections.precipitation_change_percent}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insight Card */}
              <div className="mt-8 rounded-lg bg-indigo-50 p-6 shadow-md border-l-4 border-indigo-500">
                <h3 className="mb-3 text-lg font-semibold text-gray-800">Key Insight</h3>
                <p className="text-gray-700 leading-relaxed">
                  Currently, this weather event occurs approximately{" "}
                  <span className="font-bold text-blue-600">once every {climateData.current_return_period_years.toFixed(0)} years</span> (based on current climatology, not the daily min/max forecast curve).
                  By mid-century under SSP245 emissions,{" "}
                  {climateData.frequency_increase_percent >= 0 ? (
                    <>it's expected to become{" "}
                    <span className="font-bold text-orange-600">
                      {climateData.frequency_increase_percent.toFixed(0)}% more frequent
                    </span></>
                  ) : (
                    <>its frequency is expected to{" "}
                    <span className="font-bold text-blue-600">
                      decrease by {Math.abs(climateData.frequency_increase_percent).toFixed(0)}%
                    </span></>
                  )}{" "}
                  — occurring roughly{" "}
                  <span className="font-bold text-red-600">once every {climateData.future_return_period_years.toFixed(0)} years</span>.
                  The selected 5-day curve shows expected average conditions from daily min/max values, with day-specific return period shown above for the selected day.
                </p>
              </div>
            </>
          );
        })()}

        {/* Footer */}
        <div className="mt-12 border-t border-gray-300 pt-8 text-center text-gray-600">
          <p>© 2026 Weather Anomaly Analyzer</p>
          <p className="mt-2 text-sm">
            {!loading && selectedLocation && climateData ? (
              <>Using ECMWF weather data and {climateData.region === 'Europe' ? 'Euro-Cordex' : 'CMIP6'} projections ({climateData.scenario.toUpperCase()} scenario)</>
            ) : (
              <>Using ECMWF weather data and CMIP6/Euro-Cordex projections</>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
