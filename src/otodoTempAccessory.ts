import type { PlatformAccessory, Service } from 'homebridge';
import { OtodoVavPlatform } from './platform';
import type { ThermostatService } from './types';

export class OtodoTempSensorAccessory {
  private service: Service;
  private currentTemp = 20; // fallback
  public readonly deviceId: number;

  constructor(
    private readonly platform: OtodoVavPlatform,
    private readonly accessory: PlatformAccessory,
    thermostat: ThermostatService,
  ) {
    this.deviceId = thermostat.modules[0].deviceId;

    const { Service, Characteristic } = this.platform.api.hap;

    // Info
    const info =
      this.accessory.getService(Service.AccessoryInformation) ??
      this.accessory.addService(Service.AccessoryInformation);

    info
      .setCharacteristic(Characteristic.Manufacturer, 'Otodo')
      .setCharacteristic(Characteristic.Model, 'VAV Temperature Sensor')
      .setCharacteristic(
        Characteristic.SerialNumber,
        `TEMP-${thermostat.hubId}-${this.deviceId}`,
      );

    // Sensor
    this.service =
      this.accessory.getService(Service.TemperatureSensor) ??
      this.accessory.addService(Service.TemperatureSensor);

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({ minValue: -20, maxValue: 50, minStep: 0.1 })
      .onGet(() => this.currentTemp);
  }

  /**
   * Appelé par le poller global
   */
  public updateTemperature(tempCelsius: number) {
    this.currentTemp = tempCelsius;

    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.CurrentTemperature,
      this.currentTemp,
    );

    this.platform.log.debug(
      `[${this.accessory.displayName}] Température mise à jour: ${this.currentTemp}°C`,
    );
  }
}
