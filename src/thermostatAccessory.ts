import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { OtodoVavPlatform } from './platform';
import type { ThermostatService } from './types';
import { WorkingMode } from './types';
import { ThermostatClient } from './thermostatClient';

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
    TargetHeaterCoolerState: 1, // HEAT
  };

  // On garde la dernière version connue du thermostat côté cloud
  private snapshot: ThermostatService;

  constructor(
    private readonly platform: OtodoVavPlatform,
    private readonly accessory: PlatformAccessory,
    thermostat: ThermostatService,
    private readonly client: ThermostatClient,
  ) {
    this.snapshot = thermostat;

    const { Service, Characteristic } = this.platform.api.hap;

    const infoService =
      this.accessory.getService(Service.AccessoryInformation) ||
      this.accessory.addService(Service.AccessoryInformation);

    infoService
      .setCharacteristic(Characteristic.Manufacturer, 'Otodo')
      .setCharacteristic(Characteristic.Model, 'VAV Thermostat')
      .setCharacteristic(
        Characteristic.SerialNumber,
        `${thermostat.hubId}-${thermostat._id}`,
      );

    this.service =
      this.accessory.getService(Service.HeaterCooler) ||
      this.accessory.addService(
        Service.HeaterCooler,
        this.accessory.displayName,
      );

    // Active (on/off)
    this.service
      .getCharacteristic(Characteristic.Active)
      .onGet(this.handleGetActive.bind(this))
      .onSet(this.handleSetActive.bind(this));

    // État actuel
    this.service
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleGetCurrentState.bind(this));

    // Mode cible (on ne gère que HEAT pour l’instant)
    this.service
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [Characteristic.TargetHeaterCoolerState.HEAT],
      })
      .onGet(this.handleGetTargetState.bind(this))
      .onSet(this.handleSetTargetState.bind(this));

    // --- Température actuelle ---
    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({ minValue: -50, maxValue: 100 })
      .onGet(() => this.state.CurrentTemperature);

    // Température de consigne (chauffage)
    this.service
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 5,
        maxValue: 30,
        minStep: 0.5,
      })
      .onGet(this.handleGetTargetTemperature.bind(this))
      .onSet(this.handleSetTargetTemperature.bind(this));

    // Sync initiale
    this.refreshFromCloud().catch(err => {
      this.platform.log.error(
        `Échec de la synchronisation initiale de ${this.accessory.displayName}:`,
        err,
      );
    });
  }

  // ====== SYNC CLOUD ======

  private async refreshFromCloud(): Promise<void> {
    try {
      const t = await this.client.getThermostat(
        this.snapshot.hubId,
        this.snapshot._id,
      );
      this.snapshot = t;

      const active = this.client.isActive(t);

      this.state.Active = active ? 1 : 0;
      this.state.CurrentTemperature = this.client.getCurrentTemperature(t) ?? 0;
      this.state.TargetTemperature = t.comfortTemp;
      this.state.TargetHeaterCoolerState = this.mapWorkingModeToHomeKit(
        t.workingMode,
      );
      this.state.CurrentHeaterCoolerState = active ? 2 : 0; // 2 = HEATING, 0 = INACTIVE

      this.updateCharacteristics();
    } catch (error) {
      this.platform.log.error(
        `Erreur lors du rafraîchissement de ${this.accessory.displayName}:`,
        error,
      );
    }
  }

  private updateCharacteristics(): void {
    const { Characteristic } = this.platform.api.hap;

    this.service.updateCharacteristic(Characteristic.Active, this.state.Active);
    this.service.updateCharacteristic(
      Characteristic.CurrentHeaterCoolerState,
      this.state.CurrentHeaterCoolerState,
    );
    this.service.updateCharacteristic(
      Characteristic.TargetHeaterCoolerState,
      this.state.TargetHeaterCoolerState,
    );
    this.service.updateCharacteristic(
      Characteristic.CurrentTemperature,
      this.state.CurrentTemperature,
    );
    this.service.updateCharacteristic(
      Characteristic.HeatingThresholdTemperature,
      this.state.TargetTemperature,
    );
  }

  // ====== GET ======

  private async handleGetActive(): Promise<CharacteristicValue> {
    // On lance une sync en arrière-plan
    this.refreshFromCloud().catch(() => undefined);
    this.platform.log.debug(
      `${this.accessory.displayName} GET Active → ${this.state.Active}`,
    );
    return this.state.Active;
  }

  private async handleGetCurrentState(): Promise<CharacteristicValue> {
    this.refreshFromCloud().catch(() => undefined);
    this.platform.log.debug(
      `${this.accessory.displayName} GET CurrentHeaterCoolerState → ${this.state.CurrentHeaterCoolerState}`,
    );
    return this.state.CurrentHeaterCoolerState;
  }

  private async handleGetTargetState(): Promise<CharacteristicValue> {
    this.refreshFromCloud().catch(() => undefined);
    this.platform.log.debug(
      `${this.accessory.displayName} GET TargetHeaterCoolerState → ${this.state.TargetHeaterCoolerState}`,
    );
    return this.state.TargetHeaterCoolerState;
  }

  private async handleGetCurrentTemperature(): Promise<CharacteristicValue> {
    this.refreshFromCloud().catch(() => undefined);
    this.platform.log.debug(
      `${this.accessory.displayName} GET CurrentTemperature → ${this.state.CurrentTemperature}°C`,
    );
    return this.state.CurrentTemperature;
  }

  private async handleGetTargetTemperature(): Promise<CharacteristicValue> {
    this.refreshFromCloud().catch(() => undefined);
    this.platform.log.debug(
      `${this.accessory.displayName} GET TargetTemperature → ${this.state.TargetTemperature}°C`,
    );
    return this.state.TargetTemperature;
  }

  // ====== SET ======

  private async handleSetActive(value: CharacteristicValue): Promise<void> {
    const active = value as 0 | 1;
    if (this.state.Active === active) {
      return;
    }

    this.platform.log.info(
      `${this.accessory.displayName}: ${active ? 'ON' : 'OFF'}`,
    );

    try {
      await this.client.setActive(
        this.snapshot.hubId,
        this.snapshot._id,
        active === 1,
      );

      this.state.Active = active;
      this.state.CurrentHeaterCoolerState = active ? 2 : 0;
      this.updateCharacteristics();
    } catch (error) {
      this.platform.log.error(
        `Erreur lors du changement d'état de ${this.accessory.displayName}:`,
        error,
      );
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async handleSetTargetState(
    value: CharacteristicValue,
  ): Promise<void> {
    const targetState = value as number;
    this.platform.log.info(
      `${this.accessory.displayName}: TargetHeaterCoolerState → ${targetState}`,
    );

    // On ne gère que HEAT pour l’instant → mapping vers CONFORT
    const mode = this.mapHomeKitModeToWorkingMode(targetState);

    try {
      await this.client.setWorkingMode(
        this.snapshot.hubId,
        this.snapshot._id,
        mode,
      );

      this.state.TargetHeaterCoolerState = targetState;
      this.updateCharacteristics();
    } catch (error) {
      this.platform.log.error(
        `Erreur lors du changement de mode de ${this.accessory.displayName}:`,
        error,
      );
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async handleSetTargetTemperature(
    value: CharacteristicValue,
  ): Promise<void> {
    const temp = Number(value);

    if (this.state.TargetTemperature === temp) {
      return;
    }

    this.platform.log.info(
      `${this.accessory.displayName}: Consigne → ${temp}°C`,
    );

    try {
      await this.client.setTargetTemperature(
        this.snapshot.hubId,
        this.snapshot._id,
        temp,
      );

      this.state.TargetTemperature = temp;
      this.updateCharacteristics();
    } catch (error) {
      this.platform.log.error(
        `Erreur lors du changement de consigne de ${this.accessory.displayName}:`,
        error,
      );
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  public updateCurrentTemperature(value: number): void {
    this.state.CurrentTemperature = value;

    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.CurrentTemperature,
      value,
    );

    this.platform.log.debug(
      `${this.accessory.displayName}: Température mise à jour → ${value}°C`,
    );
  }

  // ====== MAPPINGS ======

  private mapWorkingModeToHomeKit(workingMode: number): number {
    const { TargetHeaterCoolerState } = this.platform.api.hap.Characteristic;

    switch (workingMode) {
      case WorkingMode.CONFORT:
      case WorkingMode.ECO:
      case WorkingMode.ANTIFREEZE:
        return TargetHeaterCoolerState.HEAT;
      case WorkingMode.MANUAL_OFF:
      default:
        return TargetHeaterCoolerState.HEAT; // mais Active = 0
    }
  }

  private mapHomeKitModeToWorkingMode(homeKitMode: number): WorkingMode {
    // Pour l’instant on ne gère que HEAT → CONFORT
    switch (homeKitMode) {
      default:
        return WorkingMode.CONFORT;
    }
  }
}
