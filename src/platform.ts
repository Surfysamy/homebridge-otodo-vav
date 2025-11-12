import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TokenStore } from './tokenStore';
import { AuthClient } from './auth';
import { OtodoClient } from './otodoClient';

export class OtodoVavPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  private auth!: AuthClient;
  private client!: OtodoClient;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Vérification de la configuration
    if (!config || !config.email || !config.password) {
      this.log.error('❌ Configuration invalide : email et password requis');
      return;
    }

    // ⭐ Activation du mode debug si demandé
    if (config.debug === true) {
      this.log.debug('🔍 Mode debug activé');
    }

    this.log.info('🚀 Initialisation du plugin Otodo VAV');

    this.api.on('didFinishLaunching', async () => {
      try {
        await this.initializePlugin();
      } catch (error) {
        this.log.error('❌ Échec de l\'initialisation du plugin:', error);
      }
    });
  }

  /**
   * Méthode d'initialisation séparée pour plus de clarté
   */
  private async initializePlugin(): Promise<void> {
    this.log.debug('📦 Création du TokenStore...');
    const store = new TokenStore(this.api.user.storagePath());

    this.log.debug('🔐 Initialisation de l\'authentification...');
    this.auth = new AuthClient(this.log, store, {
      email: String(this.config.email),
      password: String(this.config.password),
      parkname: String(this.config.parkname ?? 'vav'),
    });

    await this.auth.init();

    this.log.debug('🌐 Création du client API...');
    this.client = new OtodoClient(this.log, this.auth);

    this.log.info('✅ Plugin initialisé avec succès');
    this.log.info(`   HomeId: ${this.auth.homeId}`);
    this.log.info(`   UserId: ${this.auth.userId}`);
    this.log.info(`   ParkId: ${this.auth.parkId}`);

    // TODO: Découverte des thermostats
    // await this.discoverDevices();
  }

  /**
   * Appelé par Homebridge pour restaurer les accessoires en cache
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug('🔄 Restauration de l\'accessoire depuis le cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Méthode pour créer ou mettre à jour un thermostat
   */
  private upsertThermostat(device: { name: string; id: string }): void {
    const uuid = this.api.hap.uuid.generate(device.id);
    const existing = this.accessories.find(acc => acc.UUID === uuid);

    if (existing) {
      this.log.info('♻️  Restauration du thermostat:', device.name);
      // TODO: new ThermostatAccessory(this, existing, device, this.client);
    } else {
      this.log.info('➕ Enregistrement du nouveau thermostat:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      // TODO: new ThermostatAccessory(this, accessory, device, this.client);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  /**
   * Future méthode de découverte des appareils
   */
  private async discoverDevices(): Promise<void> {
    this.log.debug('🔍 Recherche des thermostats...');
    
    // TODO: Implémenter quand tu auras l'endpoint de découverte
    // Exemple :
    // const devices = await this.client.getJson<DeviceSummary[]>(
    //   `https://api.gateway.otodo.io/homes/${this.auth.homeId}/devices`
    // );
    // 
    // for (const device of devices) {
    //   if (device.type === 'thermostat') {
    //     this.upsertThermostat(device);
    //   }
    // }
  }
}