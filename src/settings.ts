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

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  parkname: 'vav',
  pollIntervalSec: 30,
  debug: false,
  displayModeSliders: false,
  minPollInterval: 10,
  maxPollInterval: 300,
  minTemperature: 5,
  maxTemperature: 30,
} as const;

/**
 * Configuration interface for type safety
 */
export interface OtodoVavConfig {
  name?: string;
  email?: string;
  password?: string;
  parkname?: string;
  homeId?: string;
  pollIntervalSec?: number;
  debug?: boolean;
  displayModeSliders?: boolean;
}
