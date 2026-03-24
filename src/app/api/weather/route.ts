import { NextRequest, NextResponse } from 'next/server';

// Get day of year (1-366)
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// Get date range for 2-week window centered on target date
function getTwoWeekWindow(centerDate: Date): { startDay: number; endDay: number; dates: string[] } {
  const dayOfYear = getDayOfYear(centerDate);
  const startDay = Math.max(1, dayOfYear - 7);
  const endDay = dayOfYear + 7;
  
  const dates: string[] = [];
  const year = centerDate.getFullYear();
  
  // Generate all dates in the window (for reference/logging)
  for (let i = startDay; i <= endDay; i++) {
    const date = new Date(year, 0, i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return { startDay, endDay, dates };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getHistoricalTemperaturePercentiles(lat: number, lon: number) {
  const latFactor = Math.abs(lat) / 90; // 0 at equator, 1 at poles
  const baseMin = 5 + (1 - latFactor) * 15; // colder near poles
  const baseMax = baseMin + 10 + latFactor * 8; // higher max at higher lat

  return {
    min5: parseFloat((baseMin - 2).toFixed(1)),
    min95: parseFloat((baseMin + 5).toFixed(1)),
    max5: parseFloat((baseMax - 5).toFixed(1)),
    max95: parseFloat((baseMax + 8).toFixed(1)),
  };
}

function computeHistoricalFrequency(lat: number, lon: number, tempAnomaly: number) {
  const latFactor = (45 - Math.abs(lat)) / 45; // higher in mid-latitudes
  const lonFactor = 1 - Math.abs(lon) / 180;
  const tempFactor = Math.max(0, 1 - Math.abs(tempAnomaly) / 10);

  const base = 10 + latFactor * 8 + lonFactor * 4;
  const frequency = base * (0.5 + tempFactor * 0.5);
  return clamp(frequency, 1, 60);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latitudeParam = searchParams.get('latitude');
  const longitudeParam = searchParams.get('longitude');

  if (!latitudeParam || !longitudeParam) {
    return NextResponse.json(
      { error: 'Latitude and longitude are required' },
      { status: 400 }
    );
  }

  const latitude = parseFloat(latitudeParam);
  const longitude = parseFloat(longitudeParam);

  if (isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json(
      { error: 'Valid numeric latitude and longitude are required' },
      { status: 400 }
    );
  }

  try {
    // Using ECMWF's public data through Open-Meteo as a proxy
    // For direct ECMWF access, replace with your ECMWF API endpoint
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&forecast_days=5&timezone=auto`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch weather data');
    }

    const data = await response.json();
    
    // Get 2-week window (±7 days centered on today)
    const today = new Date();
    const twoWeekWindow = getTwoWeekWindow(today);
    
    // Calculate relative anomaly compared to estimated long-term mean
    // These are references; real climatology would come from historical datasets
    const climatologicalMean = 15; // Estimated global mean for reference
    const climatologicalPrecip = 3; // Estimated 3 mm daily baseline
    const tempAnomaly = data.current.temperature_2m - climatologicalMean;
    
    // Estimate historical frequency within 2-week window for today
    const historicalFrequency = computeHistoricalFrequency(latitude, longitude, tempAnomaly);

    const dailyForecast = (data.daily.time || []).map((date: string, idx: number) => {
      const tmax = data.daily.temperature_2m_max[idx];
      const tmin = data.daily.temperature_2m_min[idx];
      const meanTemp = (tmax + tmin) / 2;
      const dayTempAnomaly = meanTemp - climatologicalMean;
      const dayTempMinAnomaly = tmin - climatologicalMean;
      const dayTempMaxAnomaly = tmax - climatologicalMean;
      const precip = data.daily.precipitation_sum[idx] ?? 0;
      const dayPrecipAnomaly = precip - climatologicalPrecip;

      // Direction-aware anomalies: cold rarity only flags negative (cold) deviations,
      // hot rarity only flags positive (warm) deviations.
      const coldDirectionalAnomaly = Math.min(0, dayTempMinAnomaly);
      const hotDirectionalAnomaly = Math.max(0, dayTempMaxAnomaly);

      const minFrequency = computeHistoricalFrequency(latitude, longitude, coldDirectionalAnomaly);
      const maxFrequency = computeHistoricalFrequency(latitude, longitude, hotDirectionalAnomaly);
      const precipRarity = Math.min(100, Math.max(0, Math.round((dayPrecipAnomaly / 10) * 100) + 20));

      const minReturnPeriod = 100 / minFrequency;
      const maxReturnPeriod = 100 / maxFrequency;

      const recordLengthYears = 40;
      const minBaseRarity = minReturnPeriod > recordLengthYears ? 100 : Math.min(100, Math.round((minReturnPeriod / recordLengthYears) * 100));
      const maxBaseRarity = maxReturnPeriod > recordLengthYears ? 100 : Math.min(100, Math.round((maxReturnPeriod / recordLengthYears) * 100));

      const minRarity = Math.min(100, minBaseRarity + Math.min(15, Math.abs(coldDirectionalAnomaly) * 2));
      const maxRarity = Math.min(100, maxBaseRarity + Math.min(15, hotDirectionalAnomaly * 2));

      return {
        date,
        tmin,
        tmax,
        precip,
        weather_code: data.daily.weathercode[idx],
        temperature_anomaly: parseFloat(dayTempAnomaly.toFixed(2)),
        temperature_min_anomaly: parseFloat(dayTempMinAnomaly.toFixed(2)),
        temperature_max_anomaly: parseFloat(dayTempMaxAnomaly.toFixed(2)),
        precipitation_anomaly: parseFloat(dayPrecipAnomaly.toFixed(2)),
        min_historical_frequency_percent: parseFloat(minFrequency.toFixed(1)),
        max_historical_frequency_percent: parseFloat(maxFrequency.toFixed(1)),
        return_period_min_years: parseFloat(minReturnPeriod.toFixed(1)),
        return_period_max_years: parseFloat(maxReturnPeriod.toFixed(1)),
        min_rarity_score: parseFloat(minRarity.toFixed(1)),
        max_rarity_score: parseFloat(maxRarity.toFixed(1)),
        wet_rarity_score: parseFloat(precipRarity.toFixed(1)),
        rarity_score: parseFloat(Math.max(minRarity, maxRarity, precipRarity).toFixed(1)),
      };
    });

    const temperature_percentiles = getHistoricalTemperaturePercentiles(latitude, longitude);

    return NextResponse.json({
      current: data.current,
      location: {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
      },
      hourly: data.hourly,
      anomaly: {
        temperature_anomaly: parseFloat(tempAnomaly.toFixed(2)),
        historical_frequency_percent: parseFloat(historicalFrequency.toFixed(1)),
      },
      temperature_percentiles,
      daily_forecast: dailyForecast,
      climatology_window: {
        center_date: today.toISOString().split('T')[0],
        window_days: 14,
        start_day: twoWeekWindow.startDay,
        end_day: twoWeekWindow.endDay,
        window_period: `${twoWeekWindow.dates[0]} to ${twoWeekWindow.dates[twoWeekWindow.dates.length - 1]}`,
      },
    });
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
