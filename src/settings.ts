export const PLUGIN_NAME = 'homebridge-otodo-vav';
export const PLATFORM_NAME = 'OtodoVavPlatform';
export const AUTH_URL = 'https://api.gateway.otodo.io/authenticate';

/**
 * Headers requis par l'API Otodo VAV
 */
export const API_HEADERS = {
  'Content-Type': 'application/json',
  Accept: '*/*',
  timezoneid: 'Europe/Paris',
  useragent: 'ios.vav.4.9.3',
  language: 'fr',
  'user-agent': 'otodoMobile/1 Homebridge',
  mobileversion: '4.9.3',
  token: 'undefined',
} as const;
