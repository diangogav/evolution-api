import type { SeasonWrapped } from "../../domain/SeasonWrapped";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { IThemeStrategy, ThemePhrases, GenerateOptions } from "../../domain/IThemeStrategy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to load optimized images as base64
function getImageAsBase64(filename: string): string {
    try {
        const imagePath = join(__dirname, 'optimized', filename);
        if (!existsSync(imagePath)) return '';
        const imageBuffer = readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        console.error(`Failed to load image ${filename}:`, error);
        return '';
    }
}

// Pre-load optimized Yu-Gi-Oh! themed images
const images = {
    decorative1: getImageAsBase64('yugioh_dragon_background.png'),      // Dragon artwork
    decorative2: getImageAsBase64('yugioh_monster_background.png'),     // Monster artwork
    decorative3: getImageAsBase64('yugioh_battlefield_background.png'), // Battlefield scene
    decorative4: getImageAsBase64('yugioh_cards_background.png'),       // Cards artwork
    icon: getImageAsBase64('yugioh_chapter_icon.png'),                  // Small chapter icon
};

export function renderTemplate(data: SeasonWrapped, options: GenerateOptions, themeStrategy: IThemeStrategy): string {
    const styles = readFileSync(join(__dirname, "styles.css"), "utf-8");
    const themeCss = getSeasonTheme(data.seasonId);
    const themeStylesheet = themeStrategy.getStylesheet();
    const phrases = themeStrategy.getPhrases(data);

    // Select theme background or random monster
    let randomMonster = themeStrategy.getBackground();
    if (!randomMonster) {
        const monsterImages = [images.decorative1, images.decorative2].filter(Boolean);
        randomMonster = monsterImages[Math.floor(Math.random() * monsterImages.length)] || images.decorative1;
    }

    const specialSections = themeStrategy.renderSpecialSections(data, options, randomMonster);

    return `
<!DOCTYPE html>
<html lang="${options.locale}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Season ${data.seasonId} Wrapped - ${data.playerName}</title>
	<style>
        ${styles}
        ${themeCss}
        ${themeStylesheet}
    </style>
</head>
<body>
	${renderCoverPage(data, options, randomMonster, phrases)}
	${renderGlobalStatsPage(data, options, randomMonster, phrases)}
	${renderBanListPages(data, options, randomMonster, phrases)}
	${renderChartsPage(data, options, randomMonster, phrases)}
    ${(data.nemesis || data.victim) ? renderRivalsPage(data, options, randomMonster, phrases) : ""}
    ${specialSections}
    ${data.achievements.length > 0 ? renderAchievementsPage(data, options, randomMonster, phrases) : ""}
	${renderRankingPage(data, options, randomMonster, phrases)}
	${renderSummaryPage(data, options, randomMonster, phrases)}
    
    <!-- PDF Download Button (Hidden in Print) -->
    <a href="/api/v1/seasons/${data.seasonId}/wrapped/${data.playerId}/pdf?locale=${options.locale}&theme=${options.theme}" class="download-fab" title="Download PDF" target="_blank">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 16L7 11H10V4H14V11H17L12 16ZM12 18C7.58 18 4 14.42 4 10H2C2 15.52 6.48 20 12 20C17.52 20 22 15.52 22 10H20C20 14.42 16.42 18 12 18Z"/>
            <path d="M5 20H19V22H5V20Z"/>
        </svg>
    </a>
</body>
</html>
	`.trim();
}

// Single-page compact version for evaluation
export function renderSinglePageTemplate(data: SeasonWrapped, options: GenerateOptions, themeStrategy: IThemeStrategy): string {
    const styles = readFileSync(join(__dirname, "styles.css"), "utf-8");
    const singlePageStyles = readFileSync(join(__dirname, "styles_single_page.css"), "utf-8");
    const themeCss = getSeasonTheme(data.seasonId);
    const themeStylesheet = themeStrategy.getStylesheet();
    const phrases = themeStrategy.getPhrases(data);

    // Select theme background or random monster
    let randomMonster = themeStrategy.getBackground();
    if (!randomMonster) {
        const monsterImages = [images.decorative1, images.decorative2].filter(Boolean);
        randomMonster = monsterImages[Math.floor(Math.random() * monsterImages.length)] || images.decorative1;
    }

    return `
<!DOCTYPE html>
<html lang="${options.locale}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Season ${data.seasonId} Wrapped - ${data.playerName} (Single Page)</title>
	<style>
        ${styles}
        ${singlePageStyles}
        ${themeCss}
        ${themeStylesheet}
    </style>
</head>
<body>
	${renderCoverPage(data, options, randomMonster, phrases)}
	${renderGlobalStatsPage(data, options, randomMonster, phrases)}
	${renderBanListPages(data, options, randomMonster, phrases)}
	${renderChartsPage(data, options, randomMonster, phrases)}
    ${(data.nemesis || data.victim) ? renderRivalsPage(data, options, randomMonster, phrases) : ""}
    ${data.achievements.length > 0 ? renderAchievementsPage(data, options, randomMonster, phrases) : ""}
    ${renderRankingPage(data, options, randomMonster, phrases)}
</body>
</html>
	`.trim();
}

function renderHeader(title: string, seasonName: string, phrases: ThemePhrases): string {
    return `
    <div class="header-bar">
        <div class="brand">
            <span class="brand-icon">◆</span>
            ${phrases.brandName || "DUELIST WRAPPED"}
        </div>
        <div class="season-tag">${seasonName}</div>
    </div>
    `;
}

function renderCoverPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {


    return `
<div class="page cover-page">
	${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}

    <div class="cover-hero-container">
        <div class="cover-hero-image">
            <img src="${randomMonster}" alt="Cover Monster" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.6));" />
        </div>
    </div>
	
	<h1 class="cover-title">${phrases.coverTitle}</h1>
	
	<div class="subtitle-container" style="margin-top: 20px;">
        <h2 style="font-size: 32px; color: #FFFFFF; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(0,0,0,0.5);">${escapeHtml(data.playerName)}</h2>
        <p style="font-size: 24px; color: var(--text-secondary);">
            ${data.seasonName}
        </p>
    </div>
    
    <div class="footer">
        Generated by Evolution API
    </div>
</div>
	`;
}

function renderGlobalStatsPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    const stats = data.globalStats;

    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Season Overview", data.seasonName, phrases)}

	<div class="chapter-super">
		${images.icon ? `<img src="${images.icon}" class="chapter-icon" alt="" />` : ''}
		${phrases.chapter1 || (options.locale === "es" ? "CAPÍTULO 1" : "CHAPTER 1")}
	</div>
	<h2 class="page-title">${phrases.statsTitle}</h2>
    <p class="page-subtitle" style="text-align: center; color: var(--text-muted); margin-top: -10px; margin-bottom: 20px; font-style: italic;">
        ${phrases.statsSubtitle}
    </p>
	
    <div class="main-stats-card">
        <div class="tag-badge">
            ${stats.totalMatches} ${options.locale === "es" ? "PARTIDAS TOTALES" : "TOTAL MATCHES"}
        </div>
        
        <div class="big-stats-row">
            <div class="stat-group">
                <span class="stat-group-label">${options.locale === "es" ? "VICTORIAS" : "WINS"}</span>
                <span class="stat-group-value wins">${stats.wins}</span>
            </div>
            <div class="stat-group">
                <span class="stat-group-label">${options.locale === "es" ? "DERROTAS" : "LOSSES"}</span>
                <span class="stat-group-value losses">${stats.losses}</span>
            </div>
        </div>

        <div class="winrate-section">
            <div class="winrate-header">
                <span>WINRATE</span>
                <span>${stats.winrate}%</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${stats.winrate}%"></div>
            </div>
        </div>
    </div>

    <div class="grid-2">
        <div class="stat-box">
            <div class="stat-box-icon">🔥</div>
            <div class="stat-box-label">${options.locale === "es" ? "Mejor Racha" : "Best Streak"}</div>
            <div class="stat-box-value">${stats.bestWinStreak}</div>
            <div class="stat-box-sub">${options.locale === "es" ? "Victorias seguidas" : "Wins in a row"}</div>
        </div>
        <div class="stat-box">
             <div class="stat-box-icon">📅</div>
            <div class="stat-box-label">${options.locale === "es" ? "Días Activos" : "Active Days"}</div>
            <div class="stat-box-value">${stats.activeDays}</div>
            <div class="stat-box-sub">${options.locale === "es" ? "Días jugados" : "Days played"}</div>
        </div>
    </div>
</div>
	`;
}

function renderBanListPages(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    if (data.banListStats.length === 0) return "";

    // Take top 3 banlists to fit on one page if possible, or paginate
    const topBanlist = data.banListStats[0];

    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Formats", data.seasonName, phrases)}
    
	<div class="chapter-super">
		${images.icon ? `<img src="${images.icon}" class="chapter-icon" alt="" />` : ''}
		${phrases.chapter2 || (options.locale === "es" ? "CAPÍTULO 2" : "CHAPTER 2")}
	</div>
	<h2 class="page-title">${phrases.statsTitle}</h2>
	
	<div class="card-container">
        <div class="tag-badge">MAIN FORMAT</div>
        
        <h3 style="font-size: 32px; font-weight: 800; margin-bottom: 8px;">${escapeHtml(topBanlist.banListName)}</h3>
        <p style="color: var(--text-secondary); margin-bottom: 24px;">${getBanListFlavor(topBanlist.winrate)}</p>
        
        <div class="winrate-section" style="margin: 0; max-width: 100%;">
            <div class="winrate-header">
                <span>WINRATE (${topBanlist.matches} matches)</span>
                <span>${topBanlist.winrate}%</span>
            </div>
            <div class="progress-track" style="background: rgba(255,255,255,0.1)">
                <div class="progress-fill" style="width: ${topBanlist.winrate}%"></div>
            </div>
        </div>
	</div>

    <div class="grid-2" style="margin-top: 24px;">
        ${data.banListStats.slice(1, 3).map(bl => `
        <div class="stat-box">
            <div class="stat-box-label">${escapeHtml(bl.banListName)}</div>
            <div class="stat-box-value" style="font-size: 32px;">${bl.winrate}%</div>
            <div class="stat-box-sub">${bl.matches} matches</div>
        </div>
        `).join('')}
    </div>
</div>
	`;
}

function renderRivalsPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Rivals", data.seasonName, phrases)}

    <div class="chapter-super">
		${images.icon ? `<img src="${images.icon}" class="chapter-icon" alt="" />` : ''}
		${options.locale === "es" ? "CAPÍTULO 3" : "CHAPTER 3"}
	</div>
    <h2 class="page-title">${phrases.rivalsTitle}</h2>
    <p class="page-subtitle" style="text-align: center; color: var(--text-muted); margin-top: -10px; margin-bottom: 20px; font-style: italic;">
        ${phrases.rivalsSubtitle}
    </p>


    <div class="rivals-grid" style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px;">
        ${data.nemesis ? `
        <div class="card-container rival-card" style="padding: 20px; display: flex; align-items: center; gap: 20px;">
            <div style="flex-shrink: 0;">
                <img src="${data.nemesis.playerAvatar || getInitialsAvatar(data.nemesis.playerName)}" class="profile-avatar" style="width: 80px; height: 80px; border-color: #ef4444;" />
            </div>
            
            <div style="flex-grow: 1;">
                <div class="tag-badge" style="display: inline-block; margin-bottom: 8px; font-size: 12px; padding: 4px 12px; color: #ef4444; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2);">
                    👻 ${options.locale === "es" ? "EL ROMPECORAZONES (NÉMESIS)" : "THE HEARTBREAKER (NEMESIS)"}
                </div>
                <h3 style="color: #ef4444; margin: 0; font-size: 24px;">${escapeHtml(data.nemesis.playerName)}</h3>
                <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">
                    ${options.locale === "es" ? "Te robó los Life Points... y la dignidad." : "Stole your Life Points... and your pride."}
                </p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                <span class="pill" style="margin: 0;">${data.nemesis.totalMatches} matches</span>
                <span class="pill" style="margin: 0; background: rgba(239, 68, 68, 0.3); color: #ef4444; font-weight: bold;">${data.nemesis.losses} ${options.locale === "es" ? "derrotas" : "losses"}</span>
            </div>
        </div>
        ` : ""}

        ${data.victim ? `
        <div class="card-container rival-card" style="padding: 20px; display: flex; align-items: center; gap: 20px;">
            <div style="flex-shrink: 0;">
                <img src="${data.victim.playerAvatar || getInitialsAvatar(data.victim.playerName)}" class="profile-avatar" style="width: 80px; height: 80px; border-color: #10b981;" />
            </div>
            
            <div style="flex-grow: 1;">
                <div class="tag-badge" style="display: inline-block; margin-bottom: 8px; font-size: 12px; padding: 4px 12px; color: #10b981; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2);">
                    🎯 ${options.locale === "es" ? "TU ADMIRADOR SECRETO (VÍCTIMA)" : "YOUR SECRET ADMIRER (VICTIM)"}
                </div>
                <h3 style="color: #10b981; margin: 0; font-size: 24px;">${escapeHtml(data.victim.playerName)}</h3>
                <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">
                    ${options.locale === "es" ? "Te quiere tanto que te deja ganar (o eso dices)." : "They love you so much they let you win (or so you say)."}
                </p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                <span class="pill" style="margin: 0;">${data.victim.totalMatches} matches</span>
                <span class="pill" style="margin: 0; background: rgba(16, 185, 129, 0.3); color: #10b981; font-weight: bold;">${data.victim.wins} ${options.locale === "es" ? "victorias" : "wins"}</span>
            </div>
        </div>
        ` : ""}

        ${(() => {
            // Determine arch-rival (most frequent opponent)
            const archRival = data.nemesis && data.victim
                ? (data.nemesis.totalMatches >= data.victim.totalMatches ? data.nemesis : data.victim)
                : data.nemesis || data.victim;

            if (!archRival) return "";

            return `
        <div class="card-container rival-card" style="padding: 20px; display: flex; align-items: center; gap: 20px;">
            <div style="flex-shrink: 0;">
                <img src="${archRival.playerAvatar || getInitialsAvatar(archRival.playerName)}" class="profile-avatar" style="width: 80px; height: 80px; border-color: #a855f7;" />
            </div>
            
            <div style="flex-grow: 1;">
                <div class="tag-badge" style="display: inline-block; margin-bottom: 8px; font-size: 12px; padding: 4px 12px; color: #a855f7; background: rgba(168, 85, 247, 0.1); border-color: rgba(168, 85, 247, 0.2);">
                    ⚔️ ${options.locale === "es" ? "MEDIA NARANJA (ARCHIENEMIGO)" : "BETTER HALF (ARCH-RIVAL)"}
                </div>
                <h3 style="color: #a855f7; margin: 0; font-size: 24px;">${escapeHtml(archRival.playerName)}</h3>
                <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">
                    ${options.locale === "es" ? "No pueden vivir el uno sin el otro... en el campo." : "Can't live without each other... on the field."}
                </p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                <span class="pill" style="margin: 0; background: rgba(168, 85, 247, 0.2); color: #a855f7;">${archRival.totalMatches} ${options.locale === "es" ? "partidas" : "matches"}</span>
            </div>
        </div>
            `;
        })()}
    </div>
</div>
    `;
}

function renderChartsPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    if (data.banListStats.length === 0) return "";

    // Calculate max matches for scaling
    const maxMatches = Math.max(...data.banListStats.map(bl => bl.matches));

    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Evolution", data.seasonName, phrases)}
    
    <div class="chapter-super">${options.locale === "es" ? "CAPÍTULO 4" : "CHAPTER 4"}</div>
    <h2 class="page-title">${options.locale === "es" ? "Evolución" : "Evolution"}</h2>
    
    <div class="card-container">
        <h3 style="margin-bottom: 24px;">Matches Distribution</h3>
        
        ${data.banListStats.map(bl => `
        <div class="chart-bar-item">
            <div class="chart-bar-header">
                <span>${escapeHtml(bl.banListName)}</span>
                <span style="color: var(--text-muted);">${bl.matches}</span>
            </div>
            <div class="chart-track">
                <div class="chart-fill active" style="width: ${(bl.matches / maxMatches) * 100}%"></div>
            </div>
        </div>
        `).join('')}
    </div>
</div>
    `;
}

function renderAchievementsPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    if (data.achievements.length === 0) return "";

    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Logros", data.seasonName, phrases)}
    
    <div class="chapter-super">${options.locale === "es" ? "CAPÍTULO 5" : "CHAPTER 5"}</div>
    <h2 class="page-title">${phrases.achievementsTitle}</h2>
    
    <div class="achievements-list">
        ${data.achievements.map(ach => `
        <div class="achievement-card">
            <div class="achievement-icon-container">
                ${ach.icon && ach.icon.startsWith('http')
            ? `<img src="${ach.icon}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
            : '🏆'}
            </div>
            <div class="achievement-content">
                <div class="achievement-badge">
                    🏆 ${options.locale === "es" ? "LOGRO DESBLOQUEADO" : "ACHIEVEMENT UNLOCKED"}
                </div>
                <h3 class="achievement-title">
                    ${escapeHtml(ach.name)}
                </h3>
                <p class="achievement-description">${escapeHtml(ach.description)}</p>
            </div>
            ${ach.unlockedAt ? `
            <div class="achievement-date">
                ${new Date(ach.unlockedAt).toLocaleDateString(options.locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
</div>
    `;
}

function renderRankingPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    return `
<div class="page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    ${renderHeader("Ranking", data.seasonName, phrases)}
    
    <div class="chapter-super">${options.locale === "es" ? "FINAL" : "FINALE"}</div>
    <h2 class="page-title">${options.locale === "es" ? "Posición" : "Ranking"}</h2>
    
    <div class="card-container" style="text-align: center; padding: 48px;">
        <div class="tag-badge" style="background: var(--color-accent); color: white; padding: 8px 16px;">
            ${data.ranking.rankBadge} TIER
        </div>
        
        <div style="font-size: 120px; font-weight: 900; line-height: 1; letter-spacing: -4px; margin: 24px 0;">
            #${data.ranking.position}
        </div>
        
        <p style="color: var(--text-secondary); font-size: 20px;">
            Top ${(data.ranking.position / data.ranking.totalPlayers * 100).toFixed(0)}% of ${data.ranking.totalPlayers} players
        </p>
        
        <div style="margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--border-subtle);">
            <div class="stat-group-value" style="font-size: 48px;">${data.ranking.points}</div>
            <div class="stat-group-label" style="margin-top: 8px;">TOTAL POINTS</div>
        </div>
    </div>
    
    ${data.extraStats.uniqueOpponents > 0 ? `
    <div class="grid-2" style="margin-top: 24px;">
        <div class="stat-box">
             <div class="stat-box-label">Unique Opponents</div>
             <div class="stat-box-value">${data.extraStats.uniqueOpponents}</div>
        </div>
        ${data.extraStats.bestDay ? `
        <div class="stat-box">
             <div class="stat-box-label">Lucky Day</div>
             <div class="stat-box-value" style="font-size: 24px;">${escapeHtml(data.extraStats.bestDay)}</div>
        </div>
        ` : ""}
    </div>
    ` : ""}
</div>
    `;
}

function renderSummaryPage(data: SeasonWrapped, options: GenerateOptions, randomMonster: string, phrases: ThemePhrases): string {
    return `
<div class="page summary-page">
    ${randomMonster ? `<div class="page-bg-decoration"><img src="${randomMonster}" alt="" /></div>` : ''}
    
    
    <div class="cover-container">
        <h1 class="cover-title" style="font-size: 48px; margin-bottom: 16px;">${phrases.summaryTitle || escapeHtml(data.playerName)}</h1>
        <div class="subtitle" style="margin-top: 0;">${phrases.summarySubtitle || data.seasonName}</div>
    </div>
        
        <div class="summary-stats-grid">
            <div class="summary-stat-box primary">
                <div class="summary-stat-value">${data.globalStats.totalMatches}</div>
                <div class="summary-stat-label">${options.locale === "es" ? "Duelos" : "Duels"}</div>
            </div>
            
            <div class="summary-stat-box success">
                <div class="summary-stat-value">${data.globalStats.wins}</div>
                <div class="summary-stat-label">${options.locale === "es" ? "Victorias" : "Wins"}</div>
            </div>
            
            <div class="summary-stat-box">
                <div class="summary-stat-value">${data.globalStats.winrate}%</div>
                <div class="summary-stat-label">Win Rate</div>
            </div>
        </div>
        
        <div class="summary-highlights">
            ${data.globalStats.bestWinStreak > 0 ? `
            <div class="summary-highlight">
                🔥 <strong>${data.globalStats.bestWinStreak}</strong> ${options.locale === "es" ? "racha de victorias" : "win streak"}
            </div>
            ` : ''}
            
            ${data.ranking ? `
            <div class="summary-highlight">
                🏆 <strong>#${data.ranking.position}</strong> ${options.locale === "es" ? "en el ranking" : "in rankings"} · ${data.ranking.rankBadge}
            </div>
            ` : ''}
            
            ${data.extraStats?.mostPlayedBanList ? `
            <div class="summary-highlight">
                🎮 ${options.locale === "es" ? "Formato favorito:" : "Favorite format:"} <strong>${data.extraStats.mostPlayedBanList}</strong>
            </div>
            ` : ''}
        </div>
        
        ${(data.nemesis || data.victim) ? `
        <div class="summary-rivals">
            ${data.nemesis ? `
            <div class="summary-rival nemesis">
                <div class="summary-rival-badge">👻</div>
                <div class="summary-rival-info">
                    <div class="summary-rival-label">${options.locale === "es" ? "Némesis" : "Nemesis"}</div>
                    <div class="summary-rival-name">${escapeHtml(data.nemesis.playerName)}</div>
                    <div class="summary-rival-stat">${data.nemesis.wins}W / ${data.nemesis.losses}L</div>
                </div>
            </div>
            ` : ''}
            
            ${data.victim ? `
            <div class="summary-rival victim">
                <div class="summary-rival-badge">🎯</div>
                <div class="summary-rival-info">
                    <div class="summary-rival-label">${options.locale === "es" ? "Víctima" : "Victim"}</div>
                    <div class="summary-rival-name">${escapeHtml(data.victim.playerName)}</div>
                    <div class="summary-rival-stat">${data.victim.wins}W / ${data.victim.losses}L</div>
                </div>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        <div class="summary-footer">
            <div class="summary-branding">Evolution API</div>
            <div class="summary-season-dates">
                ${new Date(data.seasonDates.start).toLocaleDateString(options.locale === "es" ? "es-ES" : "en-US", { month: 'short', day: 'numeric' })} - 
                ${new Date(data.seasonDates.end).toLocaleDateString(options.locale === "es" ? "es-ES" : "en-US", { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
        </div>
    </div>
    `;
}

function getInitialsAvatar(name: string): string {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='white' font-size='40' font-family='sans-serif' font-weight='bold'%3E${name.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E`;
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

function getBanListFlavor(winrate: number): string {
    if (winrate >= 70) return "En esta banlist estabas on fire 🔥";
    if (winrate <= 40) return "En esta banlist sufriste un poco 😅";
    return "En esta banlist te mantuviste competitivo 💪";
}

function getSeasonTheme(seasonId: number): string {
    const themes: Record<number, { accent: string; bgBase: string; bgCard: string }> = {
        // Season 3: Nature/Wind - Emerald/Green (Old S1 Theme)
        3: {
            accent: '#10B981',
            bgBase: '#064E3B',
            bgCard: '#065F46'
        },
        // Season 4: Fire/Invasion - Red/Orange (Old S2 Theme)
        4: {
            accent: '#EF4444',
            bgBase: '#450A0A',
            bgCard: '#7F1D1D'
        },
        // Season 5: Water/Abyss - Cyan/Blue
        5: {
            accent: '#06B6D4',
            bgBase: '#083344',
            bgCard: '#164E63'
        },
        // Season 6: Current/Tech - Blue (Default)
        6: {
            accent: '#3B82F6',
            bgBase: '#0B1120',
            bgCard: '#151e32'
        }
    };

    const theme = themes[seasonId] || themes[6]; // Default to Season 6 style

    return `
    :root {
        --color-accent: ${theme.accent};
        --color-accent-glow: ${theme.accent}80;
        --bg-base: ${theme.bgBase};
        --bg-card: ${theme.bgCard};
        --bg-highlight: ${theme.bgCard};
        --gradient-primary: linear-gradient(135deg, ${theme.accent} 0%, ${theme.bgCard} 100%);
    }
    `;
}
