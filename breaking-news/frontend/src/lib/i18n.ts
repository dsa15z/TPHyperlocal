type Locale = 'en' | 'es';

interface Translations {
  [key: string]: string;
}

const translations: Record<Locale, Translations> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.bookmarks': 'Bookmarks',
    'nav.smartPulses': 'Smart Pulses',
    'nav.showPrep': 'Show Prep',
    'nav.assignments': 'Assignments',
    'nav.briefings': 'Shift Briefings',
    'nav.alerts': 'Public Alerts',
    'nav.analytics': 'Analytics',
    'nav.feeds': 'RSS Feeds',
    'nav.radio': 'RadioGPT',
    'nav.stocks': 'Market Movers',
    'nav.topics': 'Topic Clusters',
    'nav.settings': 'News Profile',
    'nav.notifications': 'Alert Settings',
    'nav.reporters': 'Reporters',
    'nav.publish': 'Publish Queue',
    'nav.lineup': 'Show Lineup',
    'nav.predictions': 'Predictions',
    'nav.beatAlerts': 'Beat Alerts',
    'nav.deadlines': 'Deadlines',
    'nav.video': 'Video Studio',
    'dashboard.title': 'Breaking News Intelligence',
    'dashboard.live': 'LIVE',
    'dashboard.storiesFound': '{count} stories found',
    'dashboard.loading': 'Loading stories...',
    'dashboard.scanning': 'Scanning for breaking news...',
    'filter.search': 'Search stories...',
    'filter.allCategories': 'All Categories',
    'filter.allStatuses': 'All Statuses',
    'filter.allSources': 'All Sources',
    'filter.allTrends': 'All Trends',
    'filter.rising': 'Rising',
    'filter.declining': 'Declining',
    'filter.minScore': 'Min Score',
    'filter.gapsOnly': 'Gaps Only',
    'filter.clear': 'Clear',
    'story.firstSeen': 'First seen',
    'story.lastUpdated': 'Last updated',
    'story.sources': 'sources',
    'story.aiSummary': 'AI Source Summary',
    'story.generating': 'Generating...',
    'story.regenerate': 'Regenerate',
    'time.justNow': 'just now',
    'time.minsAgo': '{n}m ago',
    'status.ALERT': 'ALERT',
    'status.BREAKING': 'BREAKING',
    'status.DEVELOPING': 'DEVELOPING',
    'status.TOP_STORY': 'TOP STORY',
    'status.ONGOING': 'ONGOING',
    'status.FOLLOW_UP': 'FOLLOW UP',
    'status.STALE': 'STALE',
    'status.ARCHIVED': 'ARCHIVED',
  },
  es: {
    'nav.dashboard': 'Panel Principal',
    'nav.bookmarks': 'Marcadores',
    'nav.smartPulses': 'Pulsos Inteligentes',
    'nav.showPrep': 'Preparación de Show',
    'nav.assignments': 'Asignaciones',
    'nav.briefings': 'Informes de Turno',
    'nav.alerts': 'Alertas Públicas',
    'nav.analytics': 'Analítica',
    'nav.feeds': 'Fuentes RSS',
    'nav.radio': 'RadioGPT',
    'nav.stocks': 'Mercados',
    'nav.topics': 'Temas Agrupados',
    'nav.settings': 'Perfil de Noticias',
    'nav.notifications': 'Config. de Alertas',
    'nav.reporters': 'Reporteros',
    'nav.publish': 'Cola de Publicación',
    'nav.lineup': 'Orden del Show',
    'nav.predictions': 'Predicciones',
    'nav.beatAlerts': 'Alertas de Cobertura',
    'nav.deadlines': 'Fechas Límite',
    'nav.video': 'Estudio de Video',
    'dashboard.title': 'Inteligencia de Noticias de Última Hora',
    'dashboard.live': 'EN VIVO',
    'dashboard.storiesFound': '{count} noticias encontradas',
    'dashboard.loading': 'Cargando noticias...',
    'dashboard.scanning': 'Buscando noticias de última hora...',
    'filter.search': 'Buscar noticias...',
    'filter.allCategories': 'Todas las Categorías',
    'filter.allStatuses': 'Todos los Estados',
    'filter.allSources': 'Todas las Fuentes',
    'filter.allTrends': 'Todas las Tendencias',
    'filter.rising': 'En Alza',
    'filter.declining': 'En Baja',
    'filter.minScore': 'Puntaje Mínimo',
    'filter.gapsOnly': 'Solo Brechas',
    'filter.clear': 'Limpiar',
    'story.firstSeen': 'Visto por primera vez',
    'story.lastUpdated': 'Última actualización',
    'story.sources': 'fuentes',
    'story.aiSummary': 'Resumen IA de Fuentes',
    'story.generating': 'Generando...',
    'story.regenerate': 'Regenerar',
    'time.justNow': 'ahora mismo',
    'time.minsAgo': 'hace {n}m',
    'status.ALERT': 'ALERTA',
    'status.BREAKING': 'ÚLTIMA HORA',
    'status.DEVELOPING': 'EN DESARROLLO',
    'status.TOP_STORY': 'NOTICIA PRINCIPAL',
    'status.ONGOING': 'EN CURSO',
    'status.FOLLOW_UP': 'SEGUIMIENTO',
    'status.STALE': 'OBSOLETO',
    'status.ARCHIVED': 'ARCHIVADO',
  },
};

export function t(key: string, locale: Locale = 'en', params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] || translations.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('bn_locale') as Locale) || 'en';
}

export function setLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('bn_locale', locale);
}

export type { Locale };
export { translations };
