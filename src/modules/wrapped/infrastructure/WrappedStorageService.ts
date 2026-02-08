import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export class WrappedStorageService {
    private readonly storagePath: string;

    constructor() {
        this.storagePath = join(process.cwd(), "storage", "wrapped");
        this.ensureDirectoryExists();
    }

    private ensureDirectoryExists(): void {
        if (!existsSync(this.storagePath)) {
            mkdirSync(this.storagePath, { recursive: true });
        }
    }

    getFilePath(seasonId: number, playerId: string, locale: string, theme: string): string {
        return join(this.storagePath, `season_${seasonId}_${playerId}_${locale}_${theme}.pdf`);
    }

    exists(seasonId: number, playerId: string, locale: string, theme: string): boolean {
        const filePath = this.getFilePath(seasonId, playerId, locale, theme);
        return existsSync(filePath);
    }

    save(seasonId: number, playerId: string, locale: string, theme: string, buffer: Buffer): void {
        const filePath = this.getFilePath(seasonId, playerId, locale, theme);
        writeFileSync(filePath, buffer);
    }
}
