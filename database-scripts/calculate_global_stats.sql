WITH wins AS (
    SELECT 
        w.user_id, 
        w.ban_list_name,
        w.season,
        COUNT(*)::int4 AS wins
    FROM 
        matches w
    WHERE 
        w.winner = TRUE
    GROUP BY 
        w.user_id, w.ban_list_name, w.season
),
losses AS (
    SELECT 
        l.user_id, 
        l.ban_list_name,
        l.season,
        (COUNT(*) - SUM(CASE WHEN l.winner = TRUE THEN 1 ELSE 0 END))::int4 AS losses
    FROM 
        matches l
    GROUP BY 
        l.user_id, l.ban_list_name, l.season
),
points AS (
    SELECT 
        p.user_id, 
        p.ban_list_name,
        p.season,
        SUM(p.points)::int4 AS total_points
    FROM 
        matches p
    GROUP BY 
        p.user_id, p.ban_list_name, p.season
),

global_stats AS (
    SELECT
        w.user_id,
        'Global' AS ban_list_name,
        w.season,
        SUM(w.wins) AS total_wins,
        SUM(l.losses) AS total_losses,
        SUM(p.total_points) AS total_points
    FROM wins w
    JOIN losses l ON w.user_id = l.user_id AND w.ban_list_name = l.ban_list_name AND w.season = l.season
    JOIN points p ON w.user_id = p.user_id AND w.ban_list_name = p.ban_list_name AND w.season = p.season
    GROUP BY w.user_id, w.season
)

INSERT INTO player_stats (user_id, ban_list_name, season, wins, losses, points)
SELECT 
    g.user_id,
    g.ban_list_name,
    g.season,
    g.total_wins AS wins,
    g.total_losses AS losses,
    g.total_points AS points
FROM global_stats g
ON CONFLICT (user_id, ban_list_name, season) 
DO UPDATE 
SET 
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    points = EXCLUDED.points;

WITH achievement_points AS (
    SELECT 
        u.user_id, 
        'Global' AS ban_list_name, 
        u.season,
        SUM(a.earned_points)::int4 AS achievement_points
    FROM 
        user_achievements u
    INNER JOIN 
        achievements a ON u.achievement_id = a.id
    WHERE
        u.labels::jsonb @> '["Global"]'::jsonb -- Solo logros con label Global
    GROUP BY 
        u.user_id, u.season
)
INSERT INTO player_stats (user_id, ban_list_name, season, wins, losses, points)
SELECT 
    ap.user_id, 
    ap.ban_list_name, 
    ap.season,
    0 AS wins, 
    0 AS losses, 
    ap.achievement_points AS points
FROM 
    achievement_points ap
ON CONFLICT (user_id, ban_list_name, season)
DO UPDATE SET
    points = player_stats.points + EXCLUDED.points;
