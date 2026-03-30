// @ts-nocheck

export interface SpanishSource {
  name: string;
  platform: 'RSS';
  url: string;
  language: 'es';
  trustScore: number;
  category: string;
}

export const SPANISH_SOURCES: SpanishSource[] = [
  // --- Houston Local Spanish-Language ---
  {
    name: 'Univision Houston (KXLN 45)',
    platform: 'RSS',
    url: 'https://www.univision.com/local/houston-kxln/feed',
    language: 'es',
    trustScore: 0.85,
    category: 'LOCAL_NEWS',
  },
  {
    name: 'Telemundo Houston (KTMD 47)',
    platform: 'RSS',
    url: 'https://www.telemundohouston.com/rss/',
    language: 'es',
    trustScore: 0.85,
    category: 'LOCAL_NEWS',
  },
  {
    name: 'La Voz de Houston',
    platform: 'RSS',
    url: 'https://www.houstonchronicle.com/lavoztx/feed/',
    language: 'es',
    trustScore: 0.80,
    category: 'LOCAL_NEWS',
  },
  {
    name: 'La Prensa de Houston',
    platform: 'RSS',
    url: 'https://laprensadehouston.com/feed/',
    language: 'es',
    trustScore: 0.70,
    category: 'LOCAL_NEWS',
  },
  {
    name: 'El Diario de Houston',
    platform: 'RSS',
    url: 'https://eldiariodehouston.com/feed/',
    language: 'es',
    trustScore: 0.65,
    category: 'LOCAL_NEWS',
  },
  {
    name: 'Hola Houston',
    platform: 'RSS',
    url: 'https://holahouston.com/feed/',
    language: 'es',
    trustScore: 0.60,
    category: 'COMMUNITY',
  },
  {
    name: 'La Raza del Noroeste Houston',
    platform: 'RSS',
    url: 'https://larazadelnoroeste.com/feed/',
    language: 'es',
    trustScore: 0.55,
    category: 'COMMUNITY',
  },

  // --- Texas / Regional Spanish-Language ---
  {
    name: 'El Tiempo Latino',
    platform: 'RSS',
    url: 'https://eltiempolatino.com/feed/',
    language: 'es',
    trustScore: 0.70,
    category: 'REGIONAL_NEWS',
  },
  {
    name: 'Mundo Hispanico',
    platform: 'RSS',
    url: 'https://mundohispanico.com/feed/',
    language: 'es',
    trustScore: 0.70,
    category: 'REGIONAL_NEWS',
  },
  {
    name: 'Telemundo McAllen (KTLM)',
    platform: 'RSS',
    url: 'https://www.telemundomcallen.com/rss/',
    language: 'es',
    trustScore: 0.75,
    category: 'REGIONAL_NEWS',
  },
  {
    name: 'Univision Dallas (KUVN)',
    platform: 'RSS',
    url: 'https://www.univision.com/local/dallas-kuvn/feed',
    language: 'es',
    trustScore: 0.80,
    category: 'REGIONAL_NEWS',
  },

  // --- National Spanish-Language ---
  {
    name: 'Univision Noticias',
    platform: 'RSS',
    url: 'https://www.univision.com/noticias/feed',
    language: 'es',
    trustScore: 0.85,
    category: 'NATIONAL_NEWS',
  },
  {
    name: 'Telemundo Noticias',
    platform: 'RSS',
    url: 'https://www.telemundo.com/noticias/feed',
    language: 'es',
    trustScore: 0.85,
    category: 'NATIONAL_NEWS',
  },
  {
    name: 'CNN en Espanol',
    platform: 'RSS',
    url: 'https://cnnespanol.cnn.com/feed/',
    language: 'es',
    trustScore: 0.90,
    category: 'NATIONAL_NEWS',
  },
  {
    name: 'BBC Mundo',
    platform: 'RSS',
    url: 'https://feeds.bbci.co.uk/mundo/rss.xml',
    language: 'es',
    trustScore: 0.92,
    category: 'INTERNATIONAL_NEWS',
  },

  // --- Wire Services in Spanish ---
  {
    name: 'EFE Noticias',
    platform: 'RSS',
    url: 'https://www.efe.com/efe/espana/portada/rss',
    language: 'es',
    trustScore: 0.90,
    category: 'WIRE_SERVICE',
  },
  {
    name: 'Associated Press en Espanol',
    platform: 'RSS',
    url: 'https://apnews.com/hub/noticias/feed',
    language: 'es',
    trustScore: 0.92,
    category: 'WIRE_SERVICE',
  },
  {
    name: 'Reuters en Espanol',
    platform: 'RSS',
    url: 'https://www.reuters.com/rssFeed/esLatinAmericaNews/',
    language: 'es',
    trustScore: 0.92,
    category: 'WIRE_SERVICE',
  },

  // --- Mexico (covers Texas/border news) ---
  {
    name: 'El Universal',
    platform: 'RSS',
    url: 'https://www.eluniversal.com.mx/rss.xml',
    language: 'es',
    trustScore: 0.80,
    category: 'MEXICO_NEWS',
  },
  {
    name: 'Reforma',
    platform: 'RSS',
    url: 'https://www.reforma.com/rss/portada.xml',
    language: 'es',
    trustScore: 0.80,
    category: 'MEXICO_NEWS',
  },
  {
    name: 'Milenio',
    platform: 'RSS',
    url: 'https://www.milenio.com/rss',
    language: 'es',
    trustScore: 0.75,
    category: 'MEXICO_NEWS',
  },
  {
    name: 'El Norte (Monterrey)',
    platform: 'RSS',
    url: 'https://www.elnorte.com/rss/portada.xml',
    language: 'es',
    trustScore: 0.75,
    category: 'MEXICO_NEWS',
  },

  // --- Spanish-Language Weather/Emergency ---
  {
    name: 'Servicio Nacional de Meteorologia - Houston',
    platform: 'RSS',
    url: 'https://alerts.weather.gov/cap/tx.php?x=1',
    language: 'es',
    trustScore: 0.95,
    category: 'WEATHER_EMERGENCY',
  },
];
