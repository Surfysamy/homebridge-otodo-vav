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
  OFF = 0,
  CONFORT = 1,
  ECO = 2,
  HORS_GEL = 3,
  // ... (4-5 éventuels)
  MANUEL_OFF = 6,
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
