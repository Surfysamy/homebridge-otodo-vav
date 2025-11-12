import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { OtodoVavPlatform } from './platform';
import { OtodoClient } from './otodoClient';

interface ThermostatState {
  Active: 0 | 1;
  CurrentTemperature: number;
  TargetTemperature: number;
  CurrentHeaterCoolerState: number;
  TargetHeaterCoolerState: number;
}

export class ThermostatAccessory {
  private service: Service;
  private state: ThermostatState = {
    Active: 0,
    CurrentTemperature: 20.0,
    TargetTemperature: 21.0,
    CurrentHeaterCoolerState: 0, // INACTIVE
    TargetHeaterCoolerState: 1,  // HEAT
  };

  constructor(
    private readonly platform: OtodoVavPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: { name: string; id: string },
    private readonly client: OtodoClient,
  ) {
    const { Service, Characteristic } = this.platform.api.hap;

    // Configuration des informations de l'accessoire
    const infoService = this.accessory.getService(Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(Characteristic.Manufacturer, 'Otodo')
        .setCharacteristic(Characteristic.Model, 'VAV Thermostat')
        .setCharacteristic(Characteristic.SerialNumber, this.device.id);
    }

    // Utilisation du service HeaterCooler (plus moderne que Thermostat)
    this.service = this.accessory.getService(Service.HeaterCooler)
      || this.accessory.addService(Service.HeaterCooler, this.device.name);

    // Caractéristique Active (On/Off)
    this.service
      .getCharacteristic(Characteristic.Active)
      .onGet(this.handleGetActive.bind(this))
      .onSet(this.handleSetActive.bind(this));

    // État actuel du système (lecture seule)
    this.service
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleGetCurrentState.bind(this));

    // Mode cible (AUTO/HEAT/COOL)
    this.service
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleGetTargetState.bind(this))
      .onSet(this.handleSetTargetState.bind(this));

    // Température actuelle (lecture seule)
    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleGetCurrentTemperature.bind(this));

    // Température de consigne pour le chauffage
    this.service
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 5,
        maxValue: 30,
        minStep: 0.5,
      })
      .onGet(this.handleGetTargetTemperature.bind(this))
      .onSet(this.handleSetTargetTemperature.bind(this));

    // Synchronisation initiale
    this.refreshFromCloud().catch(err => {
      this.platform.log.error('Échec de la synchronisation initiale:', err);
    });
  }

  /**
   * Récupère l'état depuis le cloud
   */
  private async refreshFromCloud(): Promise<void> {
    try {
      this.platform.log.debug(`Rafraîchissement de l'état de ${this.device.name}...`);
      
      // TODO: Appel API pour récupérer l'état
      // const state = await this.client.getJson<ThermostatStateResponse>(
      //   `https://api.gateway.otodo.io/devices/${this.device.id}/state`
      // );
      // 
      // this.state.Active = state.isOn ? 1 : 0;
      // this.state.CurrentTemperature = state.currentTemp;
      // this.state.TargetTemperature = state.targetTemp;
      // this.state.CurrentHeaterCoolerState = this.mapApiStateToHomeKit(state.mode);
      // this.state.TargetHeaterCoolerState = this.mapApiModeToHomeKit(state.targetMode);
      //
      // this.updateCharacteristics();
      
    } catch (error) {
      this.platform.log.error(`Erreur lors du rafraîchissement de ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Met à jour toutes les caractéristiques HomeKit
   */
  private updateCharacteristics(): void {
    const { Characteristic } = this.platform.api.hap;

    this.service.updateCharacteristic(Characteristic.Active, this.state.Active);
    this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, this.state.CurrentHeaterCoolerState);
    this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, this.state.TargetHeaterCoolerState);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.state.CurrentTemperature);
    this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.state.TargetTemperature);
  }

  // ===== HANDLERS GET =====

  private async handleGetActive(): Promise<CharacteristicValue> {
    this.platform.log.debug(`GET Active → ${this.state.Active}`);
    return this.state.Active;
  }

  private async handleGetCurrentState(): Promise<CharacteristicValue> {
    this.platform.log.debug(`GET CurrentHeaterCoolerState → ${this.state.CurrentHeaterCoolerState}`);
    return this.state.CurrentHeaterCoolerState;
  }

  private async handleGetTargetState(): Promise<CharacteristicValue> {
    this.platform.log.debug(`GET TargetHeaterCoolerState → ${this.state.TargetHeaterCoolerState}`);
    return this.state.TargetHeaterCoolerState;
  }

  private async handleGetCurrentTemperature(): Promise<CharacteristicValue> {
    this.platform.log.debug(`GET CurrentTemperature → ${this.state.CurrentTemperature}°C`);
    return this.state.CurrentTemperature;
  }

  private async handleGetTargetTemperature(): Promise<CharacteristicValue> {
    this.platform.log.debug(`GET TargetTemperature → ${this.state.TargetTemperature}°C`);
    return this.state.TargetTemperature;
  }

  // ===== HANDLERS SET =====

  private async handleSetActive(value: CharacteristicValue): Promise<void> {
    const active = value as 0 | 1;
    
    if (this.state.Active === active) {
      return; // Pas de changement
    }

    this.platform.log.info(`${this.device.name}: ${active ? 'ON' : 'OFF'}`);

    try {
      // TODO: Appel API
      // await this.client.postJson(
      //   `https://api.gateway.otodo.io/devices/${this.device.id}/power`,
      //   { active: active === 1 }
      // );

      this.state.Active = active;
      
      // Mise à jour de l'état actuel en conséquence
      if (active === 0) {
        this.state.CurrentHeaterCoolerState = 0; // INACTIVE
        this.service.updateCharacteristic(
          this.platform.api.hap.Characteristic.CurrentHeaterCoolerState,
          0,
        );
      }
    } catch (error) {
      this.platform.log.error(`Erreur lors du changement d'état de ${this.device.name}:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleSetTargetState(value: CharacteristicValue): Promise<void> {
    const targetState = value as number;
    // 0 = AUTO, 1 = HEAT, 2 = COOL
    
    if (this.state.TargetHeaterCoolerState === targetState) {
      return;
    }

    const modes = ['AUTO', 'HEAT', 'COOL'];
    this.platform.log.info(`${this.device.name}: Mode → ${modes[targetState]}`);

    try {
      // TODO: Appel API
      // await this.client.postJson(
      //   `https://api.gateway.otodo.io/devices/${this.device.id}/mode`,
      //   { mode: this.mapHomeKitModeToApi(targetState) }
      // );

      this.state.TargetHeaterCoolerState = targetState;
    } catch (error) {
      this.platform.log.error(`Erreur lors du changement de mode de ${this.device.name}:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleSetTargetTemperature(value: CharacteristicValue): Promise<void> {
    const temp = Number(value);
    
    if (this.state.TargetTemperature === temp) {
      return;
    }

    this.platform.log.info(`${this.device.name}: Consigne → ${temp}°C`);

    try {
      // TODO: Appel API
      // await this.client.postJson(
      //   `https://api.gateway.otodo.io/devices/${this.device.id}/temperature`,
      //   { target: temp }
      // );

      this.state.TargetTemperature = temp;
    } catch (error) {
      this.platform.log.error(`Erreur lors du changement de consigne de ${this.device.name}:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // ===== HELPERS DE MAPPING (à adapter selon l'API Otodo) =====

  private mapApiStateToHomeKit(apiState: string): number {
    // Exemple de mapping API → HomeKit CurrentHeaterCoolerState
    // 0: INACTIVE, 1: IDLE, 2: HEATING, 3: COOLING
    switch (apiState.toLowerCase()) {
    case 'off':
        return 0; // INACTIVE
    case 'idle':
        return 1; // IDLE
    case 'heating':
        return 2; // HEATING
    case 'cooling':
        return 3; // COOLING
    default:
        return 0;
    }
  }

  private mapApiModeToHomeKit(apiMode: string): number {
    // Exemple de mapping API → HomeKit TargetHeaterCoolerState
    // 0: AUTO, 1: HEAT, 2: COOL
    switch (apiMode.toLowerCase()) {
    case 'auto':
        return 0;
    case 'heat':
        return 1;
    case 'cool':
        return 2;
    default:
        return 1;
    }
  }

  private mapHomeKitModeToApi(homeKitMode: number): string {
    // Exemple de mapping HomeKit → API
    switch (homeKitMode) {
    case 0:
        return 'auto';
        case 1:
    return 'heat';
    case 2:
        return 'cool';
    default:
        return 'heat';
    }
  }
}