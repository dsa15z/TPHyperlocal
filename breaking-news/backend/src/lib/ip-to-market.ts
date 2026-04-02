/**
 * IP-to-Market resolution for the free teaser mode.
 * Uses ip-api.com (free, no key needed, 45 req/min) to get city/state from IP,
 * then matches to the nearest configured market.
 */

import { prisma } from './prisma.js';

interface GeoResult {
  city: string;
  region: string; // state abbreviation
  regionName: string; // full state name
  lat: number;
  lon: number;
  status: string;
}

/**
 * Resolve an IP address to the nearest active market.
 * Returns null if geolocation fails or no market is within range.
 * Falls back to the largest market (New York) if IP is private/localhost.
 */
export async function resolveMarketFromIP(ip: string): Promise<{ marketId: string; marketName: string; city: string; state: string } | null> {
  try {
    // Skip private/local IPs — fall back to largest market
    if (isPrivateIP(ip)) {
      return getFallbackMarket();
    }

    // Call ip-api.com (free tier, no key)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,region,regionName,lat,lon`);
    if (!response.ok) return getFallbackMarket();

    const geo: GeoResult = await response.json();
    if (geo.status !== 'success') return getFallbackMarket();

    // Find the nearest active market using Haversine distance
    const markets = await prisma.market.findMany({
      where: { isActive: true },
      select: { id: true, name: true, state: true, latitude: true, longitude: true, radiusKm: true },
    });

    if (markets.length === 0) return null;

    let bestMarket = markets[0];
    let bestDistance = Infinity;

    for (const market of markets) {
      const dist = haversineKm(geo.lat, geo.lon, market.latitude, market.longitude);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMarket = market;
      }
    }

    // Only match if within 200km (generous radius for metro areas)
    if (bestDistance > 200) {
      return getFallbackMarket();
    }

    return {
      marketId: bestMarket.id,
      marketName: bestMarket.name,
      city: geo.city,
      state: geo.region,
    };
  } catch {
    return getFallbackMarket();
  }
}

async function getFallbackMarket(): Promise<{ marketId: string; marketName: string; city: string; state: string } | null> {
  // Fall back to the first active market (typically the largest)
  const market = await prisma.market.findFirst({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, state: true },
  });
  if (!market) return null;
  return { marketId: market.id, marketName: market.name, city: market.name, state: market.state || '' };
}

function isPrivateIP(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('::ffff:127.') ||
    ip.startsWith('::ffff:10.') ||
    ip.startsWith('::ffff:192.168.')
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
