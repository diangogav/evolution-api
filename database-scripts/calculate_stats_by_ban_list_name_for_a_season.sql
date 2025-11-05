DO $$
DECLARE
    season_number INT := 5;  -- 🔧 Cambia aquí la temporada
BEGIN
    RAISE NOTICE 'Recalculando estadísticas para la Season %', season_number;

    -- 1️⃣ Eliminar registros existentes de la season seleccionada
    DELETE FROM player_stats WHERE season = season_number;

    -- 2️⃣ Insertar estadísticas de matches
    WITH wins AS (
        SELECT 
            user_id, 
            ban_list_name,
            season,
            COUNT(*)::int4 AS wins
        FROM 
            matches
        WHERE 
            winner = TRUE
            AND season = season_number
        GROUP BY 
            user_id, ban_list_name, season
    ),
    losses AS (
        SELECT 
            user_id, 
            ban_list_name,
            season,
            (COUNT(*) - SUM(CASE WHEN winner = TRUE THEN 1 ELSE 0 END))::int4 AS losses
        FROM 
            matches
        WHERE 
            season = season_number
        GROUP BY 
            user_id, ban_list_name, season
    ),
    points AS (
        SELECT 
            user_id, 
            ban_list_name,
            season,
            SUM(points)::int4 AS total_points
        FROM 
            matches
        WHERE 
            season = season_number
        GROUP BY 
            user_id, ban_list_name, season
    )
    INSERT INTO player_stats (user_id, ban_list_name, season, wins, losses, points)
    SELECT 
        w.user_id, 
        w.ban_list_name, 
        w.season,
        w.wins, 
        l.losses, 
        p.total_points
    FROM 
        wins w
    JOIN 
        losses l ON w.user_id = l.user_id AND w.ban_list_name = l.ban_list_name AND w.season = l.season
    JOIN 
        points p ON w.user_id = p.user_id AND w.ban_list_name = p.ban_list_name AND w.season = p.season
    ON CONFLICT (user_id, ban_list_name, season) 
    DO UPDATE 
    SET 
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        points = EXCLUDED.points;

    -- 3️⃣ Insertar puntos por logros
    WITH achievement_points AS (
        SELECT 
            u.user_id, 
            label.value AS ban_list_name, 
            u.season,
            SUM(a.earned_points)::int4 AS achievement_points
        FROM 
            user_achievements u
        JOIN LATERAL 
            json_array_elements_text(u.labels) AS label(value) ON true
        INNER JOIN 
            achievements a ON u.achievement_id = a.id
        WHERE 
            u.season = season_number
        GROUP BY 
            u.user_id, label.value, u.season
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
    DO UPDATE 
    SET 
        points = player_stats.points + EXCLUDED.points;

    RAISE NOTICE 'Season % recalculada correctamente.', season_number;
END $$;
