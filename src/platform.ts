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
import { OtodoTempSensorAccessory } from './otodoTempAccessory';

export class OtodoVavPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];

  private auth!: AuthClient;
  private client!: OtodoClient;
  private tClient!: ThermostatClient;
  private tempSensors: Map<number, OtodoTempSensorAccessory> = new Map();

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

    // 🔥 AJOUT — récupération de l'option, default false
    this.displayModeSliders = this.config.displayModeSliders ?? false;

    if (config.debug === true) {
      this.log.debug('🔍 Mode debug activé');
    }

    this.log.info('🚀 Initialisation du plugin Otodo VAV');
    this.log.info(`   Mode sliders: ${this.displayModeSliders ? 'ON' : 'OFF'}`);

    this.api.on('didFinishLaunching', async () => {
      try {
        await this.initializePlugin();
      } catch (error) {
        this.log.error("❌ Échec de l'initialisation du plugin:", error);
      }
    });
  }

  private async initializePlugin(): Promise<void> {
    this.log.debug('📦 Création du TokenStore...');
    const store = new TokenStore(this.api.user.storagePath());

    this.log.debug("🔐 Initialisation de l'authentification...");
    this.auth = new AuthClient(this.log, store, {
      email: String(this.config.email),
      password: String(this.config.password),
      parkname: String(this.config.parkname ?? 'vav'),
    });

    await this.auth.init();

    this.log.debug('🌐 Création des clients API...');
    this.client = new OtodoClient(this.log, this.auth);
    this.tClient = new ThermostatClient(this.log, this.auth);

    this.log.info('✅ Plugin initialisé');
    if (this.auth.homeId) {
      this.log.info(`   HomeId: ${this.auth.homeId}`);
    }
    if (this.auth.userId) {
      this.log.info(`   UserId: ${this.auth.userId}`);
    }
    if (this.auth.parkId) {
      this.log.info(`   ParkId: ${this.auth.parkId}`);
    }

    await this.loadRooms();
    await this.loadHubs();

    this.hubsById.forEach(async hub => {
      await this.discoverDevices(hub._id);
    });

    await this.startDevicesPolling();
  }

  private async loadRooms(): Promise<void> {
    try {
      this.log.debug('📂 Récupération des rooms...');
      const rooms = await this.tClient.getRooms();
      this.roomsById = new Map(rooms.map(r => [r._id, r]));
      this.log.debug(`📂 ${rooms.length} rooms chargées`);
    } catch (e) {
      this.log.warn(
        '⚠️ Impossible de récupérer les rooms (optionnel) : ' + String(e),
      );
    }
  }

  private async loadHubs(): Promise<void> {
    try {
      this.log.debug('📂 Récupération des hubs...');
      const hubs = await this.tClient.getHubs();
      this.hubsById = new Map(hubs.map(r => [r._id, r]));
      this.log.debug(`📂 ${hubs.length} hubs chargés`);
    } catch (e) {
      this.log.warn('⚠️ Impossible de récupérer les hubs : ' + String(e));
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug("🔄 Restauration de l'accessoire:", accessory.displayName);
    this.accessories.push(accessory);
  }

  private upsertThermostat(t: ThermostatService): void {
    const uuidThermo = this.api.hap.uuid.generate(`thermo:${t.hubId}:${t._id}`);
    const uuidSlider = this.api.hap.uuid.generate(`slider:${t.hubId}:${t._id}`);
    const uuidTemp = this.api.hap.uuid.generate(`temp:${t.hubId}:${t._id}`);

    const roomName = this.roomsById.get(t.roomId)?.name;
    const thermoName = roomName
      ? `Thermostat ${roomName}`
      : `Thermostat ${t._id}`;
    const sliderName = roomName ? `Mode ${roomName}` : `Mode ${t._id}`;

    // ========== THERMOSTAT ACCESSORY ==========
    const existingThermo = this.accessories.find(a => a.UUID === uuidThermo);
    if (existingThermo) {
      new ThermostatAccessory(this, existingThermo, t, this.tClient);
    } else {
      const acc = new this.api.platformAccessory(thermoName, uuidThermo);
      new ThermostatAccessory(this, acc, t, this.tClient);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
      this.accessories.push(acc);
    }

    // ========== MODE SLIDER ACCESSORY ==========
    const existingSlider = this.accessories.find(a => a.UUID === uuidSlider);

    if (this.displayModeSliders) {
      // Création / restauration
      if (existingSlider) {
        this.log.info(`♻️ Restauration du mode slider: ${sliderName}`);
        new OtodoModeSliderAccessory(this, existingSlider, t, this.tClient);
      } else {
        this.log.info(`➕ Ajout du mode slider: ${sliderName}`);
        const acc = new this.api.platformAccessory(sliderName, uuidSlider);
        new OtodoModeSliderAccessory(this, acc, t, this.tClient);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
        this.accessories.push(acc);
      }
    } else {
      // 🔥 SUPPRESSION AUTOMATIQUE SI désactivé
      if (existingSlider) {
        this.log.info(`🗑️ Suppression du mode slider désactivé: ${sliderName}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          existingSlider,
        ]);
        this.accessories.splice(this.accessories.indexOf(existingSlider), 1);
      }
    }

    // ========= TEMP SENSOR ACCESSORY =========
    const tempName = roomName
      ? `Température ${roomName}`
      : `Température ${t._id}`;
    const existingTemp = this.accessories.find(a => a.UUID === uuidTemp);

    let tempAccessory: OtodoTempSensorAccessory;

    if (existingTemp) {
      tempAccessory = new OtodoTempSensorAccessory(this, existingTemp, t);
    } else {
      const acc = new this.api.platformAccessory(tempName, uuidTemp);
      tempAccessory = new OtodoTempSensorAccessory(this, acc, t);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
      this.accessories.push(acc);
    }

    // Stockage (deviceId → sensorInstance)
    this.tempSensors.set(tempAccessory.deviceId, tempAccessory);
  }

  private async discoverDevices(hubId: string): Promise<void> {
    this.log.info('🔍 Recherche des thermostats Otodo VAV...');
    try {
      const thermostats = await this.tClient.getAllThermostats(hubId);
      this.log.info(`   ${thermostats.length} thermostat(s) trouvé(s)`);

      for (const t of thermostats) {
        this.upsertThermostat(t);
      }
    } catch (e) {
      this.log.error(
        '❌ Erreur lors de la découverte des thermostats : ' + String(e),
      );
    }
  }

  private async startDevicesPolling(): Promise<void> {
    this.log.info('📡 Mise en place du poller global /devices');

    // Premier polling immédiat
    await this.refreshDevicesOnce();

    // Polling périodique
    setInterval(async () => {
      await this.refreshDevicesOnce();
    }, 30000);
  }

  /**
   * Fonction interne : récupère /devices et met à jour les capteurs
   */
  private async refreshDevicesOnce(): Promise<void> {
    try {
      const devices = await this.tClient.getDevices();

      for (const dev of devices) {
        const endpoint = dev.endpoints?.[0];
        if (!endpoint) {
          continue;
        }

        const tempCap = endpoint.capabilities?.find(
          (c: DeviceCapability) => c._id === 4,
        );
        if (!tempCap) {
          continue;
        }

        const deviceId = dev._id;
        const sensor = this.tempSensors.get(deviceId);
        if (!sensor) {
          continue;
        }

        const kelvinX10 = tempCap.value;
        const celsius = Number(((kelvinX10 - 2731) / 10).toFixed(1));

        sensor.updateTemperature(celsius);
      }
    } catch (err) {
      this.log.warn(`⚠️ Poller devices: ${String(err)}`);
    }
  }
}
