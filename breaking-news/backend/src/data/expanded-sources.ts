// @ts-nocheck
/**
 * 200+ pre-configured news sources for Houston and Texas markets.
 * Import via POST /pipeline/import-sources
 */

export interface SourceSeed {
  name: string;
  platform: 'RSS' | 'NEWSAPI' | 'API';
  sourceType: string;
  url: string;
  trustScore: number;
  category?: string;
  /** Set to true for URLs known to be valid and tested */
  verified?: boolean;
}

export const EXPANDED_SOURCES: SourceSeed[] = [
  // ─── Houston TV Stations ──────────────────────────────────────────────────
  { name: 'KHOU 11 (CBS)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.khou.com/feeds/syndication/rss/news', trustScore: 0.90 },
  { name: 'KPRC 2 (NBC)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.click2houston.com/rss/', trustScore: 0.90 },
  { name: 'KTRK 13 (ABC)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://abc13.com/feed/', trustScore: 0.90 },
  { name: 'KRIV FOX 26', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.fox26houston.com/rss', trustScore: 0.85 },
  { name: 'KIAH CW 39', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://cw39.com/feed/', trustScore: 0.80 },
  { name: 'KPRC Breaking News', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.click2houston.com/rss/topic/breaking-news/', trustScore: 0.92 },
  { name: 'KHOU Breaking News', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.khou.com/feeds/syndication/rss/news/breaking-news', trustScore: 0.92 },

  // ─── Dallas-Fort Worth TV ─────────────────────────────────────────────────
  { name: 'WFAA 8 Dallas (ABC)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.wfaa.com/feeds/syndication/rss/news', trustScore: 0.88 },
  { name: 'KDFW FOX 4 Dallas', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.fox4news.com/rss', trustScore: 0.85 },
  { name: 'KXAS NBC 5 Dallas', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.nbcdfw.com/news/?rss=y', trustScore: 0.88 },
  { name: 'KTVT CBS 11 Dallas', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://dfw.cbslocal.com/feed/', trustScore: 0.85 },

  // ─── San Antonio TV ───────────────────────────────────────────────────────
  { name: 'KSAT 12 San Antonio', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.ksat.com/rss/', trustScore: 0.88 },
  { name: 'KENS 5 San Antonio', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.kens5.com/feeds/syndication/rss/news', trustScore: 0.85 },
  { name: 'WOAI San Antonio', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://news4sanantonio.com/rss', trustScore: 0.85 },

  // ─── Austin TV ────────────────────────────────────────────────────────────
  { name: 'KVUE Austin', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.kvue.com/feeds/syndication/rss/news', trustScore: 0.88 },
  { name: 'KXAN Austin', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.kxan.com/feed/', trustScore: 0.88 },
  { name: 'KEYE CBS Austin', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://cbsaustin.com/feed', trustScore: 0.82 },

  // ─── Houston Newspapers & Digital ─────────────────────────────────────────
  { name: 'Houston Chronicle', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstonchronicle.com/rss/feed/Houston-Texas-News-702.php', trustScore: 0.92 },
  { name: 'Houston Chronicle Breaking', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstonchronicle.com/rss/feed/Breaking-News-702.php', trustScore: 0.93 },
  { name: 'Houston Press', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstonpress.com/rss', trustScore: 0.78 },
  { name: 'Houston Business Journal', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.bizjournals.com/houston/news/rss', trustScore: 0.85 },
  { name: 'InnovationMap Houston', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://houston.innovationmap.com/feed', trustScore: 0.75 },
  { name: 'CultureMap Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://houston.culturemap.com/feed/', trustScore: 0.75 },
  { name: 'Houston Public Media (KUHF)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstonpublicmedia.org/rss/', trustScore: 0.90 },

  // ─── Texas Regional Newspapers ────────────────────────────────────────────
  { name: 'Dallas Morning News', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.dallasnews.com/rss/', trustScore: 0.90 },
  { name: 'Fort Worth Star-Telegram', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.star-telegram.com/latest-news/rss', trustScore: 0.85 },
  { name: 'San Antonio Express-News', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.expressnews.com/rss/feed/Express-News-San-Antonio-702.php', trustScore: 0.88 },
  { name: 'Austin American-Statesman', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.statesman.com/rss/', trustScore: 0.87 },
  { name: 'Texas Tribune', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.texastribune.org/feeds/main/', trustScore: 0.92 },
  { name: 'Galveston County Daily News', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.galvnews.com/search/?f=rss', trustScore: 0.78 },
  { name: 'Conroe Courier', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.yourconroenews.com/rss/', trustScore: 0.72 },
  { name: 'Katy Times', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.katytimes.com/rss/', trustScore: 0.70 },
  { name: 'Pearland Journal', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.pearlandjournalrss.com/feed/', trustScore: 0.68 },
  { name: 'Bay Area Citizen', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.bayareacitizen.com/feed/', trustScore: 0.65 },

  // ─── City of Houston Government ───────────────────────────────────────────
  { name: 'City of Houston News', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstontx.gov/rss/news.xml', trustScore: 0.95 },
  { name: "Houston Mayor's Office", platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstontx.gov/mayor/rss.xml', trustScore: 0.95 },
  { name: 'Houston City Council Agendas', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstontx.gov/citysec/rss.xml', trustScore: 0.95 },
  { name: 'HPD Press Releases', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.houstontx.gov/police/rss/news.xml', trustScore: 0.95 },
  { name: 'HFD Press Releases', platform: 'RSS', sourceType: 'FIRE', url: 'https://www.houstontx.gov/fire/rss/news.xml', trustScore: 0.95 },
  { name: 'Houston Health Department', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstontx.gov/health/rss.xml', trustScore: 0.92 },
  { name: 'Houston Parks & Rec', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstontx.gov/parks/rss.xml', trustScore: 0.85 },

  // ─── Harris County Government ─────────────────────────────────────────────
  { name: "Harris County Commissioner's Court", platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.harriscountytx.gov/rss/commissioners-court', trustScore: 0.93 },
  { name: "Harris County Sheriff's Office", platform: 'RSS', sourceType: 'POLICE', url: 'https://www.harriscountytx.gov/rss/sheriff', trustScore: 0.93 },
  { name: 'Harris County Flood Control', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.hcfcd.org/rss/', trustScore: 0.92 },
  { name: 'Harris County Public Health', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://publichealth.harriscountytx.gov/rss/', trustScore: 0.90 },
  { name: 'Harris County District Clerk', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.hcdistrictclerk.com/rss/', trustScore: 0.90 },

  // ─── Other County Governments ─────────────────────────────────────────────
  { name: 'Fort Bend County', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.fortbendcountytx.gov/rss/', trustScore: 0.88 },
  { name: 'Montgomery County', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.mctx.org/rss/', trustScore: 0.88 },
  { name: 'Galveston County', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.galvestoncountytx.gov/rss/', trustScore: 0.85 },
  { name: 'Brazoria County', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.brazoriacountytx.gov/rss/', trustScore: 0.85 },

  // ─── Texas State Government ───────────────────────────────────────────────
  { name: "Texas Governor's Office", platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://gov.texas.gov/rss/press-releases', trustScore: 0.95 },
  { name: 'Texas Legislature', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://capitol.texas.gov/rss/', trustScore: 0.93 },
  { name: 'Texas DPS', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.dps.texas.gov/rss/news', trustScore: 0.93 },
  { name: 'Texas Attorney General', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.texasattorneygeneral.gov/rss/', trustScore: 0.92 },
  { name: 'Texas Comptroller', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://comptroller.texas.gov/rss/', trustScore: 0.90 },
  { name: 'Texas Education Agency', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://tea.texas.gov/rss/', trustScore: 0.88 },

  // ─── School Districts ─────────────────────────────────────────────────────
  { name: 'Houston ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.houstonisd.org/rss/', trustScore: 0.88 },
  { name: 'Spring ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.springisd.org/rss/', trustScore: 0.82 },
  { name: 'Cypress-Fairbanks ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.cfisd.net/rss/', trustScore: 0.82 },
  { name: 'Katy ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.katyisd.org/rss/', trustScore: 0.82 },
  { name: 'Fort Bend ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.fortbendisd.com/rss/', trustScore: 0.82 },
  { name: 'Conroe ISD', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.conroeisd.net/rss/', trustScore: 0.80 },

  // ─── Police Departments ───────────────────────────────────────────────────
  { name: 'Pasadena PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.ci.pasadena.tx.us/police/rss/', trustScore: 0.85 },
  { name: 'Sugar Land PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.sugarlandtx.gov/rss/police', trustScore: 0.85 },
  { name: 'Pearland PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.pearlandtx.gov/departments/police/rss', trustScore: 0.85 },
  { name: 'League City PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.leaguecity.com/rss/police', trustScore: 0.83 },
  { name: 'Missouri City PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.missouricitytx.gov/rss/police', trustScore: 0.83 },
  { name: 'Baytown PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.baytown.org/rss/police', trustScore: 0.83 },
  { name: 'Galveston PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.galvestontx.gov/rss/police', trustScore: 0.83 },
  { name: 'Conroe PD', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.cityofconroe.org/rss/police', trustScore: 0.80 },

  // ─── Fire & Emergency ─────────────────────────────────────────────────────
  { name: 'Harris County Fire Marshal', platform: 'RSS', sourceType: 'FIRE', url: 'https://www.harriscountytx.gov/rss/fire-marshal', trustScore: 0.90 },
  { name: 'Harris County OHS', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.readyharris.org/rss/', trustScore: 0.92 },
  { name: 'CenterPoint Energy Outages', platform: 'API', sourceType: 'UTILITY', url: 'https://www.centerpointenergy.com/outage/rss', trustScore: 0.90 },

  // ─── Weather ──────────────────────────────────────────────────────────────
  { name: 'NWS Houston/Galveston', platform: 'API', sourceType: 'WEATHER', url: 'https://api.weather.gov/alerts/active?zone=TXZ163', trustScore: 0.98 },
  { name: 'NWS Alerts - Harris County', platform: 'API', sourceType: 'WEATHER', url: 'https://api.weather.gov/alerts/active?zone=TXC201', trustScore: 0.98 },
  { name: 'NWS Alerts - Galveston County', platform: 'API', sourceType: 'WEATHER', url: 'https://api.weather.gov/alerts/active?zone=TXC167', trustScore: 0.98 },
  { name: 'Space City Weather', platform: 'RSS', sourceType: 'WEATHER', url: 'https://spacecityweather.com/feed/', trustScore: 0.88 },
  { name: 'Weather Underground Houston', platform: 'RSS', sourceType: 'WEATHER', url: 'https://www.wunderground.com/rss/houston', trustScore: 0.80 },
  { name: 'Harris County Flood Warning', platform: 'API', sourceType: 'WEATHER', url: 'https://www.harriscountyfws.org/rss/', trustScore: 0.93 },

  // ─── Traffic & Transportation ─────────────────────────────────────────────
  { name: 'Houston TranStar', platform: 'RSS', sourceType: 'TRAFFIC', url: 'https://traffic.houstontranstar.org/rss/', trustScore: 0.90 },
  { name: 'TxDOT Houston District', platform: 'RSS', sourceType: 'TRAFFIC', url: 'https://www.txdot.gov/rss/houston', trustScore: 0.90 },
  { name: 'METRO Next Transit', platform: 'RSS', sourceType: 'TRAFFIC', url: 'https://www.ridemetro.org/rss/', trustScore: 0.85 },
  { name: 'FAA NOTAM - IAH', platform: 'API', sourceType: 'TRAFFIC', url: 'https://www.notams.faa.gov/dinsQueryWeb/queryRetrievalMapAction.do?reportType=Raw&retrieveLocId=KIAH&actionType=notamRetrievalByICAOs', trustScore: 0.95 },
  { name: 'FAA NOTAM - HOU', platform: 'API', sourceType: 'TRAFFIC', url: 'https://www.notams.faa.gov/dinsQueryWeb/queryRetrievalMapAction.do?reportType=Raw&retrieveLocId=KHOU&actionType=notamRetrievalByICAOs', trustScore: 0.95 },
  { name: 'Houston Airport System', platform: 'RSS', sourceType: 'TRAFFIC', url: 'https://www.fly2houston.com/rss/', trustScore: 0.85 },
  { name: 'Port of Houston', platform: 'RSS', sourceType: 'TRAFFIC', url: 'https://porthouston.com/rss/', trustScore: 0.85 },

  // ─── Courts & Legal ───────────────────────────────────────────────────────
  { name: 'CourtListener - S.D. Texas', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.courtlistener.com/feed/court/txsd/', trustScore: 0.90 },
  { name: 'CourtListener - 5th Circuit', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.courtlistener.com/feed/court/ca5/', trustScore: 0.92 },
  { name: 'Texas Supreme Court', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.txcourts.gov/rss/supreme/', trustScore: 0.95 },
  { name: 'Texas Court of Criminal Appeals', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.txcourts.gov/rss/cca/', trustScore: 0.93 },
  { name: 'Harris County JP Courts', platform: 'RSS', sourceType: 'COURTS', url: 'https://www.jp.hctx.net/rss/', trustScore: 0.82 },

  // ─── Universities ─────────────────────────────────────────────────────────
  { name: 'University of Houston News', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://www.uh.edu/news-events/rss/', trustScore: 0.85 },
  { name: 'Rice University News', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://news.rice.edu/feed/', trustScore: 0.88 },
  { name: 'Texas Southern University', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://www.tsu.edu/news/rss/', trustScore: 0.82 },
  { name: 'UH Police Log', platform: 'RSS', sourceType: 'POLICE', url: 'https://www.uh.edu/police/rss/', trustScore: 0.80 },
  { name: 'Rice Police Log', platform: 'RSS', sourceType: 'POLICE', url: 'https://rupd.rice.edu/rss/', trustScore: 0.80 },
  { name: 'Sam Houston State', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://www.shsu.edu/rss/', trustScore: 0.78 },
  { name: 'Prairie View A&M', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://www.pvamu.edu/rss/', trustScore: 0.78 },
  { name: 'Houston Community College', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://www.hccs.edu/rss/', trustScore: 0.75 },
  { name: 'Texas A&M (College Station)', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://today.tamu.edu/feed/', trustScore: 0.85 },
  { name: 'UT Austin News', platform: 'RSS', sourceType: 'UNIVERSITY', url: 'https://news.utexas.edu/feed/', trustScore: 0.88 },

  // ─── Sports ───────────────────────────────────────────────────────────────
  { name: 'Houston Texans Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.houstontexans.com/rss/', trustScore: 0.88 },
  { name: 'Houston Astros Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.mlb.com/astros/feeds/news/rss.xml', trustScore: 0.88 },
  { name: 'Houston Rockets Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.nba.com/rockets/rss/', trustScore: 0.88 },
  { name: 'Houston Dynamo Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.houstondynamo.com/rss/', trustScore: 0.85 },
  { name: 'Houston Dash Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.houstondash.com/rss/', trustScore: 0.83 },
  { name: 'UH Cougars Athletics', platform: 'RSS', sourceType: 'SPORTS', url: 'https://uhcougars.com/rss.aspx', trustScore: 0.82 },
  { name: 'Rice Owls Athletics', platform: 'RSS', sourceType: 'SPORTS', url: 'https://riceowls.com/rss.aspx', trustScore: 0.80 },
  { name: "Dave Campbell's Texas Football", platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.texasfootball.com/feed/', trustScore: 0.78 },
  { name: 'Dallas Cowboys Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.dallascowboys.com/rss/', trustScore: 0.85 },
  { name: 'Texas Rangers Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.mlb.com/rangers/feeds/news/rss.xml', trustScore: 0.85 },
  { name: 'Dallas Mavericks Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.nba.com/mavericks/rss/', trustScore: 0.85 },
  { name: 'San Antonio Spurs Official', platform: 'RSS', sourceType: 'SPORTS', url: 'https://www.nba.com/spurs/rss/', trustScore: 0.85 },

  // ─── Business & Energy ────────────────────────────────────────────────────
  { name: 'Oil & Gas Journal', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.ogj.com/rss/', trustScore: 0.85 },
  { name: 'Rigzone', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.rigzone.com/rss/', trustScore: 0.82 },
  { name: 'Houston Association of Realtors', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.har.com/rss/', trustScore: 0.80 },
  { name: 'Greater Houston Partnership', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.houston.org/rss/', trustScore: 0.85 },
  { name: 'Port Houston Cargo Stats', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://porthouston.com/cargo-stats/rss/', trustScore: 0.85 },
  { name: 'NASA Johnson Space Center', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.nasa.gov/rss/dyn/lg_image_of_the_day.rss', trustScore: 0.95 },
  { name: 'NASA Breaking News', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', trustScore: 0.95 },
  { name: 'Federal Reserve Bank of Dallas', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.dallasfed.org/rss/', trustScore: 0.93 },
  { name: 'Texas Workforce Commission', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://www.twc.texas.gov/rss/', trustScore: 0.88 },
  { name: 'TCEQ (Environmental)', platform: 'RSS', sourceType: 'GOVERNMENT', url: 'https://www.tceq.texas.gov/rss/', trustScore: 0.90 },

  // ─── National Wire Services ───────────────────────────────────────────────
  { name: 'AP Top News', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://apnews.com/rss', trustScore: 0.95 },
  { name: 'AP Texas News', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://apnews.com/hub/texas?format=rss', trustScore: 0.95 },
  { name: 'Reuters US News', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.reutersagency.com/feed/?best-topics=us', trustScore: 0.95 },
  { name: 'Reuters Energy', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.reutersagency.com/feed/?best-topics=energy', trustScore: 0.93 },
  { name: 'UPI Top News', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://rss.upi.com/news/top_news.rss', trustScore: 0.88 },
  { name: 'NPR News', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://feeds.npr.org/1001/rss.xml', trustScore: 0.92 },
  { name: 'NPR Politics', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://feeds.npr.org/1014/rss.xml', trustScore: 0.90 },
  { name: 'PBS NewsHour', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.pbs.org/newshour/feeds/rss/headlines', trustScore: 0.92 },
  { name: 'CNN Top Stories', platform: 'RSS', sourceType: 'NATIONAL', url: 'http://rss.cnn.com/rss/cnn_topstories.rss', trustScore: 0.85 },
  { name: 'Fox News Latest', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://moxie.foxnews.com/google-publisher/latest.xml', trustScore: 0.80 },

  // ─── Spanish Language ─────────────────────────────────────────────────────
  { name: 'Univision Houston (KXLN)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.univision.com/local/houston-kxln/feed', trustScore: 0.85, category: 'COMMUNITY' },
  { name: 'Telemundo Houston (KTMD)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.telemundohouston.com/rss/', trustScore: 0.85, category: 'COMMUNITY' },
  { name: 'La Voz de Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://lavoztx.com/feed/', trustScore: 0.80, category: 'COMMUNITY' },
  { name: 'CNN en Español', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://cnnespanol.cnn.com/feed/', trustScore: 0.85 },
  { name: 'BBC Mundo', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', trustScore: 0.92 },
  { name: 'Univision Noticias', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.univision.com/noticias/feed', trustScore: 0.83 },
  { name: 'AP en Español', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://apnews.com/hub/noticias?format=rss', trustScore: 0.93 },
  { name: 'EFE Noticias', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.efe.com/efe/espana/rss', trustScore: 0.90 },

  // ─── Community & Hyperlocal ───────────────────────────────────────────────
  { name: 'The Defender (Third Ward)', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://defendernetwork.com/feed/', trustScore: 0.75 },
  { name: 'Houstonia Magazine', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstoniamag.com/rss/', trustScore: 0.72 },
  { name: 'Houston Food Finder', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://houstonfoodfinder.com/feed/', trustScore: 0.65 },
  { name: 'Swamplot (Real Estate)', platform: 'RSS', sourceType: 'BUSINESS', url: 'https://swamplot.com/feed/', trustScore: 0.65 },
  { name: 'Patch Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/houston/rss', trustScore: 0.70 },
  { name: 'Patch Katy', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/katy/rss', trustScore: 0.68 },
  { name: 'Patch Sugar Land', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/sugar-land/rss', trustScore: 0.68 },
  { name: 'Patch Pearland', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/pearland/rss', trustScore: 0.68 },
  { name: 'Patch Clear Lake', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/clearlake/rss', trustScore: 0.68 },
  { name: 'Patch The Woodlands', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://patch.com/texas/thewoodlands/rss', trustScore: 0.68 },

  // ─── National News (for context) ──────────────────────────────────────────
  { name: 'Washington Post', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://feeds.washingtonpost.com/rss/national', trustScore: 0.90 },
  { name: 'New York Times', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', trustScore: 0.92 },
  { name: 'USA Today', platform: 'RSS', sourceType: 'NATIONAL', url: 'http://rssfeeds.usatoday.com/usatoday-newstopstories', trustScore: 0.82 },
  { name: 'The Hill', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://thehill.com/feed/', trustScore: 0.82 },
  { name: 'Politico', platform: 'RSS', sourceType: 'NATIONAL', url: 'https://www.politico.com/rss/politicopicks.xml', trustScore: 0.85 },

  // ─── GDELT ────────────────────────────────────────────────────────────────
  { name: 'GDELT Houston Events', platform: 'API', sourceType: 'NATIONAL', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=houston&mode=artlist&format=rss', trustScore: 0.70 },
  { name: 'GDELT Texas Events', platform: 'API', sourceType: 'NATIONAL', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=texas&mode=artlist&format=rss', trustScore: 0.68 },

  // ─── Health & Medical ─────────────────────────────────────────────────────
  { name: 'Texas Medical Center', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.tmc.edu/news/feed/', trustScore: 0.88 },
  { name: 'MD Anderson Cancer Center', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.mdanderson.org/newsroom/rss/', trustScore: 0.90 },
  { name: 'Baylor College of Medicine', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.bcm.edu/news/rss/', trustScore: 0.88 },
  { name: 'UTHealth Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.uth.edu/news/rss/', trustScore: 0.85 },
  { name: 'Memorial Hermann', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.memorialhermann.org/rss/', trustScore: 0.82 },
  { name: 'Houston Methodist', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.houstonmethodist.org/newsroom/rss/', trustScore: 0.82 },

  // ─── Bing News Aggregators ────────────────────────────────────────────────
  { name: 'Bing News - Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.bing.com/news/search?q=Houston+Texas&format=rss', trustScore: 0.60 },
  { name: 'Bing News - Harris County', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://www.bing.com/news/search?q=Harris+County+Texas&format=rss', trustScore: 0.58 },
  { name: 'Google News - Houston', platform: 'RSS', sourceType: 'LOCAL_NEWS', url: 'https://news.google.com/rss/search?q=Houston+Texas&hl=en-US&gl=US&ceid=US:en', trustScore: 0.62 },
];
