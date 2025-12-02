import type { Logger } from 'homebridge';
import { AUTH_URL, API_HEADERS, DEFAULT_CONFIG } from './settings';
import { TokenStore, StoredTokens } from './tokenStore';

export interface AuthConfig {
  email: string;
  password: string;
  parkname: string;
}

export interface AuthResponse {
  token_type: 'Bearer';
  access_token: string;
  refresh_token: string;
  expires_in: number;
  isAdmin: boolean;
  isSuspended: boolean;
  parkId: string;
  homeId: string;
  userId: string;
  language: string;
}

export class AuthClient {
  private tokens: StoredTokens | null = null;
  private refreshing: Promise<void> | null = null;
  private readonly validatedConfig: AuthConfig;

  constructor(
    private readonly log: Logger,
    private readonly store: TokenStore,
    cfg: AuthConfig,
  ) {
    // Validate and sanitize configuration
    this.validatedConfig = this.validateAuthConfig(cfg);
  }

  /**
   * Validates auth config and applies defaults
   */
  private validateAuthConfig(cfg: AuthConfig): AuthConfig {
    const email = (cfg.email || '').trim();
    const password = cfg.password || '';
    const parkname = (cfg.parkname || DEFAULT_CONFIG.parkname).trim();

    if (!email) {
      throw new Error("Email est requis pour l'authentification");
    }

    if (!password) {
      throw new Error("Mot de passe est requis pour l'authentification");
    }

    return { email, password, parkname };
  }

  private computeExpiry(nowMs: number, expiresInSec: number): number {
    // Marge de sécurité d'1 heure pour anticiper l'expiration
    const marginMs = 60 * 60 * 1000;
    return nowMs + expiresInSec * 1000 - marginMs;
  }

  async init(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded) {
      this.tokens = loaded;
      this.log.debug(
        'Tokens chargés depuis le disque, expiration:',
        new Date(loaded.expires_at_epoch_ms).toISOString(),
      );
    }

    if (!(await this.hasValidAccessToken())) {
      this.log.info('Aucun token valide trouvé, authentification initiale...');
      await this.authenticate();
    } else {
      this.log.info('Token valide trouvé, authentification non nécessaire');
    }
  }

  private async authenticate(): Promise<void> {
    this.log.debug('Authentification avec email:', this.validatedConfig.email);

    const body = {
      email: this.validatedConfig.email,
      password: this.validatedConfig.password,
      parkName: this.validatedConfig.parkname,
    };

    try {
      let res: Response;
      try {
        res = await fetch(AUTH_URL, {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify(body),
        });
      } catch (networkError) {
        const errMsg =
          networkError instanceof Error
            ? networkError.message
            : String(networkError);
        if (errMsg.includes('ENOTFOUND') || errMsg.includes('EAI_AGAIN')) {
          throw new Error(
            'Impossible de joindre le serveur Otodo - vérifiez votre connexion internet',
          );
        }
        if (errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED')) {
          throw new Error(
            'Le serveur Otodo ne répond pas - réessayez plus tard',
          );
        }
        throw new Error(`Erreur réseau: ${errMsg}`);
      }

      this.log.debug('Status de la réponse:', res.status);

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 401 || res.status === 403) {
          throw new Error('Email ou mot de passe incorrect');
        }
        if (res.status === 429) {
          throw new Error('Trop de tentatives - attendez quelques minutes');
        }
        if (res.status >= 500) {
          throw new Error(
            'Le serveur Otodo rencontre des problèmes - réessayez plus tard',
          );
        }
        throw new Error(
          `Authentification échouée: HTTP ${res.status} - ${text}`,
        );
      }

      const json = (await res.json()) as AuthResponse;

      if (json.isSuspended) {
        throw new Error(
          'Votre compte Otodo est suspendu - contactez le support Otodo',
        );
      }

      const now = Date.now();
      this.tokens = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        token_type: json.token_type,
        expires_at_epoch_ms: this.computeExpiry(now, json.expires_in),
        userId: json.userId,
        homeId: json.homeId,
        parkId: json.parkId,
      };

      await this.store.save(this.tokens);
      this.log.info(
        'Authentification réussie. Token expire le',
        new Date(this.tokens.expires_at_epoch_ms).toLocaleString(),
      );
    } catch (error) {
      this.log.error("Erreur lors de l'authentification:", error);
      throw error;
    }
  }

  private async refresh(): Promise<void> {
    if (!this.tokens) {
      await this.authenticate();
      return;
    }

    // Empêche les refreshs concurrents
    if (this.refreshing) {
      return this.refreshing;
    }

    this.refreshing = (async () => {
      try {
        this.log.debug('Rafraîchissement du token...');

        // IMPORTANT: Vérifier si Otodo a un endpoint /refresh dédié
        // Pour l'instant, on ré-authentifie (safe mais non optimal)
        // TODO: Si l'API supporte POST /refresh avec { refresh_token: "..." }
        // implémenter ici au lieu de re-authenticate()

        await this.authenticate();
      } catch (error) {
        this.log.error(
          'Échec du rafraîchissement, nouvelle authentification:',
          error,
        );
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }

  private async hasValidAccessToken(): Promise<boolean> {
    if (!this.tokens) {
      return false;
    }

    const isValid = this.tokens.expires_at_epoch_ms > Date.now();

    if (!isValid) {
      this.log.debug('Token expiré ou bientôt expiré');
    }

    return isValid;
  }

  async getAuthHeader(): Promise<string> {
    if (!(await this.hasValidAccessToken())) {
      await this.refresh();
    }

    if (!this.tokens) {
      throw new Error("Impossible d'obtenir un token valide");
    }

    return `${this.tokens.token_type} ${this.tokens.access_token}`;
  }

  /**
   * Fetch avec auto-refresh sur 401
   */
  async authedFetch(
    input: string,
    init: RequestInit = {},
    retryOn401 = true,
  ): Promise<Response> {
    const auth = await this.getAuthHeader();

    // Fusion des headers de l'API avec l'Authorization
    const headers: Record<string, string> = {
      ...API_HEADERS,
      Authorization: auth,
      token: auth.split(' ')[1], // Mettre le token dans le header 'token' aussi
    };

    // Copier les headers existants (override possible)
    if (init.headers) {
      const existingHeaders = new Headers(init.headers);
      existingHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    }

    this.log.debug(`${init.method || 'GET'} ${input}`);

    const res = await fetch(input, { ...init, headers });

    // Si 401 et première tentative, refresh et retry
    if (res.status === 401 && retryOn401) {
      this.log.warn(
        '401 reçu, rafraîchissement du token et nouvelle tentative...',
      );
      await this.refresh();
      return this.authedFetch(input, init, false);
    }

    return res;
  }

  /**
   * Accesseurs pour les métadonnées stockées
   */
  get homeId(): string | null {
    return this.tokens?.homeId ?? null;
  }

  get userId(): string | null {
    return this.tokens?.userId ?? null;
  }

  get parkId(): string | null {
    return this.tokens?.parkId ?? null;
  }
}
