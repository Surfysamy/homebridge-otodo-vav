// platform.ts
import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TokenStore } from './tokenStore';
import { AuthClient } from './auth';
import { OtodoClient } from './otodoClient';
import { ThermostatClient } from './thermostatClient';
import type { ThermostatService, Room, Hub, DeviceCapability } from './types';
import { ThermostatAccessory } from './thermostatAccessory';
import { OtodoModeSliderAccessory } from './otodoModeSliderAccessory';

export class OtodoVavPlatform implements DynamicPlatformPlugin {

  public readonly accessories: PlatformAccessory[] = [];

  private auth!: AuthClient;
  private client!: OtodoClient;
  private tClient!: ThermostatClient;

  /**
   * 🔥 NOUVEAU :
   * deviceId → ThermostatAccessory
   */
  private thermostatByDeviceId: Map<number, ThermostatAccessory> = new Map();

  private roomsById: Map<string, Room> = new Map();
  private hubsById: Map<string, Hub> = new Map();

  private readonly displayModeSliders!: boolean;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config || !config.email || !config.password) {
      this.log.error('❌ Configuration invalide : email et password requis');
      return;
    }

    this.displayModeSliders = this.config.displayModeSliders ?? false;

    this.log.info('🚀 Initialisation du plugin Otodo VAV');
    this.log.info(`   Mode sliders: ${this.displayModeSliders ? 'ON' : 'OFF'}`);

    this.api.on('didFinishLaunching', async () => {
      await this.initializePlugin();
    });
  }


  private async initializePlugin(): Promise<void> {
    const store = new TokenStore(this.api.user.storagePath());
    this.auth = new AuthClient(this.log, store, {
      email: String(this.config.email),
      password: String(this.config.password),
      parkname: String(this.config.parkname ?? 'vav'),
    });

    await this.auth.init();

    this.client = new OtodoClient(this.log, this.auth);
    this.tClient = new ThermostatClient(this.log, this.auth);

    await this.loadRooms();
    await this.loadHubs();

    this.hubsById.forEach(async hub => {
      await this.discoverDevices(hub._id);
    });

    await this.startDevicesPolling();
  }

  private async loadRooms(): Promise<void> {
    try {
      const rooms = await this.tClient.getRooms();
      this.roomsById = new Map(rooms.map(r => [r._id, r]));
    } catch (e) {
      this.log.warn('⚠️ Impossible de récupérer les rooms : ' + String(e));
    }
  }

  private async loadHubs(): Promise<void> {
    try {
      const hubs = await this.tClient.getHubs();
      this.hubsById = new Map(hubs.map(r => [r._id, r]));
    } catch (e) {
      this.log.warn('⚠️ Impossible de récupérer les hubs : ' + String(e));
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }


  /**
   * 🔥 THERMOSTAT UNIQUEMENT
   * ET enregistrement deviceId → ThermostatAccessory
   */
  private upsertThermostat(t: ThermostatService): void {
    const uuid = this.api.hap.uuid.generate(`thermo:${t.hubId}:${t._id}`);
    const uuidSlider = this.api.hap.uuid.generate(`slider:${t.hubId}:${t._id}`);

    const roomName = this.roomsById.get(t.roomId)?.name;
    const thermoName = roomName ? `Thermostat ${roomName}` : `Thermostat ${t._id}`;
    const sliderName = roomName ? `Mode ${roomName}` : `Mode ${t._id}`;

    // --- THERMOSTAT ---
    let acc = this.accessories.find(a => a.UUID === uuid);

    if (acc) {
      this.log.info(`♻️ Restauration thermostat: ${thermoName}`);
    } else {
      acc = new this.api.platformAccessory(thermoName, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
      this.accessories.push(acc);
    }

    const thermoCtrl = new ThermostatAccessory(this, acc, t, this.tClient);

    // 🔥 ENREGISTREMENT deviceId → thermostat
    const deviceId = t.modules?.[0]?.deviceId;
    if (deviceId) {
      this.thermostatByDeviceId.set(deviceId, thermoCtrl);
      acc.context.deviceId = deviceId;
    }

    // --- MODE SLIDER ---
    let accSlider = this.accessories.find(a => a.UUID === uuidSlider);

    if (this.displayModeSliders) {
      if (!accSlider) {
        accSlider = new this.api.platformAccessory(sliderName, uuidSlider);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accSlider,
        ]);
        this.accessories.push(accSlider);
      }
      new OtodoModeSliderAccessory(this, accSlider, t, this.tClient);
    } else if (accSlider) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accSlider,
      ]);
      this.accessories.splice(this.accessories.indexOf(accSlider), 1);
    }
  }

  private async discoverDevices(hubId: string): Promise<void> {
    const thermostats = await this.tClient.getAllThermostats(hubId);
    for (const t of thermostats) {
      this.upsertThermostat(t);
    }
  }

  // 🔥 Poller TRV → mise à jour du thermostat associé
  private async startDevicesPolling(): Promise<void> {
    await this.refreshDevicesOnce();
    setInterval(async () => await this.refreshDevicesOnce(), 30000);
  }

  private async refreshDevicesOnce(): Promise<void> {
    try {
      const devices = await this.tClient.getDevices();

      for (const dev of devices) {
        const endpoint = dev.endpoints?.[0];
        if (!endpoint) {
          continue;
        }

        const tempCap = endpoint.capabilities?.find((c: DeviceCapability) => c._id === 4);
        if (!tempCap) {
          continue;
        }

        const kelvinX10 = tempCap.value;
        const celsius = Number(((kelvinX10 - 2731) / 10).toFixed(1));

        // Trouver le ThermostatAccessory correspondant
        const ctrl = this.thermostatByDeviceId.get(dev._id);
        if (!ctrl) {
          continue;
        }

        ctrl.updateCurrentTemperature(celsius);
      }
    } catch (e) {
      this.log.warn(`⚠️ Erreur polling /devices : ${e}`);
    }
  }
}
