import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { OtodoVavPlatform } from './platform';
import type { ThermostatService } from './types';
import { WorkingMode } from './types';
import { ThermostatClient } from './thermostatClient';

export class OtodoModeSliderAccessory {
  private service: Service;
  private brightness = 0; // 0–100 en fonction du mode
  private readonly hubId: string;
  private readonly serviceId: number;
  private readonly modeSteps = [
    { mode: WorkingMode.AUTO, percent: 0 },
    { mode: WorkingMode.CONFORT, percent: 20 },
    { mode: WorkingMode.MINUS_1, percent: 40 },
    { mode: WorkingMode.MINUS_2, percent: 60 },
    { mode: WorkingMode.ECO, percent: 80 },
    { mode: WorkingMode.ANTIFREEZE, percent: 100 },
  ];

  constructor(
    private readonly platform: OtodoVavPlatform,
    private readonly accessory: PlatformAccessory,
    thermostat: ThermostatService,
    private readonly client: ThermostatClient,
  ) {
    this.hubId = thermostat.hubId;
    this.serviceId = thermostat._id;

    const initialPercent = this.modeToPercent(thermostat.workingMode);
    this.brightness = initialPercent;

    const { Service, Characteristic } = this.platform.api.hap;

    // Info
    const info =
      this.accessory.getService(Service.AccessoryInformation) ??
      this.accessory.addService(Service.AccessoryInformation);

    info
      .setCharacteristic(Characteristic.Manufacturer, 'Otodo')
      .setCharacteristic(Characteristic.Model, 'VAV Mode Slider')
      .setCharacteristic(
        Characteristic.SerialNumber,
        `MODE-SLIDER-${this.hubId}-${this.serviceId}`,
      );

    // Lightbulb (pour UI slider)
    this.service =
      this.accessory.getService(Service.Lightbulb) ??
      this.accessory.addService(Service.Lightbulb);

    // On = mode non OFF
    this.service
      .getCharacteristic(Characteristic.On)
      .onGet(() => this.brightness > 0)
      .onSet(value => this.handleSetOn(value));

    // Slider Brightness pour le choix du mode
    this.service
      .getCharacteristic(Characteristic.Brightness)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      })
      .onGet(() => this.brightness)
      .onSet(value => this.handleSetBrightness(value));

    // Sync initiale
    this.refreshFromCloud().catch(() => {});
  }

  // ----------- SYNC --------------

  private async refreshFromCloud(): Promise<void> {
    const t = await this.client.getThermostat(this.hubId, this.serviceId);
    this.brightness = this.modeToPercent(t.workingMode);
    this.updateUI();
  }

  private updateUI() {
    const { Characteristic } = this.platform.api.hap;
    this.service.updateCharacteristic(Characteristic.On, this.brightness > 0);
    this.service.updateCharacteristic(
      Characteristic.Brightness,
      this.brightness,
    );
  }

  // ----------- HANDLERS --------------

  private async handleSetOn(value: CharacteristicValue): Promise<void> {
    // On ignore On/Off → le mode est défini par Brightness
    // MAIS si user met OFF → mode = AUTO (0%)
    if (value === false) {
      await this.handleSetBrightness(0);
    } else {
      // Si ON → revenir au dernier mode
      if (this.brightness === 0) {
        await this.handleSetBrightness(20); // Mode Confort par défaut
      }
    }
  }

  private async handleSetBrightness(value: CharacteristicValue): Promise<void> {
    const rawPercent = Number(value);

    // Trouver le mode le plus proche
    const closest = this.closestMode(rawPercent);

    this.platform.log.info(
      `[${this.accessory.displayName}] Slider → ${rawPercent}%, arrondi → ${
        closest.percent
      }% (${WorkingMode[closest.mode]})`,
    );

    this.brightness = closest.percent;
    this.updateUI();

    try {
      await this.client.setWorkingMode(
        this.hubId,
        this.serviceId,
        closest.mode,
      );
    } catch (e) {
      this.platform.log.error(
        `❌ Erreur lors du changement de mode ${WorkingMode[closest.mode]}`,
        e,
      );
    }
  }

  // ----------- HELPERS --------------

  private closestMode(value: number) {
    return this.modeSteps.reduce((prev, curr) =>
      Math.abs(curr.percent - value) < Math.abs(prev.percent - value)
        ? curr
        : prev,
    );
  }

  private modeToPercent(mode: WorkingMode): number {
    const found = this.modeSteps.find(m => m.mode === mode);
    return found ? found.percent : 0;
  }
}
