import { AbstractThemeStrategy } from "./AbstractThemeStrategy";

export class DarkThemeStrategy extends AbstractThemeStrategy {
    getName(): string {
        return "dark";
    }

    getStylesheet(): string {
        return `
            :root {
                --color-bg: #0f172a;
                --color-surface: #1e293b;
                --color-text: #f1f5f9;
                --color-text-muted: #94a3b8;
                --color-accent: #38bdf8;
                --color-border: #334155;
            }
        `;
    }
}
