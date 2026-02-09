import type { IThemeStrategy } from "../domain/IThemeStrategy";

export class ThemeStrategyFactory {
    private strategies: Map<string, IThemeStrategy> = new Map();

    register(name: string, strategy: IThemeStrategy): void {
        this.strategies.set(name, strategy);
    }

    get(name: string): IThemeStrategy {
        const strategy = this.strategies.get(name);
        if (!strategy) {
            // Fallback to dark theme if requested theme doesn't exist
            const dark = this.strategies.get("dark");
            if (!dark) throw new Error("Default 'dark' theme not registered");
            return dark;
        }
        return strategy;
    }
}
