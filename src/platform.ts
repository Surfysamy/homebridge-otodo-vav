import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DEFAULT_CONFIG,
  OtodoVavConfig,
} from './settings';
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

  private readonly displayModeSliders: boolean;
  private readonly pollIntervalMs: number;
  private readonly isConfigValid: boolean;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Validate configuration first
    this.isConfigValid = this.validateConfig();

    if (!this.isConfigValid) {
      this.displayModeSliders = false;
      this.pollIntervalMs = DEFAULT_CONFIG.pollIntervalSec * 1000;
      return;
    }

    // Apply defaults and validate optional settings
    this.displayModeSliders = this.getConfigBoolean(
      'displayModeSliders',
      DEFAULT_CONFIG.displayModeSliders,
    );
    this.pollIntervalMs = this.getValidatedPollInterval();

    // Log configuration summary
    this.logConfigurationSummary();

    this.api.on('didFinishLaunching', async () => {
      try {
        await this.initializePlugin();
      } catch (error) {
        this.log.error("❌ Échec de l'initialisation du plugin:", error);
        if (error instanceof Error) {
          this.log.error(`   Détail: ${error.message}`);
        }
      }
    });
  }

  /**
   * Validates required configuration and logs helpful error messages
   */
  private validateConfig(): boolean {
    const cfg = this.config as OtodoVavConfig;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!cfg) {
      this.log.error('❌ Configuration manquante pour le plugin Otodo VAV');
      this.log.error(
        "   Veuillez configurer le plugin via l'interface Homebridge Config UI",
      );
      return false;
    }

    if (
      !cfg.email ||
      typeof cfg.email !== 'string' ||
      cfg.email.trim() === ''
    ) {
      errors.push("email: Adresse email requise pour l'authentification Otodo");
    } else if (!this.isValidEmail(cfg.email)) {
      warnings.push(
        `email: "${cfg.email}" ne semble pas être une adresse email valide`,
      );
    }

    if (
      !cfg.password ||
      typeof cfg.password !== 'string' ||
      cfg.password.trim() === ''
    ) {
      errors.push(
        "password: Mot de passe requis pour l'authentification Otodo",
      );
    } else if (cfg.password.length < 4) {
      warnings.push('password: Le mot de passe semble très court');
    }

    // Validate optional fields with warnings
    if (cfg.parkname !== undefined && typeof cfg.parkname !== 'string') {
      warnings.push(
        `parkname: Valeur invalide, utilisation de la valeur par défaut "${DEFAULT_CONFIG.parkname}"`,
      );
    }

    if (cfg.pollIntervalSec !== undefined) {
      if (
        typeof cfg.pollIntervalSec !== 'number' ||
        isNaN(cfg.pollIntervalSec)
      ) {
        warnings.push(
          `pollIntervalSec: Valeur invalide, utilisation de la valeur par défaut ${DEFAULT_CONFIG.pollIntervalSec}s`,
        );
      } else if (cfg.pollIntervalSec < DEFAULT_CONFIG.minPollInterval) {
        warnings.push(
          `pollIntervalSec: ${cfg.pollIntervalSec}s est trop bas, minimum ${DEFAULT_CONFIG.minPollInterval}s`,
        );
      } else if (cfg.pollIntervalSec > DEFAULT_CONFIG.maxPollInterval) {
        warnings.push(
          `pollIntervalSec: ${cfg.pollIntervalSec}s est très élevé, maximum recommandé ${DEFAULT_CONFIG.maxPollInterval}s`,
        );
      }
    }

    // Log all errors
    if (errors.length > 0) {
      this.log.error('❌ Configuration invalide - champs requis manquants:');
      errors.forEach(err => this.log.error(`   • ${err}`));
      this.log.error('');
      this.log.error('💡 Configuration requise dans config.json:');
      this.log.error('   {');
      this.log.error('     "platform": "OtodoVavPlatform",');
      this.log.error('     "email": "votre@email.com",');
      this.log.error('     "password": "votre_mot_de_passe"');
      this.log.error('   }');
      return false;
    }

    // Log all warnings
    if (warnings.length > 0) {
      this.log.warn('⚠️ Avertissements de configuration:');
      warnings.forEach(warn => this.log.warn(`   • ${warn}`));
    }

    return true;
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Get boolean config value with default
   */
  private getConfigBoolean(key: string, defaultValue: boolean): boolean {
    const value = this.config[key];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    this.log.warn(
      `⚠️ ${key}: Type invalide, utilisation de la valeur par défaut ${defaultValue}`,
    );
    return defaultValue;
  }

  /**
   * Validate and clamp poll interval
   */
  private getValidatedPollInterval(): number {
    const cfg = this.config as OtodoVavConfig;
    let interval = cfg.pollIntervalSec;

    if (
      interval === undefined ||
      interval === null ||
      typeof interval !== 'number' ||
      isNaN(interval)
    ) {
      return DEFAULT_CONFIG.pollIntervalSec * 1000;
    }

    // Clamp to valid range
    if (interval < DEFAULT_CONFIG.minPollInterval) {
      this.log.warn(
        `⚠️ pollIntervalSec ajusté de ${interval}s à ${DEFAULT_CONFIG.minPollInterval}s (minimum)`,
      );
      interval = DEFAULT_CONFIG.minPollInterval;
    } else if (interval > DEFAULT_CONFIG.maxPollInterval) {
      this.log.warn(
        `⚠️ pollIntervalSec ajusté de ${interval}s à ${DEFAULT_CONFIG.maxPollInterval}s (maximum)`,
      );
      interval = DEFAULT_CONFIG.maxPollInterval;
    }

    return interval * 1000;
  }

  /**
   * Log configuration summary at startup
   */
  private logConfigurationSummary(): void {
    const cfg = this.config as OtodoVavConfig;
    const debugMode = this.getConfigBoolean('debug', DEFAULT_CONFIG.debug);

    this.log.info('🚀 Initialisation du plugin Otodo VAV');
    this.log.info('📋 Configuration:');
    this.log.info(`   • Email: ${this.maskEmail(cfg.email || '')}`);
    this.log.info(`   • Park: ${cfg.parkname || DEFAULT_CONFIG.parkname}`);
    this.log.info(`   • Polling: ${this.pollIntervalMs / 1000}s`);
    this.log.info(
      `   • Mode sliders: ${this.displayModeSliders ? 'ON' : 'OFF'}`,
    );
    this.log.info(`   • Debug: ${debugMode ? 'ON' : 'OFF'}`);

    if (debugMode) {
      this.log.debug('🔍 Mode debug activé - logs détaillés actifs');
    }
  }

  /**
   * Mask email for privacy in logs
   */
  private maskEmail(email: string): string {
    if (!email || email.length < 5) {
      return '***';
    }
    const [local, domain] = email.split('@');
    if (!domain) {
      return '***';
    }
    const maskedLocal =
      local.length > 2
        ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
        : local[0] + '*';
    return `${maskedLocal}@${domain}`;
  }

  private async initializePlugin(): Promise<void> {
    if (!this.isConfigValid) {
      this.log.error('❌ Plugin non initialisé - configuration invalide');
      return;
    }

    const cfg = this.config as OtodoVavConfig;

    this.log.debug('📦 Création du TokenStore...');
    const store = new TokenStore(this.api.user.storagePath());

    this.log.debug("🔐 Initialisation de l'authentification...");
    this.auth = new AuthClient(this.log, store, {
      email: String(cfg.email || '').trim(),
      password: String(cfg.password || ''),
      parkname: String(cfg.parkname || DEFAULT_CONFIG.parkname).trim(),
    });

    try {
      await this.auth.init();
    } catch (error) {
      this.log.error("❌ Échec de l'authentification Otodo");
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          this.log.error('   Vérifiez vos identifiants (email/mot de passe)');
        } else if (
          error.message.includes('ENOTFOUND') ||
          error.message.includes('network')
        ) {
          this.log.error('   Vérifiez votre connexion internet');
        } else {
          this.log.error(`   Détail: ${error.message}`);
        }
      }
      throw error;
    }

    this.log.debug('🌐 Création des clients API...');
    this.client = new OtodoClient(this.log, this.auth);
    this.tClient = new ThermostatClient(this.log, this.auth);

    this.log.info('✅ Plugin initialisé avec succès');
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

    if (this.hubsById.size === 0) {
      this.log.warn('⚠️ Aucun hub trouvé - vérifiez votre compte Otodo');
      return;
    }

    for (const hub of this.hubsById.values()) {
      await this.discoverDevices(hub._id);
    }

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
    this.log.info(
      `📡 Mise en place du poller global /devices (intervalle: ${
        this.pollIntervalMs / 1000
      }s)`,
    );

    // Premier polling immédiat
    await this.refreshDevicesOnce();

    // Polling périodique avec intervalle configurable
    setInterval(async () => {
      await this.refreshDevicesOnce();
    }, this.pollIntervalMs);
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
