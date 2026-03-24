# Weather Anomaly Analyzer

A Next.js application that analyzes weather anomalies by comparing current weather against expected climate patterns for the next 20 years.

## Features

- Real-time weather data fetching
- Climate forecast comparisons
- Anomaly calculation and scoring
- Interactive dashboard with visualizations
- Location-based analysis

## Tech Stack

- **Framework**: Next.js 16+ with TypeScript
- **Styling**: Tailwind CSS
- **API**: Node.js with Next.js API Routes
- **Data**: Weather API integration + Climate forecasts

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
/src
  /app          - Next.js App Router pages
  /api          - API routes for weather/climate data
  /components   - React components
  /lib          - Utility functions
  /types        - TypeScript type definitions
```

## Environment Variables

Create a `.env.local` file in the root directory:

```
NEXT_PUBLIC_WEATHER_API_KEY=your_api_key
NEXT_PUBLIC_CLIMATE_API_KEY=your_climate_api_key
```

## License

MIT
