/**
 * Types pour l'API Otodo VAV
 */

export interface Hub {
  _id: string;
  mac: string;
  label: string;
  homeId: string;
  parkId: string;
  state: number;
  lastConnection: string;
  software: {
    type: string;
    version: string;
  };
  hardware: {
    type: string;
    version: string;
  };
}

export interface ThermostatModule {
  capabilityId: number;
  deviceId: number;
  endpointIndex: number;
}

export interface WeeklyEvent {
  d: number; // Jour de la semaine (0-6)
  mm: number; // Mode (2 = éco, 3 = confort)
  t: number; // Minutes depuis dimanche 00:00
}

export interface LearningConfig {
  lastStepDown: number;
  stepUP: number;
  minTimeInComfort: number;
  result: number;
  state: number;
  presetDuration: number;
  lastCIT: number;
  interactionRepeatInterval: number;
  dateStarted: number;
  lastWIT: number;
  absTmax: number;
  learnDurationDays: number;
  stepDownMinor: number;
  absTmin: number;
  loweringInterval: number;
  stepDownMajor: number;
}

export interface ThermostatService {
  _id: number; // serviceId
  hubId: string; // hub associé
  homeId: string;
  parkId: string;
  roomId: string;
  isActive: boolean;
  type: 'thermostat';
  timezoneId: string;
  sensors: {
    temp: number | null;
  };
  modules: ThermostatModule[];
  workingMode: number; // voir enum WorkingMode
  limitTemp: number;
  weeklyEvents: WeeklyEvent[];
  loadShedding: boolean;
  hysteresis: number;
  comfortTemp: number; // consigne
  version: number;
  createdAt: string;
  updatedAt: string;
  enableReports: boolean;
  learning: LearningConfig;
}

/**
 * Modes de fonctionnement du thermostat
 * (d’après tes captures / reverse)
 */
export enum WorkingMode {
  AUTO = 0, // suit le planning (weeklyEvents)
  CONFORT = 1, // consigne confort
  MINUS_1 = 2, // -1°C par rapport à la consigne
  MINUS_2 = 3, // -2°C
  ECO = 4, // mode éco
  ANTIFREEZE = 5, // antigel
  MANUAL_OFF = 6, // arrêt manuel (non exposé dans l’accessoire mode)
}

/**
 * Réponses API
 */
export type LocalServicesResponse = ThermostatService[];
export type HubsResponse = Hub[];

/**
 * Rooms
 */
export interface Room {
  _id: string;
  name: string;
  homeId: string;
  parkId: string;
  icon?: string;
  order?: number;
}

export type RoomsResponse = Room[];

export interface DeviceCapability {
  _id: number;
  value: number;
}

export interface DeviceEndpoint {
  capabilities?: DeviceCapability[];
}

export interface Device {
  _id: number;
  endpoints?: DeviceEndpoint[];
}
