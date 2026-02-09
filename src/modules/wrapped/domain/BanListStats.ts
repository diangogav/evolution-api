export class BanListStats {
    constructor(
        public readonly banListName: string,
        public readonly matches: number,
        public readonly wins: number,
        public readonly losses: number,
        public readonly draws: number,
        public readonly winrate: number,
        public readonly topMatchup: string | null = null,
    ) { }

    getFlavor(): string {
        if (this.winrate >= 70) return "En esta banlist estabas on fire 🔥";
        if (this.winrate <= 40) return "En esta banlist sufriste un poco 😅";
        return "En esta banlist te mantuviste competitivo 💪";
    }
}
