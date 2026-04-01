/**
 * Major US TV station groups with their owned-and-operated stations.
 * Used to bulk-import station websites as RSS/scraper sources.
 *
 * Sources: public FCC filings, station group websites.
 * These are the 10 largest US TV station groups by reach.
 */

export interface StationGroupEntry {
  callSign: string;
  name: string;
  market: string;
  state: string;
  network: string;
  website: string;
  rssUrl?: string;
}

export interface StationGroup {
  groupName: string;
  stations: StationGroupEntry[];
}

export const STATION_GROUPS: StationGroup[] = [
  {
    groupName: "Nexstar Media Group",
    stations: [
      { callSign: "KLAS", name: "8 News Now", market: "Las Vegas", state: "NV", network: "CBS", website: "https://www.8newsnow.com", rssUrl: "https://www.8newsnow.com/feed" },
      { callSign: "WFLA", name: "WFLA News Channel 8", market: "Tampa", state: "FL", network: "NBC", website: "https://www.wfla.com", rssUrl: "https://www.wfla.com/feed" },
      { callSign: "WDAF", name: "FOX4 Kansas City", market: "Kansas City", state: "MO", network: "FOX", website: "https://fox4kc.com", rssUrl: "https://fox4kc.com/feed" },
      { callSign: "KXAN", name: "KXAN Austin", market: "Austin", state: "TX", network: "NBC", website: "https://www.kxan.com", rssUrl: "https://www.kxan.com/feed" },
      { callSign: "WGN-TV", name: "WGN-TV Chicago", market: "Chicago", state: "IL", network: "Ind", website: "https://wgntv.com", rssUrl: "https://wgntv.com/feed" },
      { callSign: "WTVD", name: "ABC11 Raleigh", market: "Raleigh", state: "NC", network: "ABC", website: "https://abc11.com", rssUrl: "https://abc11.com/feed" },
      { callSign: "WOOD", name: "WOOD TV8", market: "Grand Rapids", state: "MI", network: "NBC", website: "https://www.woodtv.com", rssUrl: "https://www.woodtv.com/feed" },
      { callSign: "WRIC", name: "8News Richmond", market: "Richmond", state: "VA", network: "ABC", website: "https://www.wric.com", rssUrl: "https://www.wric.com/feed" },
      { callSign: "WIVB", name: "News 4 Buffalo", market: "Buffalo", state: "NY", network: "CBS", website: "https://www.wivb.com", rssUrl: "https://www.wivb.com/feed" },
      { callSign: "KFOR", name: "KFOR Oklahoma City", market: "Oklahoma City", state: "OK", network: "NBC", website: "https://kfor.com", rssUrl: "https://kfor.com/feed" },
      { callSign: "WREG", name: "WREG Memphis", market: "Memphis", state: "TN", network: "CBS", website: "https://wreg.com", rssUrl: "https://wreg.com/feed" },
      { callSign: "WDSU", name: "WDSU New Orleans", market: "New Orleans", state: "LA", network: "NBC", website: "https://www.wdsu.com", rssUrl: "https://www.wdsu.com/arcio/rss" },
      { callSign: "WLKY", name: "WLKY Louisville", market: "Louisville", state: "KY", network: "CBS", website: "https://www.wlky.com", rssUrl: "https://www.wlky.com/arcio/rss" },
      { callSign: "KOIN", name: "KOIN Portland", market: "Portland", state: "OR", network: "CBS", website: "https://www.koin.com", rssUrl: "https://www.koin.com/feed" },
      { callSign: "WJAR", name: "NBC10 Providence", market: "Providence", state: "RI", network: "NBC", website: "https://turnto10.com", rssUrl: "https://turnto10.com/feed" },
    ],
  },
  {
    groupName: "Sinclair Broadcast Group",
    stations: [
      { callSign: "WBFF", name: "FOX45 Baltimore", market: "Baltimore", state: "MD", network: "FOX", website: "https://foxbaltimore.com", rssUrl: "https://foxbaltimore.com/feed" },
      { callSign: "KOMO", name: "KOMO Seattle", market: "Seattle", state: "WA", network: "ABC", website: "https://komonews.com", rssUrl: "https://komonews.com/feed" },
      { callSign: "WJLA", name: "ABC7 DC", market: "Washington DC", state: "DC", network: "ABC", website: "https://wjla.com", rssUrl: "https://wjla.com/feed" },
      { callSign: "KDNL", name: "ABC30 St. Louis", market: "St. Louis", state: "MO", network: "ABC", website: "https://www.abc30stl.com" },
      { callSign: "WBRC", name: "FOX6 Birmingham", market: "Birmingham", state: "AL", network: "FOX", website: "https://www.wbrc.com", rssUrl: "https://www.wbrc.com/feed" },
      { callSign: "KABB", name: "FOX29 San Antonio", market: "San Antonio", state: "TX", network: "FOX", website: "https://foxsanantonio.com", rssUrl: "https://foxsanantonio.com/feed" },
      { callSign: "WZTV", name: "FOX17 Nashville", market: "Nashville", state: "TN", network: "FOX", website: "https://fox17.com", rssUrl: "https://fox17.com/feed" },
      { callSign: "WTTE", name: "FOX28 Columbus", market: "Columbus", state: "OH", network: "FOX", website: "https://myfox28columbus.com", rssUrl: "https://myfox28columbus.com/feed" },
      { callSign: "WLFL", name: "FOX50 Raleigh", market: "Raleigh", state: "NC", network: "FOX", website: "https://www.fox50.com" },
    ],
  },
  {
    groupName: "Gray Television",
    stations: [
      { callSign: "WVTM", name: "WVTM 13 Birmingham", market: "Birmingham", state: "AL", network: "NBC", website: "https://www.wvtm13.com", rssUrl: "https://www.wvtm13.com/arcio/rss" },
      { callSign: "WSMV", name: "WSMV Nashville", market: "Nashville", state: "TN", network: "NBC", website: "https://www.wsmv.com", rssUrl: "https://www.wsmv.com/feed" },
      { callSign: "WAVE", name: "WAVE3 Louisville", market: "Louisville", state: "KY", network: "NBC", website: "https://www.wave3.com", rssUrl: "https://www.wave3.com/arcio/rss" },
      { callSign: "WMC", name: "WMC5 Memphis", market: "Memphis", state: "TN", network: "NBC", website: "https://www.wmcactionnews5.com", rssUrl: "https://www.wmcactionnews5.com/arcio/rss" },
      { callSign: "WVUE", name: "FOX8 New Orleans", market: "New Orleans", state: "LA", network: "FOX", website: "https://www.fox8live.com", rssUrl: "https://www.fox8live.com/feed" },
      { callSign: "WOIO", name: "CBS19 Cleveland", market: "Cleveland", state: "OH", network: "CBS", website: "https://www.cleveland19.com", rssUrl: "https://www.cleveland19.com/feed" },
      { callSign: "WBNS", name: "10TV Columbus", market: "Columbus", state: "OH", network: "CBS", website: "https://www.10tv.com", rssUrl: "https://www.10tv.com/feeds/syndication/rss/news" },
      { callSign: "WTOL", name: "WTOL11 Toledo", market: "Toledo", state: "OH", network: "CBS", website: "https://www.wtol.com", rssUrl: "https://www.wtol.com/feeds/syndication/rss/news" },
    ],
  },
  {
    groupName: "TEGNA",
    stations: [
      { callSign: "KHOU", name: "KHOU 11 Houston", market: "Houston", state: "TX", network: "CBS", website: "https://www.khou.com", rssUrl: "https://www.khou.com/feeds/syndication/rss/news" },
      { callSign: "WFAA", name: "WFAA Dallas", market: "Dallas-Fort Worth", state: "TX", network: "ABC", website: "https://www.wfaa.com", rssUrl: "https://www.wfaa.com/feeds/syndication/rss/news" },
      { callSign: "KUSA", name: "9NEWS Denver", market: "Denver", state: "CO", network: "NBC", website: "https://www.9news.com", rssUrl: "https://www.9news.com/feeds/syndication/rss/news" },
      { callSign: "KING", name: "KING5 Seattle", market: "Seattle", state: "WA", network: "NBC", website: "https://www.king5.com", rssUrl: "https://www.king5.com/feeds/syndication/rss/news" },
      { callSign: "WXIA", name: "11Alive Atlanta", market: "Atlanta", state: "GA", network: "NBC", website: "https://www.11alive.com", rssUrl: "https://www.11alive.com/feeds/syndication/rss/news" },
      { callSign: "KARE", name: "KARE11 Minneapolis", market: "Minneapolis", state: "MN", network: "NBC", website: "https://www.kare11.com", rssUrl: "https://www.kare11.com/feeds/syndication/rss/news" },
      { callSign: "WHAS", name: "WHAS11 Louisville", market: "Louisville", state: "KY", network: "ABC", website: "https://www.whas11.com", rssUrl: "https://www.whas11.com/feeds/syndication/rss/news" },
      { callSign: "WWL-TV", name: "WWL-TV New Orleans", market: "New Orleans", state: "LA", network: "CBS", website: "https://www.wwltv.com", rssUrl: "https://www.wwltv.com/feeds/syndication/rss/news" },
      { callSign: "WTSP", name: "10Tampa Bay", market: "Tampa", state: "FL", network: "CBS", website: "https://www.wtsp.com", rssUrl: "https://www.wtsp.com/feeds/syndication/rss/news" },
      { callSign: "KSDK", name: "KSDK St. Louis", market: "St. Louis", state: "MO", network: "NBC", website: "https://www.ksdk.com", rssUrl: "https://www.ksdk.com/feeds/syndication/rss/news" },
      { callSign: "WCNC", name: "WCNC Charlotte", market: "Charlotte", state: "NC", network: "NBC", website: "https://www.wcnc.com", rssUrl: "https://www.wcnc.com/feeds/syndication/rss/news" },
      { callSign: "KGW", name: "KGW Portland", market: "Portland", state: "OR", network: "NBC", website: "https://www.kgw.com", rssUrl: "https://www.kgw.com/feeds/syndication/rss/news" },
      { callSign: "WKYC", name: "WKYC Cleveland", market: "Cleveland", state: "OH", network: "NBC", website: "https://www.wkyc.com", rssUrl: "https://www.wkyc.com/feeds/syndication/rss/news" },
    ],
  },
  {
    groupName: "Hearst Television",
    stations: [
      { callSign: "WCVB", name: "WCVB Boston", market: "Boston", state: "MA", network: "ABC", website: "https://www.wcvb.com", rssUrl: "https://www.wcvb.com/arcio/rss" },
      { callSign: "WISN-TV", name: "WISN12 Milwaukee", market: "Milwaukee", state: "WI", network: "ABC", website: "https://www.wisn.com", rssUrl: "https://www.wisn.com/arcio/rss" },
      { callSign: "WBAL-TV", name: "WBAL-TV Baltimore", market: "Baltimore", state: "MD", network: "NBC", website: "https://www.wbaltv.com", rssUrl: "https://www.wbaltv.com/arcio/rss" },
      { callSign: "WESH", name: "WESH Orlando", market: "Orlando", state: "FL", network: "NBC", website: "https://www.wesh.com", rssUrl: "https://www.wesh.com/arcio/rss" },
      { callSign: "KOCO", name: "KOCO Oklahoma City", market: "Oklahoma City", state: "OK", network: "ABC", website: "https://www.koco.com", rssUrl: "https://www.koco.com/arcio/rss" },
      { callSign: "WLWT", name: "WLWT Cincinnati", market: "Cincinnati", state: "OH", network: "NBC", website: "https://www.wlwt.com", rssUrl: "https://www.wlwt.com/arcio/rss" },
      { callSign: "WTAE", name: "WTAE Pittsburgh", market: "Pittsburgh", state: "PA", network: "ABC", website: "https://www.wtae.com", rssUrl: "https://www.wtae.com/arcio/rss" },
      { callSign: "KMBC", name: "KMBC Kansas City", market: "Kansas City", state: "MO", network: "ABC", website: "https://www.kmbc.com", rssUrl: "https://www.kmbc.com/arcio/rss" },
      { callSign: "WDIV", name: "Local4 Detroit", market: "Detroit", state: "MI", network: "NBC", website: "https://www.clickondetroit.com", rssUrl: "https://www.clickondetroit.com/arcio/rss" },
      { callSign: "KCRA", name: "KCRA Sacramento", market: "Sacramento", state: "CA", network: "NBC", website: "https://www.kcra.com", rssUrl: "https://www.kcra.com/arcio/rss" },
      { callSign: "WPXI", name: "WPXI Pittsburgh", market: "Pittsburgh", state: "PA", network: "NBC", website: "https://www.wpxi.com", rssUrl: "https://www.wpxi.com/arcio/rss" },
    ],
  },
  {
    groupName: "Scripps (E.W. Scripps)",
    stations: [
      { callSign: "WFTS", name: "ABC Action News Tampa", market: "Tampa", state: "FL", network: "ABC", website: "https://www.abcactionnews.com", rssUrl: "https://www.abcactionnews.com/feed" },
      { callSign: "WCPO", name: "WCPO Cincinnati", market: "Cincinnati", state: "OH", network: "ABC", website: "https://www.wcpo.com", rssUrl: "https://www.wcpo.com/feed" },
      { callSign: "WEWS", name: "News5 Cleveland", market: "Cleveland", state: "OH", network: "ABC", website: "https://www.news5cleveland.com", rssUrl: "https://www.news5cleveland.com/feed" },
      { callSign: "KMGH", name: "Denver7", market: "Denver", state: "CO", network: "ABC", website: "https://www.denver7.com", rssUrl: "https://www.denver7.com/feed" },
      { callSign: "WRTV", name: "WRTV Indianapolis", market: "Indianapolis", state: "IN", network: "ABC", website: "https://www.wrtv.com", rssUrl: "https://www.wrtv.com/feed" },
      { callSign: "KSHB", name: "KSHB41 Kansas City", market: "Kansas City", state: "MO", network: "NBC", website: "https://www.kshb.com", rssUrl: "https://www.kshb.com/feed" },
      { callSign: "WMAR", name: "WMAR Baltimore", market: "Baltimore", state: "MD", network: "ABC", website: "https://www.wmar2news.com", rssUrl: "https://www.wmar2news.com/feed" },
      { callSign: "KNXV", name: "ABC15 Phoenix", market: "Phoenix", state: "AZ", network: "ABC", website: "https://www.abc15.com", rssUrl: "https://www.abc15.com/feed" },
      { callSign: "WXYZ", name: "WXYZ Detroit", market: "Detroit", state: "MI", network: "ABC", website: "https://www.wxyz.com", rssUrl: "https://www.wxyz.com/feed" },
      { callSign: "WTKR", name: "News3 Virginia Beach", market: "Virginia Beach", state: "VA", network: "CBS", website: "https://www.wtkr.com", rssUrl: "https://www.wtkr.com/feed" },
    ],
  },
  {
    groupName: "Fox Television Stations",
    stations: [
      { callSign: "WNYW", name: "FOX5 New York", market: "New York", state: "NY", network: "FOX", website: "https://www.fox5ny.com", rssUrl: "https://www.fox5ny.com/feed" },
      { callSign: "KTTV", name: "FOX11 Los Angeles", market: "Los Angeles", state: "CA", network: "FOX", website: "https://www.foxla.com", rssUrl: "https://www.foxla.com/feed" },
      { callSign: "WFLD", name: "FOX32 Chicago", market: "Chicago", state: "IL", network: "FOX", website: "https://www.fox32chicago.com", rssUrl: "https://www.fox32chicago.com/feed" },
      { callSign: "KDFW", name: "FOX4 Dallas", market: "Dallas-Fort Worth", state: "TX", network: "FOX", website: "https://www.fox4news.com", rssUrl: "https://www.fox4news.com/feed" },
      { callSign: "KRIV", name: "FOX26 Houston", market: "Houston", state: "TX", network: "FOX", website: "https://www.fox26houston.com", rssUrl: "https://www.fox26houston.com/feed" },
      { callSign: "WTTG", name: "FOX5 DC", market: "Washington DC", state: "DC", network: "FOX", website: "https://www.fox5dc.com", rssUrl: "https://www.fox5dc.com/feed" },
      { callSign: "WTXF", name: "FOX29 Philadelphia", market: "Philadelphia", state: "PA", network: "FOX", website: "https://www.fox29.com", rssUrl: "https://www.fox29.com/feed" },
      { callSign: "WAGA", name: "FOX5 Atlanta", market: "Atlanta", state: "GA", network: "FOX", website: "https://www.fox5atlanta.com", rssUrl: "https://www.fox5atlanta.com/feed" },
      { callSign: "KSAZ", name: "FOX10 Phoenix", market: "Phoenix", state: "AZ", network: "FOX", website: "https://www.fox10phoenix.com", rssUrl: "https://www.fox10phoenix.com/feed" },
      { callSign: "WJBK", name: "FOX2 Detroit", market: "Detroit", state: "MI", network: "FOX", website: "https://www.fox2detroit.com", rssUrl: "https://www.fox2detroit.com/feed" },
      { callSign: "KMSP", name: "FOX9 Minneapolis", market: "Minneapolis", state: "MN", network: "FOX", website: "https://www.fox9.com", rssUrl: "https://www.fox9.com/feed" },
      { callSign: "WTVT", name: "FOX13 Tampa", market: "Tampa", state: "FL", network: "FOX", website: "https://www.fox13news.com", rssUrl: "https://www.fox13news.com/feed" },
      { callSign: "KTBC", name: "FOX7 Austin", market: "Austin", state: "TX", network: "FOX", website: "https://www.fox7austin.com", rssUrl: "https://www.fox7austin.com/feed" },
      { callSign: "WOFL", name: "FOX35 Orlando", market: "Orlando", state: "FL", network: "FOX", website: "https://www.fox35orlando.com", rssUrl: "https://www.fox35orlando.com/feed" },
    ],
  },
];

/** Total station count across all groups */
export const TOTAL_STATIONS = STATION_GROUPS.reduce((sum, g) => sum + g.stations.length, 0);
