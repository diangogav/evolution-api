import type { IThemeStrategy, ThemePhrases, GenerateOptions } from "../../domain/IThemeStrategy";
import type { SeasonWrapped } from "../../domain/SeasonWrapped";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export abstract class AbstractThemeStrategy implements IThemeStrategy {
    abstract getName(): string;

    getStylesheet(): string {
        return ""; // Override in concrete classes if needed
    }

    getBackground(): string {
        return "";
    }

    getPhrases(data: SeasonWrapped): ThemePhrases {
        return {
            coverTitle: "EVOLUTION WRAPPED",
            coverSubtitle: `Temporada ${data.seasonId}`,
            statsTitle: "RESUMEN DE TEMPORADA",
            statsSubtitle: "Tus números en el campo de batalla",
            rivalsTitle: "ARCHI-RIVAL",
            rivalsSubtitle: "El duelo nunca termina",
            achievementsTitle: "LOGROS OBTENIDOS",
            achievementsSubtitle: "Tu legado en Evolution",
            summaryTitle: "RESUMEN FINAL",
            summarySubtitle: "¡Nos vemos en el próximo duelo!"
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    renderSpecialSections(_data: SeasonWrapped, _options: GenerateOptions, _background: string): string {
        return "";
    }

    protected getImageAsBase64(filename: string): string {
        const imagesPath = join(__dirname, "..", "templates", "optimized");
        const filePath = join(imagesPath, filename);
        if (existsSync(filePath)) {
            const buffer = readFileSync(filePath);
            const extension = filename.split('.').pop();
            return `data:image/${extension};base64,${buffer.toString('base64')}`;
        }
        return "";
    }
}
