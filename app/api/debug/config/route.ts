import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getConfiguredApis, isApiFallbackAvailable, shouldPreferApis, getApiAvailabilityStatus } from '@/lib/api-fallback';
import { getBrowserlessStatus } from '@/lib/browser-pool';

export async function GET() {
  const config = loadConfig();

  return NextResponse.json({
    apiFallback: {
      enabled: config.apiFallback.enabled,
      preferApis: config.apiFallback.preferApis,
      hasGooglePlacesKey: Boolean(config.apiFallback.googlePlacesApiKey),
      hasYelpKey: Boolean(config.apiFallback.yelpFusionApiKey),
      hasFoursquareKey: Boolean(config.apiFallback.foursquareApiKey),
      hasHereKey: Boolean(config.apiFallback.hereApiKey),
      hasTomtomKey: Boolean(config.apiFallback.tomtomApiKey),
    },
    configuredApis: getConfiguredApis(),
    isApiFallbackAvailable: isApiFallbackAvailable(),
    shouldPreferApis: shouldPreferApis(),
    apiAvailability: getApiAvailabilityStatus(),
    browserlessStatus: getBrowserlessStatus(),
    hasBrowserlessKey: Boolean(process.env.BROWSERLESS_API_KEY),
  });
}
