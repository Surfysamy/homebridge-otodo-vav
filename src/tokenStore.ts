import { promises as fs } from 'fs';
import * as path from 'path';


export interface StoredTokens {
    access_token: string;
    refresh_token: string;
    token_type: string; // 'Bearer'
    expires_at_epoch_ms: number; // absolute expiry time
    userId?: string;
    homeId?: string;
    parkId?: string;
}


export class TokenStore {
    private filePath: string;


    constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'otodo-vav-tokens.json');
    }


    async load(): Promise<StoredTokens | null> {
    try {
    const data = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(data) as StoredTokens;
    } catch {
    return null;
    }
    }


    async save(tokens: StoredTokens): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2), 'utf8');
    }
}