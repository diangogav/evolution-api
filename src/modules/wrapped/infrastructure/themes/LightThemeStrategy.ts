import { AbstractThemeStrategy } from "./AbstractThemeStrategy";

export class LightThemeStrategy extends AbstractThemeStrategy {
    getName(): string {
        return "light";
    }

    getStylesheet(): string {
        return `
            :root {
                --color-bg: #f8fafc;
                --color-surface: #ffffff;
                --color-text: #0f172a;
                --color-text-muted: #64748b;
                --color-accent: #0ea5e9;
                --color-border: #e2e8f0;
            }
        `;
    }
}
