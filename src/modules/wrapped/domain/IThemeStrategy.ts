import type { SeasonWrapped } from "./SeasonWrapped";

export interface ThemePhrases {
    coverTitle: string;
    coverSubtitle: string;
    statsTitle: string;
    statsSubtitle: string;
    rivalsTitle: string;
    rivalsSubtitle: string;
    achievementsTitle: string;
    achievementsSubtitle: string;
    summaryTitle: string;
    summarySubtitle: string;
    [key: string]: string;
}

export interface GenerateOptions {
    locale: string;
    theme: string;
    includeMatchList: boolean;
    singlePage?: boolean;
}

export interface IThemeStrategy {
    getName(): string;
    getStylesheet(): string;
    getBackground(): string;
    getPhrases(data: SeasonWrapped): ThemePhrases;
    renderSpecialSections(data: SeasonWrapped, options: GenerateOptions, background: string): string;
}
