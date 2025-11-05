DO $$
DECLARE
    season_number INT := 5;  -- 🔧 Cambia aquí la temporada
BEGIN
    RAISE NOTICE 'Recalculando estadísticas GLOBAL para la Season %', season_number;

    -- 1️⃣ Eliminar registros globales existentes de la season seleccionada
    DELETE FROM player_stats 
    WHERE season = season_number
      AND ban_list_name = 'Global';

    -- 2️⃣ Calcular y actualizar estadísticas globales
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
            AND w.season = season_number
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
        WHERE 
            l.season = season_number
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
        WHERE 
            p.season = season_number
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

    -- 3️⃣ Agregar puntos por logros globales
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
            u.season = season_number
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
    DO UPDATE 
    SET 
        points = player_stats.points + EXCLUDED.points;

    RAISE NOTICE 'Estadísticas GLOBAL de la Season % recalculadas correctamente.', season_number;
END $$;
