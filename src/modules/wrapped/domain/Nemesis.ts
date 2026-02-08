export class Nemesis {
    constructor(
        public readonly playerId: string,
        public readonly playerName: string,
        public readonly playerAvatar: string | null,
        public readonly totalMatches: number,
        public readonly wins: number,
        public readonly losses: number,
        public readonly winrate: number,
    ) { }
}

export type Victim = Nemesis;
