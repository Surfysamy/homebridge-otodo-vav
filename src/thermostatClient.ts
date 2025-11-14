import type { Logger } from 'homebridge';
import { AuthClient } from './auth';
import {
  Hub,
  ThermostatService,
  WorkingMode,
  HubsResponse,
  LocalServicesResponse,
  Room,
  RoomsResponse,
  Device,
} from './types';

const BASE_URL = 'https://api.gateway.otodo.io';

export class ThermostatClient {
  constructor(
    private readonly log: Logger,
    private readonly auth: AuthClient,
  ) {}

  /**
   * Récupère tous les hubs de l'utilisateur
   */
  async getHubs(): Promise<Hub[]> {
    const res = await this.auth.authedFetch(`${BASE_URL}/hubs`);

    if (!res.ok) {
      throw new Error(`Erreur lors de la récupération des hubs: ${res.status}`);
    }

    return res.json() as Promise<HubsResponse>;
  }

  /**
   * Récupère toutes les rooms (facultatif, pour jolis noms)
   */
  async getRooms(): Promise<Room[]> {
    const res = await this.auth.authedFetch(`${BASE_URL}/rooms`);

    if (!res.ok) {
      throw new Error(
        `Erreur lors de la récupération des pièces: ${res.status}`,
      );
    }

    return res.json() as Promise<RoomsResponse>;
  }

  async getLocalServices(hubId: string): Promise<ThermostatService[]> {
    const res = await this.auth.authedFetch(
      `${BASE_URL}/hubs/${hubId}/local-services`,
    );

    if (!res.ok) {
      throw new Error(
        `Erreur API local-services sur hub ${hubId}: ${res.status}`,
      );
    }

    const json = (await res.json()) as LocalServicesResponse;
    return json.filter(s => s.type === 'thermostat');
  }

  /**
   * Récupère tous les local-services (thermostats) de tous les hubs
   */
  async getAllThermostats(hubId: string): Promise<ThermostatService[]> {
    const res = await this.auth.authedFetch(
      `${BASE_URL}/hubs/${hubId}/local-services`,
    );

    if (!res.ok) {
      throw new Error(
        `Erreur lors de la récupération des thermostats: ${res.status}`,
      );
    }

    const services = (await res.json()) as LocalServicesResponse;
    return services.filter(s => s.type === 'thermostat');
  }

  async getDevices(): Promise<Device[]> {
    const res = await this.auth.authedFetch(`${BASE_URL}/devices`);

    if (!res.ok) {
      throw new Error(
        `Erreur lors de la récupération des devices: ${res.status}`,
      );
    }

    const devices = (await res.json()) as Device[];
    return devices;
  }

  /**
   * Récupère l'état d'un thermostat spécifique
   */
  async getThermostat(
    hubId: string,
    serviceId: number,
  ): Promise<ThermostatService> {
    const list = await this.getLocalServices(hubId);
    const thermostat = list.find(s => s._id === serviceId);

    if (!thermostat) {
      throw new Error(`Thermostat ${serviceId} introuvable dans hub ${hubId}`);
    }
    return thermostat;
  }

  /**
   * Met à jour un thermostat (PUT complet)
   */
  async updateThermostat(
    hubId: string,
    serviceId: number,
    thermostat: ThermostatService,
  ): Promise<ThermostatService> {
    const res = await this.auth.authedFetch(
      `${BASE_URL}/hubs/${hubId}/local-services/${serviceId}`,
      {
        method: 'PUT',
        body: JSON.stringify(thermostat),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Erreur lors de la mise à jour du thermostat ${serviceId}: ${res.status} - ${text}`,
      );
    }

    return res.json() as Promise<ThermostatService>;
  }

  /**
   * Change le mode de fonctionnement du thermostat
   */
  async setWorkingMode(
    hubId: string,
    serviceId: number,
    mode: WorkingMode,
  ): Promise<void> {
    this.log.debug(
      `Changement du mode du thermostat ${serviceId} vers ${mode}`,
    );

    const thermostat = await this.getThermostat(hubId, serviceId);
    thermostat.workingMode = mode;
    await this.updateThermostat(hubId, serviceId, thermostat);
  }

  /**
   * Change la température de consigne (comfortTemp)
   */
  async setTargetTemperature(
    hubId: string,
    serviceId: number,
    temperature: number,
  ): Promise<void> {
    this.log.debug(
      `Changement de la consigne du thermostat ${serviceId} vers ${temperature}°C`,
    );

    const thermostat = await this.getThermostat(hubId, serviceId);
    thermostat.comfortTemp = temperature;
    await this.updateThermostat(hubId, serviceId, thermostat);
  }

  /**
   * Active ou désactive un thermostat
   */
  async setActive(
    hubId: string,
    serviceId: number,
    active: boolean,
  ): Promise<void> {
    this.log.debug(
      `${active ? 'Activation' : 'Désactivation'} du thermostat ${serviceId}`,
    );

    const thermostat = await this.getThermostat(hubId, serviceId);

    thermostat.workingMode = active
      ? WorkingMode.CONFORT
      : WorkingMode.MANUAL_OFF;

    await this.updateThermostat(hubId, serviceId, thermostat);
  }

  /**
   * Helpers
   */

  getCurrentTemperature(thermostat: ThermostatService): number | null {
    return thermostat.sensors.temp;
  }

  isActive(thermostat: ThermostatService): boolean {
    return thermostat.workingMode !== WorkingMode.MANUAL_OFF;
  }
}
