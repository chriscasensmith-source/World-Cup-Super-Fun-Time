/*
 * World Cup Super Fun Time — seed team data
 * --------------------------------------------------------------------------
 * Final 48 teams for the 2026 Men's World Cup (Canada / Mexico / USA),
 * grouped by the December 2025 final draw plus the March 2026 play-off
 * winners (UEFA: Czechia, Bosnia & Herzegovina, Türkiye, Sweden;
 * Inter-confederation: DR Congo, Iraq).
 *
 * This list is seeded manually so the app works offline and on GitHub Pages
 * even before the football-data.org API returns full 2026 data. The app is
 * structured to enrich / override these records from
 * public/data/world-cup-live.json when it becomes available.
 *
 * Flags are loaded from flagcdn.com using the `flag` ISO code; an emoji flag
 * is provided as an offline fallback.
 */
window.WC_TEAMS = [
  // Group A
  { id: "mexico",        name: "Mexico",                 group: "A", confederation: "CONCACAF", flag: "mx",     emoji: "🇲🇽", host: true },
  { id: "south-korea",   name: "South Korea",            group: "A", confederation: "AFC",      flag: "kr",     emoji: "🇰🇷" },
  { id: "south-africa",  name: "South Africa",           group: "A", confederation: "CAF",      flag: "za",     emoji: "🇿🇦" },
  { id: "czechia",       name: "Czechia",                group: "A", confederation: "UEFA",     flag: "cz",     emoji: "🇨🇿" },

  // Group B
  { id: "canada",        name: "Canada",                 group: "B", confederation: "CONCACAF", flag: "ca",     emoji: "🇨🇦", host: true },
  { id: "bosnia",        name: "Bosnia & Herzegovina",   group: "B", confederation: "UEFA",     flag: "ba",     emoji: "🇧🇦" },
  { id: "qatar",         name: "Qatar",                  group: "B", confederation: "AFC",      flag: "qa",     emoji: "🇶🇦" },
  { id: "switzerland",   name: "Switzerland",            group: "B", confederation: "UEFA",     flag: "ch",     emoji: "🇨🇭" },

  // Group C
  { id: "brazil",        name: "Brazil",                 group: "C", confederation: "CONMEBOL", flag: "br",     emoji: "🇧🇷" },
  { id: "morocco",       name: "Morocco",                group: "C", confederation: "CAF",      flag: "ma",     emoji: "🇲🇦" },
  { id: "scotland",      name: "Scotland",               group: "C", confederation: "UEFA",     flag: "gb-sct", emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { id: "haiti",         name: "Haiti",                  group: "C", confederation: "CONCACAF", flag: "ht",     emoji: "🇭🇹" },

  // Group D
  { id: "usa",           name: "United States",          group: "D", confederation: "CONCACAF", flag: "us",     emoji: "🇺🇸", host: true },
  { id: "paraguay",      name: "Paraguay",               group: "D", confederation: "CONMEBOL", flag: "py",     emoji: "🇵🇾" },
  { id: "australia",     name: "Australia",              group: "D", confederation: "AFC",      flag: "au",     emoji: "🇦🇺" },
  { id: "turkiye",       name: "Türkiye",                group: "D", confederation: "UEFA",     flag: "tr",     emoji: "🇹🇷" },

  // Group E
  { id: "germany",       name: "Germany",                group: "E", confederation: "UEFA",     flag: "de",     emoji: "🇩🇪" },
  { id: "curacao",       name: "Curaçao",                group: "E", confederation: "CONCACAF", flag: "cw",     emoji: "🇨🇼" },
  { id: "cote-divoire",  name: "Côte d'Ivoire",          group: "E", confederation: "CAF",      flag: "ci",     emoji: "🇨🇮" },
  { id: "ecuador",       name: "Ecuador",                group: "E", confederation: "CONMEBOL", flag: "ec",     emoji: "🇪🇨" },

  // Group F
  { id: "netherlands",   name: "Netherlands",            group: "F", confederation: "UEFA",     flag: "nl",     emoji: "🇳🇱" },
  { id: "japan",         name: "Japan",                  group: "F", confederation: "AFC",      flag: "jp",     emoji: "🇯🇵" },
  { id: "tunisia",       name: "Tunisia",                group: "F", confederation: "CAF",      flag: "tn",     emoji: "🇹🇳" },
  { id: "sweden",        name: "Sweden",                 group: "F", confederation: "UEFA",     flag: "se",     emoji: "🇸🇪" },

  // Group G
  { id: "belgium",       name: "Belgium",                group: "G", confederation: "UEFA",     flag: "be",     emoji: "🇧🇪" },
  { id: "egypt",         name: "Egypt",                  group: "G", confederation: "CAF",      flag: "eg",     emoji: "🇪🇬" },
  { id: "iran",          name: "Iran",                   group: "G", confederation: "AFC",      flag: "ir",     emoji: "🇮🇷" },
  { id: "new-zealand",   name: "New Zealand",            group: "G", confederation: "OFC",      flag: "nz",     emoji: "🇳🇿" },

  // Group H
  { id: "spain",         name: "Spain",                  group: "H", confederation: "UEFA",     flag: "es",     emoji: "🇪🇸" },
  { id: "uruguay",       name: "Uruguay",                group: "H", confederation: "CONMEBOL", flag: "uy",     emoji: "🇺🇾" },
  { id: "saudi-arabia",  name: "Saudi Arabia",           group: "H", confederation: "AFC",      flag: "sa",     emoji: "🇸🇦" },
  { id: "cape-verde",    name: "Cape Verde",             group: "H", confederation: "CAF",      flag: "cv",     emoji: "🇨🇻" },

  // Group I
  { id: "france",        name: "France",                 group: "I", confederation: "UEFA",     flag: "fr",     emoji: "🇫🇷" },
  { id: "senegal",       name: "Senegal",                group: "I", confederation: "CAF",      flag: "sn",     emoji: "🇸🇳" },
  { id: "iraq",          name: "Iraq",                   group: "I", confederation: "AFC",      flag: "iq",     emoji: "🇮🇶" },
  { id: "norway",        name: "Norway",                 group: "I", confederation: "UEFA",     flag: "no",     emoji: "🇳🇴" },

  // Group J
  { id: "argentina",     name: "Argentina",              group: "J", confederation: "CONMEBOL", flag: "ar",     emoji: "🇦🇷" },
  { id: "algeria",       name: "Algeria",                group: "J", confederation: "CAF",      flag: "dz",     emoji: "🇩🇿" },
  { id: "austria",       name: "Austria",                group: "J", confederation: "UEFA",     flag: "at",     emoji: "🇦🇹" },
  { id: "jordan",        name: "Jordan",                 group: "J", confederation: "AFC",      flag: "jo",     emoji: "🇯🇴" },

  // Group K
  { id: "portugal",      name: "Portugal",               group: "K", confederation: "UEFA",     flag: "pt",     emoji: "🇵🇹" },
  { id: "dr-congo",      name: "DR Congo",               group: "K", confederation: "CAF",      flag: "cd",     emoji: "🇨🇩" },
  { id: "uzbekistan",    name: "Uzbekistan",             group: "K", confederation: "AFC",      flag: "uz",     emoji: "🇺🇿" },
  { id: "colombia",      name: "Colombia",               group: "K", confederation: "CONMEBOL", flag: "co",     emoji: "🇨🇴" },

  // Group L
  { id: "england",       name: "England",                group: "L", confederation: "UEFA",     flag: "gb-eng", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "croatia",       name: "Croatia",                group: "L", confederation: "UEFA",     flag: "hr",     emoji: "🇭🇷" },
  { id: "ghana",         name: "Ghana",                  group: "L", confederation: "CAF",      flag: "gh",     emoji: "🇬🇭" },
  { id: "panama",        name: "Panama",                 group: "L", confederation: "CONCACAF", flag: "pa",     emoji: "🇵🇦" }
];

// The three draft owners (snake draft, 12 teams each).
window.WC_OWNERS = [
  { id: "fookin-wanka", name: "Fookin Wanka",  accent: "#22d3ee" },
  { id: "swiftie-vibes", name: "Swiftie Vibes", accent: "#f472b6" },
  { id: "american-man",  name: "American Man!", accent: "#f59e0b" }
];

// Scoring configuration. Group-stage wins are worth 1 point; knockout wins
// scale up by round. Goals are a tiebreaker only and never add points.
window.WC_SCORING = {
  groupWin: 1,
  knockout: {
    LAST_32: 2,        // Round of 32 win
    LAST_16: 3,        // Round of 16 win
    QUARTER_FINALS: 4, // Quarterfinal win
    SEMI_FINALS: 5,    // Semifinal win
    THIRD_PLACE: 4,    // Third-place match win
    FINAL: 6           // Final win
  }
};
