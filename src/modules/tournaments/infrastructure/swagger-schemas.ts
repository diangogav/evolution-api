import { t } from "elysia";

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Schema for recording or editing match results
 */
export const MatchResultRequestSchema = t.Object({
    participants: t.Array(t.Object({
        participantId: t.String({
            description: 'Unique identifier of the participant',
            examples: ['participant-123']
        }),
        score: t.Number({
            description: 'Score achieved by the participant in the match',
            examples: [2]
        }),
    }), {
        description: 'Array of participants with their scores',
        minItems: 2,
        maxItems: 2
    })
}, {
    description: 'Match result data with participant scores',
    examples: [{
        participants: [
            { participantId: 'participant-123', score: 2 },
            { participantId: 'participant-456', score: 1 }
        ]
    }]
});

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Generic message response schema
 */
export const MessageResponseSchema = t.Object({
    message: t.String({
        description: 'Response message',
        examples: ['Tournament published']
    })
}, {
    description: 'Generic success message response'
});

/**
 * Player information schema
 */
export const PlayerSchema = t.Object({
    id: t.String({
        description: 'Unique player identifier',
        examples: ['player-123']
    }),
    displayName: t.String({
        description: 'Display name of the player',
        examples: ['JohnDoe']
    }),
    userId: t.Optional(t.String({
        description: 'Associated user ID',
        examples: ['user-456']
    }))
}, {
    description: 'Player information'
});

/**
 * Participant information schema
 */
export const ParticipantSchema = t.Object({
    id: t.String({
        description: 'Unique participant identifier',
        examples: ['participant-789']
    }),
    playerId: t.String({
        description: 'Associated player ID',
        examples: ['player-123']
    }),
    tournamentId: t.String({
        description: 'Tournament ID',
        examples: ['tournament-001']
    }),
    displayName: t.String({
        description: 'Display name for this tournament',
        examples: ['JohnDoe']
    }),
    status: t.String({
        description: 'Participant status',
        examples: ['confirmed', 'pending', 'withdrawn']
    })
}, {
    description: 'Tournament participant information'
});

/**
 * Match participant schema (within a match)
 */
export const MatchParticipantSchema = t.Object({
    participantId: t.String({
        description: 'Participant identifier',
        examples: ['participant-123']
    }),
    displayName: t.Optional(t.String({
        description: 'Participant display name',
        examples: ['JohnDoe']
    })),
    score: t.Union([t.Number(), t.Null()], {
        description: 'Participant score (null if match not completed)',
        examples: [2, null]
    }),
    result: t.Union([
        t.Literal('win'),
        t.Literal('loss'),
        t.Literal('draw'),
        t.Null()
    ], {
        description: 'Match result for this participant',
        examples: ['win', 'loss', null]
    })
}, {
    description: 'Participant data within a match'
});

/**
 * Match schema
 */
export const MatchSchema = t.Object({
    id: t.String({
        description: 'Unique match identifier',
        examples: ['match-001']
    }),
    tournamentId: t.String({
        description: 'Tournament identifier',
        examples: ['tournament-001']
    }),
    roundNumber: t.Number({
        description: 'Round number in the tournament',
        examples: [1, 2, 3]
    }),
    matchNumber: t.Optional(t.Number({
        description: 'Match number within the round',
        examples: [1]
    })),
    participants: t.Array(MatchParticipantSchema, {
        description: 'Participants in this match',
        minItems: 2,
        maxItems: 2
    }),
    completedAt: t.Union([t.String(), t.Null()], {
        description: 'ISO timestamp when match was completed',
        examples: ['2025-11-24T10:00:00Z', null]
    })
}, {
    description: 'Match information'
});

/**
 * Bracket round schema
 */
export const BracketRoundSchema = t.Object({
    roundNumber: t.Number({
        description: 'Round number',
        examples: [1, 2, 3]
    }),
    matches: t.Array(MatchSchema, {
        description: 'Matches in this round'
    })
}, {
    description: 'Tournament bracket round'
});

/**
 * Bracket schema
 */
export const BracketSchema = t.Object({
    tournamentId: t.String({
        description: 'Tournament identifier',
        examples: ['tournament-001']
    }),
    rounds: t.Array(BracketRoundSchema, {
        description: 'All rounds in the bracket'
    })
}, {
    description: 'Complete tournament bracket structure',
    examples: [{
        tournamentId: 'tournament-001',
        rounds: [
            {
                roundNumber: 1,
                matches: [
                    {
                        id: 'match-1',
                        tournamentId: 'tournament-001',
                        roundNumber: 1,
                        matchNumber: 1,
                        participants: [
                            { participantId: 'p1', displayName: 'Player1', score: null, result: null },
                            { participantId: 'p2', displayName: 'Player2', score: null, result: null }
                        ],
                        completedAt: null
                    }
                ]
            }
        ]
    }]
});

/**
 * Array of matches response
 */
export const MatchesArraySchema = t.Array(MatchSchema, {
    description: 'Array of tournament matches',
    examples: [[
        {
            id: 'match-1',
            tournamentId: 'tournament-001',
            roundNumber: 1,
            matchNumber: 1,
            participants: [
                { participantId: 'p1', displayName: 'Player1', score: 2, result: 'win' },
                { participantId: 'p2', displayName: 'Player2', score: 1, result: 'loss' }
            ],
            completedAt: '2025-11-24T10:00:00Z'
        }
    ]]
});
