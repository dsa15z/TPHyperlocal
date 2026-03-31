export interface MSAStation {
  callSign: string;
  name: string;
  network?: string;
  format?: string;
  website: string;
  rssUrl?: string;
}

export interface MSAData {
  name: string;
  slug: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  timezone: string;
  keywords: string[];
  neighborhoods: string[];
  tvStations: MSAStation[];
  radioStations: MSAStation[];
}

export const MSA_DATABASE: MSAData[] = [
  {
    name: "New York", slug: "new-york", state: "NY", latitude: 40.7128, longitude: -74.0060, radiusKm: 50, timezone: "America/New_York",
    keywords: ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island", "new york city", "long island", "westchester", "new jersey", "newark", "jersey city"],
    neighborhoods: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Harlem", "SoHo", "Tribeca", "Chelsea", "Greenwich Village", "East Village", "Upper West Side", "Upper East Side", "Midtown", "Lower East Side", "Williamsburg", "Park Slope", "Astoria", "Flushing", "Long Island City", "DUMBO", "Bushwick", "Bed-Stuy", "Crown Heights", "Jackson Heights"],
    tvStations: [
      { callSign: "WCBS", name: "CBS New York", network: "CBS", website: "https://www.cbsnews.com/newyork", rssUrl: "https://www.cbsnews.com/newyork/latest/rss" },
      { callSign: "WNBC", name: "NBC New York", network: "NBC", website: "https://www.nbcnewyork.com", rssUrl: "https://www.nbcnewyork.com/feed" },
      { callSign: "WABC", name: "ABC 7 New York", network: "ABC", website: "https://abc7ny.com", rssUrl: "https://abc7ny.com/feed" },
      { callSign: "WNYW", name: "FOX 5 New York", network: "FOX", website: "https://www.fox5ny.com", rssUrl: "https://www.fox5ny.com/feed" },
      { callSign: "WPIX", name: "PIX 11", network: "CW", website: "https://pix11.com", rssUrl: "https://pix11.com/feed" },
    ],
    radioStations: [
      { callSign: "WINS", name: "1010 WINS", format: "All News", website: "https://www.audacy.com/1010wins" },
      { callSign: "WCBS-AM", name: "WCBS 880", format: "All News", website: "https://www.audacy.com/wcbs880" },
      { callSign: "WNYC", name: "WNYC", format: "NPR", website: "https://www.wnyc.org", rssUrl: "https://www.wnyc.org/feeds/articles" },
      { callSign: "WOR", name: "WOR 710", format: "News/Talk", website: "https://www.audacy.com/wor" },
    ],
  },
  {
    name: "Los Angeles", slug: "los-angeles", state: "CA", latitude: 34.0522, longitude: -118.2437, radiusKm: 100, timezone: "America/Los_Angeles",
    keywords: ["los angeles", "la", "hollywood", "beverly hills", "santa monica", "pasadena", "long beach", "glendale", "burbank", "los angeles county", "orange county"],
    neighborhoods: ["Hollywood", "Downtown LA", "Beverly Hills", "Santa Monica", "Venice", "Silver Lake", "Echo Park", "Los Feliz", "Koreatown", "West Hollywood", "Brentwood", "Westwood", "Culver City", "Mar Vista", "Boyle Heights", "Highland Park", "Eagle Rock", "Pasadena", "Glendale", "Burbank", "Long Beach", "Compton", "Inglewood", "Watts", "South LA"],
    tvStations: [
      { callSign: "KCBS", name: "CBS Los Angeles", network: "CBS", website: "https://www.cbsnews.com/losangeles", rssUrl: "https://www.cbsnews.com/losangeles/latest/rss" },
      { callSign: "KNBC", name: "NBC Los Angeles", network: "NBC", website: "https://www.nbclosangeles.com", rssUrl: "https://www.nbclosangeles.com/feed" },
      { callSign: "KABC", name: "ABC 7 Los Angeles", network: "ABC", website: "https://abc7.com", rssUrl: "https://abc7.com/feed" },
      { callSign: "KTTV", name: "FOX 11 Los Angeles", network: "FOX", website: "https://www.foxla.com", rssUrl: "https://www.foxla.com/feed" },
      { callSign: "KTLA", name: "KTLA 5", network: "CW", website: "https://ktla.com", rssUrl: "https://ktla.com/feed" },
    ],
    radioStations: [
      { callSign: "KNX", name: "KNX News", format: "All News", website: "https://www.audacy.com/knx1070" },
      { callSign: "KFI", name: "KFI AM 640", format: "News/Talk", website: "https://www.iheart.com/live/kfi-am-640-702" },
      { callSign: "KPCC", name: "LAist/KPCC", format: "NPR", website: "https://laist.com", rssUrl: "https://laist.com/feeds/feed.xml" },
    ],
  },
  {
    name: "Chicago", slug: "chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, radiusKm: 60, timezone: "America/Chicago",
    keywords: ["chicago", "cook county", "dupage county", "lake county", "chicagoland", "illinois"],
    neighborhoods: ["Loop", "River North", "Lincoln Park", "Wicker Park", "Logan Square", "Lakeview", "Wrigleyville", "Hyde Park", "Pilsen", "Bronzeville", "South Loop", "West Loop", "Bucktown", "Old Town", "Gold Coast", "Uptown", "Rogers Park", "Edgewater", "Humboldt Park", "Back of the Yards", "Englewood", "Oak Park", "Evanston", "Naperville", "Schaumburg"],
    tvStations: [
      { callSign: "WBBM", name: "CBS Chicago", network: "CBS", website: "https://www.cbsnews.com/chicago", rssUrl: "https://www.cbsnews.com/chicago/latest/rss" },
      { callSign: "WMAQ", name: "NBC Chicago", network: "NBC", website: "https://www.nbcchicago.com", rssUrl: "https://www.nbcchicago.com/feed" },
      { callSign: "WLS", name: "ABC 7 Chicago", network: "ABC", website: "https://abc7chicago.com", rssUrl: "https://abc7chicago.com/feed" },
      { callSign: "WFLD", name: "FOX 32 Chicago", network: "FOX", website: "https://www.fox32chicago.com", rssUrl: "https://www.fox32chicago.com/feed" },
    ],
    radioStations: [
      { callSign: "WBBM-AM", name: "WBBM 780", format: "All News", website: "https://www.audacy.com/wbbm780" },
      { callSign: "WGN", name: "WGN Radio 720", format: "News/Talk", website: "https://wgnradio.com", rssUrl: "https://wgnradio.com/feed" },
      { callSign: "WBEZ", name: "WBEZ Chicago", format: "NPR", website: "https://www.wbez.org", rssUrl: "https://www.wbez.org/feeds/rss" },
    ],
  },
  {
    name: "Dallas-Fort Worth", slug: "dallas-fort-worth", state: "TX", latitude: 32.7767, longitude: -96.7970, radiusKm: 80, timezone: "America/Chicago",
    keywords: ["dallas", "fort worth", "dfw", "arlington", "plano", "irving", "garland", "frisco", "mckinney", "dallas county", "tarrant county", "collin county", "denton county"],
    neighborhoods: ["Downtown Dallas", "Uptown", "Deep Ellum", "Bishop Arts", "Oak Lawn", "Oak Cliff", "Lake Highlands", "Preston Hollow", "Park Cities", "Highland Park", "University Park", "Fort Worth Stockyards", "Sundance Square", "TCU", "Arlington", "Plano", "Frisco", "McKinney", "Richardson", "Addison", "Denton", "Allen", "Garland", "Mesquite", "Grand Prairie"],
    tvStations: [
      { callSign: "KTVT", name: "CBS Dallas", network: "CBS", website: "https://www.cbsnews.com/texas", rssUrl: "https://www.cbsnews.com/texas/latest/rss" },
      { callSign: "KXAS", name: "NBC DFW", network: "NBC", website: "https://www.nbcdfw.com", rssUrl: "https://www.nbcdfw.com/feed" },
      { callSign: "WFAA", name: "WFAA ABC 8", network: "ABC", website: "https://www.wfaa.com", rssUrl: "https://www.wfaa.com/feeds/syndication/rss/news" },
      { callSign: "KDFW", name: "FOX 4 Dallas", network: "FOX", website: "https://www.fox4news.com", rssUrl: "https://www.fox4news.com/feed" },
    ],
    radioStations: [
      { callSign: "KRLD", name: "KRLD 1080", format: "All News", website: "https://www.audacy.com/krld" },
      { callSign: "WBAP", name: "WBAP 820", format: "News/Talk", website: "https://www.wbap.com", rssUrl: "https://www.wbap.com/feed" },
      { callSign: "KERA", name: "KERA News", format: "NPR", website: "https://www.keranews.org", rssUrl: "https://www.keranews.org/feeds" },
    ],
  },
  {
    name: "Houston", slug: "houston", state: "TX", latitude: 29.7604, longitude: -95.3698, radiusKm: 80, timezone: "America/Chicago",
    keywords: ["houston", "harris county", "fort bend county", "montgomery county", "galveston county", "brazoria county", "sugar land", "the woodlands", "katy", "pearland", "pasadena", "baytown", "clear lake"],
    neighborhoods: ["Downtown", "Midtown", "Montrose", "Heights", "River Oaks", "Galleria", "Uptown", "Memorial", "West University", "Bellaire", "Medical Center", "Museum District", "Rice Village", "Third Ward", "EaDo", "East End", "Katy", "Sugar Land", "The Woodlands", "Pearland", "Clear Lake", "Cypress", "Spring", "Kingwood", "Humble"],
    tvStations: [
      { callSign: "KHOU", name: "KHOU CBS 11", network: "CBS", website: "https://www.khou.com", rssUrl: "https://www.khou.com/feeds/syndication/rss/news" },
      { callSign: "KPRC", name: "KPRC NBC 2", network: "NBC", website: "https://www.click2houston.com", rssUrl: "https://www.click2houston.com/arcio/rss" },
      { callSign: "KTRK", name: "ABC 13 Houston", network: "ABC", website: "https://abc13.com", rssUrl: "https://abc13.com/feed" },
      { callSign: "KRIV", name: "FOX 26 Houston", network: "FOX", website: "https://www.fox26houston.com", rssUrl: "https://www.fox26houston.com/feed" },
    ],
    radioStations: [
      { callSign: "KTRH", name: "KTRH 740", format: "News/Talk", website: "https://www.iheart.com/live/ktrh-740-1229" },
      { callSign: "KUHF", name: "Houston Public Media", format: "NPR", website: "https://www.houstonpublicmedia.org", rssUrl: "https://www.houstonpublicmedia.org/feed" },
      { callSign: "KNTH", name: "NewsRadio 1070", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-1070-knth-7647" },
    ],
  },
  {
    name: "Washington DC", slug: "washington-dc", state: "DC", latitude: 38.9072, longitude: -77.0369, radiusKm: 50, timezone: "America/New_York",
    keywords: ["washington", "dc", "district of columbia", "arlington", "alexandria", "bethesda", "silver spring", "fairfax", "prince george", "montgomery county"],
    neighborhoods: ["Georgetown", "Dupont Circle", "Adams Morgan", "Capitol Hill", "Navy Yard", "Shaw", "U Street", "Columbia Heights", "Foggy Bottom", "Penn Quarter", "Chinatown", "H Street", "Brookland", "Anacostia", "Tenleytown", "Arlington", "Alexandria", "Bethesda", "Silver Spring", "Tysons"],
    tvStations: [
      { callSign: "WUSA", name: "WUSA 9 CBS", network: "CBS", website: "https://www.wusa9.com", rssUrl: "https://www.wusa9.com/feeds/syndication/rss/news" },
      { callSign: "WRC", name: "NBC Washington", network: "NBC", website: "https://www.nbcwashington.com", rssUrl: "https://www.nbcwashington.com/feed" },
      { callSign: "WJLA", name: "ABC 7 DC", network: "ABC", website: "https://wjla.com", rssUrl: "https://wjla.com/feed" },
      { callSign: "WTTG", name: "FOX 5 DC", network: "FOX", website: "https://www.fox5dc.com", rssUrl: "https://www.fox5dc.com/feed" },
    ],
    radioStations: [
      { callSign: "WTOP", name: "WTOP News", format: "All News", website: "https://wtop.com", rssUrl: "https://wtop.com/feed" },
      { callSign: "WAMU", name: "WAMU 88.5", format: "NPR", website: "https://wamu.org", rssUrl: "https://wamu.org/feed" },
    ],
  },
  {
    name: "Philadelphia", slug: "philadelphia", state: "PA", latitude: 39.9526, longitude: -75.1652, radiusKm: 50, timezone: "America/New_York",
    keywords: ["philadelphia", "philly", "delaware county", "montgomery county", "bucks county", "chester county", "camden", "south jersey"],
    neighborhoods: ["Center City", "Old City", "South Philly", "Northern Liberties", "Fishtown", "Manayunk", "Rittenhouse", "University City", "West Philly", "Germantown", "Chestnut Hill", "Mount Airy", "Kensington", "Port Richmond", "Frankford", "Camden", "Cherry Hill"],
    tvStations: [
      { callSign: "KYW", name: "CBS Philadelphia", network: "CBS", website: "https://www.cbsnews.com/philadelphia", rssUrl: "https://www.cbsnews.com/philadelphia/latest/rss" },
      { callSign: "WCAU", name: "NBC Philadelphia", network: "NBC", website: "https://www.nbcphiladelphia.com", rssUrl: "https://www.nbcphiladelphia.com/feed" },
      { callSign: "WPVI", name: "6ABC Philadelphia", network: "ABC", website: "https://6abc.com", rssUrl: "https://6abc.com/feed" },
      { callSign: "WTXF", name: "FOX 29 Philly", network: "FOX", website: "https://www.fox29.com", rssUrl: "https://www.fox29.com/feed" },
    ],
    radioStations: [
      { callSign: "KYW-AM", name: "KYW Newsradio 1060", format: "All News", website: "https://www.audacy.com/kywnewsradio" },
      { callSign: "WHYY", name: "WHYY", format: "NPR", website: "https://whyy.org", rssUrl: "https://whyy.org/feed" },
    ],
  },
  {
    name: "Miami", slug: "miami", state: "FL", latitude: 25.7617, longitude: -80.1918, radiusKm: 60, timezone: "America/New_York",
    keywords: ["miami", "fort lauderdale", "miami-dade", "broward county", "palm beach", "south florida", "boca raton", "coral gables", "hialeah"],
    neighborhoods: ["Downtown Miami", "Brickell", "Wynwood", "Little Havana", "Coconut Grove", "Coral Gables", "South Beach", "Miami Beach", "Doral", "Kendall", "Hialeah", "North Miami", "Aventura", "Fort Lauderdale", "Hollywood", "Boca Raton", "Pompano Beach", "Overtown", "Liberty City", "Little Haiti"],
    tvStations: [
      { callSign: "WFOR", name: "CBS Miami", network: "CBS", website: "https://www.cbsnews.com/miami", rssUrl: "https://www.cbsnews.com/miami/latest/rss" },
      { callSign: "WTVJ", name: "NBC Miami", network: "NBC", website: "https://www.nbcmiami.com", rssUrl: "https://www.nbcmiami.com/feed" },
      { callSign: "WPLG", name: "Local 10 ABC", network: "ABC", website: "https://www.local10.com", rssUrl: "https://www.local10.com/arcio/rss" },
      { callSign: "WSVN", name: "WSVN 7 News", network: "FOX", website: "https://wsvn.com", rssUrl: "https://wsvn.com/feed" },
    ],
    radioStations: [
      { callSign: "WIOD", name: "WIOD 610 AM", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-610-wiod-1483" },
      { callSign: "WLRN", name: "WLRN", format: "NPR", website: "https://www.wlrn.org", rssUrl: "https://www.wlrn.org/feed" },
    ],
  },
  {
    name: "Atlanta", slug: "atlanta", state: "GA", latitude: 33.7490, longitude: -84.3880, radiusKm: 60, timezone: "America/New_York",
    keywords: ["atlanta", "fulton county", "dekalb county", "cobb county", "gwinnett county", "marietta", "decatur", "roswell", "alpharetta"],
    neighborhoods: ["Downtown", "Midtown", "Buckhead", "Virginia-Highland", "Inman Park", "Little Five Points", "Old Fourth Ward", "East Atlanta", "West End", "Grant Park", "Decatur", "Sandy Springs", "Marietta", "Roswell", "Alpharetta", "Dunwoody", "Brookhaven", "Smyrna", "Kennesaw"],
    tvStations: [
      { callSign: "WGCL", name: "CBS 46 Atlanta", network: "CBS", website: "https://www.cbs46.com", rssUrl: "https://www.cbs46.com/feed" },
      { callSign: "WXIA", name: "11Alive NBC", network: "NBC", website: "https://www.11alive.com", rssUrl: "https://www.11alive.com/feeds/syndication/rss/news" },
      { callSign: "WSB", name: "WSB-TV ABC", network: "ABC", website: "https://www.wsbtv.com", rssUrl: "https://www.wsbtv.com/arcio/rss" },
      { callSign: "WAGA", name: "FOX 5 Atlanta", network: "FOX", website: "https://www.fox5atlanta.com", rssUrl: "https://www.fox5atlanta.com/feed" },
    ],
    radioStations: [
      { callSign: "WSB-AM", name: "WSB Radio 750", format: "News/Talk", website: "https://www.wsbradio.com", rssUrl: "https://www.wsbradio.com/feed" },
      { callSign: "WABE", name: "WABE Atlanta", format: "NPR", website: "https://www.wabe.org", rssUrl: "https://www.wabe.org/feed" },
    ],
  },
  {
    name: "Boston", slug: "boston", state: "MA", latitude: 42.3601, longitude: -71.0589, radiusKm: 40, timezone: "America/New_York",
    keywords: ["boston", "cambridge", "somerville", "brookline", "quincy", "newton", "suffolk county", "middlesex county", "worcester"],
    neighborhoods: ["Back Bay", "Beacon Hill", "South End", "North End", "Fenway", "Seaport", "South Boston", "Dorchester", "Roxbury", "Jamaica Plain", "Charlestown", "East Boston", "Allston", "Brighton", "Cambridge", "Somerville", "Brookline"],
    tvStations: [
      { callSign: "WBZ", name: "CBS Boston", network: "CBS", website: "https://www.cbsnews.com/boston", rssUrl: "https://www.cbsnews.com/boston/latest/rss" },
      { callSign: "WBTS", name: "NBC Boston", network: "NBC", website: "https://www.nbcboston.com", rssUrl: "https://www.nbcboston.com/feed" },
      { callSign: "WCVB", name: "WCVB ABC 5", network: "ABC", website: "https://www.wcvb.com", rssUrl: "https://www.wcvb.com/arcio/rss" },
      { callSign: "WFXT", name: "FOX 25 Boston", network: "FOX", website: "https://www.boston25news.com", rssUrl: "https://www.boston25news.com/arcio/rss" },
    ],
    radioStations: [
      { callSign: "WBZ-AM", name: "WBZ NewsRadio 1030", format: "All News", website: "https://www.audacy.com/wbz" },
      { callSign: "WBUR", name: "WBUR", format: "NPR", website: "https://www.wbur.org", rssUrl: "https://www.wbur.org/feed" },
      { callSign: "WGBH", name: "GBH News", format: "NPR", website: "https://www.wgbh.org/news", rssUrl: "https://www.wgbh.org/news/feed" },
    ],
  },
  {
    name: "Phoenix", slug: "phoenix", state: "AZ", latitude: 33.4484, longitude: -112.0740, radiusKm: 60, timezone: "America/Phoenix",
    keywords: ["phoenix", "scottsdale", "tempe", "mesa", "chandler", "gilbert", "glendale", "maricopa county", "arizona"],
    neighborhoods: ["Downtown Phoenix", "Scottsdale", "Tempe", "Mesa", "Chandler", "Gilbert", "Glendale", "Peoria", "Arcadia", "Biltmore", "Paradise Valley", "Ahwatukee", "Camelback", "Deer Valley", "Anthem", "Surprise", "Goodyear", "Avondale"],
    tvStations: [
      { callSign: "KPHO", name: "CBS 5 Arizona", network: "CBS", website: "https://www.azfamily.com", rssUrl: "https://www.azfamily.com/feed" },
      { callSign: "KPNX", name: "12News NBC", network: "NBC", website: "https://www.12news.com", rssUrl: "https://www.12news.com/feeds/syndication/rss/news" },
      { callSign: "KNXV", name: "ABC15 Arizona", network: "ABC", website: "https://www.abc15.com", rssUrl: "https://www.abc15.com/feed" },
      { callSign: "KSAZ", name: "FOX 10 Phoenix", network: "FOX", website: "https://www.fox10phoenix.com", rssUrl: "https://www.fox10phoenix.com/feed" },
    ],
    radioStations: [
      { callSign: "KTAR", name: "KTAR News 92.3", format: "News/Talk", website: "https://ktar.com", rssUrl: "https://ktar.com/feed" },
      { callSign: "KJZZ", name: "KJZZ", format: "NPR", website: "https://kjzz.org", rssUrl: "https://kjzz.org/feed" },
    ],
  },
  {
    name: "San Francisco", slug: "san-francisco", state: "CA", latitude: 37.7749, longitude: -122.4194, radiusKm: 50, timezone: "America/Los_Angeles",
    keywords: ["san francisco", "oakland", "san jose", "bay area", "silicon valley", "berkeley", "fremont", "palo alto", "san mateo", "marin", "alameda county"],
    neighborhoods: ["Mission", "SoMa", "Castro", "Haight-Ashbury", "North Beach", "Chinatown", "Financial District", "Nob Hill", "Pacific Heights", "Marina", "Richmond", "Sunset", "Tenderloin", "Hayes Valley", "Potrero Hill", "Dogpatch", "Oakland Downtown", "Berkeley", "Palo Alto", "Mountain View"],
    tvStations: [
      { callSign: "KPIX", name: "CBS Bay Area", network: "CBS", website: "https://www.cbsnews.com/sanfrancisco", rssUrl: "https://www.cbsnews.com/sanfrancisco/latest/rss" },
      { callSign: "KNTV", name: "NBC Bay Area", network: "NBC", website: "https://www.nbcbayarea.com", rssUrl: "https://www.nbcbayarea.com/feed" },
      { callSign: "KGO", name: "ABC 7 Bay Area", network: "ABC", website: "https://abc7news.com", rssUrl: "https://abc7news.com/feed" },
      { callSign: "KTVU", name: "KTVU FOX 2", network: "FOX", website: "https://www.ktvu.com", rssUrl: "https://www.ktvu.com/feed" },
    ],
    radioStations: [
      { callSign: "KCBS-AM", name: "KCBS Radio", format: "All News", website: "https://www.audacy.com/kcbsradio" },
      { callSign: "KQED", name: "KQED", format: "NPR", website: "https://www.kqed.org", rssUrl: "https://www.kqed.org/news/feed" },
    ],
  },
  {
    name: "Riverside", slug: "riverside", state: "CA", latitude: 33.9806, longitude: -117.3755, radiusKm: 70, timezone: "America/Los_Angeles",
    keywords: ["riverside", "san bernardino", "inland empire", "ontario", "rancho cucamonga", "fontana", "moreno valley", "corona", "temecula", "palm springs"],
    neighborhoods: ["Downtown Riverside", "Ontario", "Rancho Cucamonga", "Fontana", "Moreno Valley", "Corona", "Temecula", "Murrieta", "Palm Springs", "Redlands", "San Bernardino", "Rialto", "Upland", "Victorville"],
    tvStations: [
      { callSign: "KVCR", name: "KVCR PBS", network: "PBS", website: "https://www.kvcr.org", rssUrl: "https://www.kvcr.org/feed" },
    ],
    radioStations: [
      { callSign: "KVCR-FM", name: "KVCR FM", format: "NPR", website: "https://www.kvcr.org" },
    ],
  },
  {
    name: "Detroit", slug: "detroit", state: "MI", latitude: 42.3314, longitude: -83.0458, radiusKm: 50, timezone: "America/Detroit",
    keywords: ["detroit", "wayne county", "oakland county", "macomb county", "dearborn", "ann arbor", "pontiac", "livonia", "sterling heights"],
    neighborhoods: ["Downtown", "Midtown", "Corktown", "Greektown", "Eastern Market", "Indian Village", "Palmer Park", "Mexicantown", "Southwest Detroit", "New Center", "Hamtramck", "Dearborn", "Royal Oak", "Ferndale", "Ann Arbor", "Birmingham", "Troy", "Grosse Pointe"],
    tvStations: [
      { callSign: "WWJ", name: "CBS Detroit", network: "CBS", website: "https://www.cbsnews.com/detroit", rssUrl: "https://www.cbsnews.com/detroit/latest/rss" },
      { callSign: "WDIV", name: "WDIV Local 4", network: "NBC", website: "https://www.clickondetroit.com", rssUrl: "https://www.clickondetroit.com/arcio/rss" },
      { callSign: "WXYZ", name: "WXYZ 7 Detroit", network: "ABC", website: "https://www.wxyz.com", rssUrl: "https://www.wxyz.com/feed" },
      { callSign: "WJBK", name: "FOX 2 Detroit", network: "FOX", website: "https://www.fox2detroit.com", rssUrl: "https://www.fox2detroit.com/feed" },
    ],
    radioStations: [
      { callSign: "WWJ-AM", name: "WWJ Newsradio 950", format: "All News", website: "https://www.audacy.com/wwjnewsradio" },
      { callSign: "WDET", name: "WDET", format: "NPR", website: "https://wdet.org", rssUrl: "https://wdet.org/feed" },
    ],
  },
  {
    name: "Seattle", slug: "seattle", state: "WA", latitude: 47.6062, longitude: -122.3321, radiusKm: 50, timezone: "America/Los_Angeles",
    keywords: ["seattle", "king county", "tacoma", "bellevue", "everett", "redmond", "kirkland", "kent", "renton", "puget sound"],
    neighborhoods: ["Capitol Hill", "Ballard", "Fremont", "Queen Anne", "University District", "Wallingford", "Green Lake", "Georgetown", "SoDo", "Pioneer Square", "Beacon Hill", "West Seattle", "Columbia City", "Bellevue", "Redmond", "Tacoma", "Kirkland", "Bothell"],
    tvStations: [
      { callSign: "KIRO", name: "KIRO 7 CBS", network: "CBS", website: "https://www.kiro7.com", rssUrl: "https://www.kiro7.com/arcio/rss" },
      { callSign: "KING", name: "KING 5 NBC", network: "NBC", website: "https://www.king5.com", rssUrl: "https://www.king5.com/feeds/syndication/rss/news" },
      { callSign: "KOMO", name: "KOMO ABC 4", network: "ABC", website: "https://komonews.com", rssUrl: "https://komonews.com/feed" },
      { callSign: "KCPQ", name: "Q13 FOX", network: "FOX", website: "https://www.q13fox.com", rssUrl: "https://www.q13fox.com/feed" },
    ],
    radioStations: [
      { callSign: "KIRO-AM", name: "KIRO Radio 97.3", format: "News/Talk", website: "https://mynorthwest.com", rssUrl: "https://mynorthwest.com/feed" },
      { callSign: "KUOW", name: "KUOW", format: "NPR", website: "https://www.kuow.org", rssUrl: "https://www.kuow.org/rss" },
    ],
  },
  {
    name: "Minneapolis", slug: "minneapolis", state: "MN", latitude: 44.9778, longitude: -93.2650, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["minneapolis", "saint paul", "st paul", "twin cities", "hennepin county", "ramsey county", "bloomington", "eden prairie", "minnesota"],
    neighborhoods: ["Downtown Minneapolis", "Uptown", "Northeast", "North Loop", "Loring Park", "Whittier", "Powderhorn", "Longfellow", "Seward", "St Paul Downtown", "Grand Avenue", "Cathedral Hill", "Highland Park", "Bloomington", "Eden Prairie", "Edina", "Plymouth", "Maple Grove"],
    tvStations: [
      { callSign: "WCCO", name: "WCCO CBS", network: "CBS", website: "https://www.cbsnews.com/minnesota", rssUrl: "https://www.cbsnews.com/minnesota/latest/rss" },
      { callSign: "KARE", name: "KARE 11 NBC", network: "NBC", website: "https://www.kare11.com", rssUrl: "https://www.kare11.com/feeds/syndication/rss/news" },
      { callSign: "KSTP", name: "KSTP ABC 5", network: "ABC", website: "https://kstp.com", rssUrl: "https://kstp.com/feed" },
      { callSign: "KMSP", name: "FOX 9 Minneapolis", network: "FOX", website: "https://www.fox9.com", rssUrl: "https://www.fox9.com/feed" },
    ],
    radioStations: [
      { callSign: "WCCO-AM", name: "WCCO Radio 830", format: "News/Talk", website: "https://www.audacy.com/wccoradio" },
      { callSign: "MPR", name: "MPR News", format: "NPR", website: "https://www.mprnews.org", rssUrl: "https://www.mprnews.org/feed" },
    ],
  },
  {
    name: "San Diego", slug: "san-diego", state: "CA", latitude: 32.7157, longitude: -117.1611, radiusKm: 50, timezone: "America/Los_Angeles",
    keywords: ["san diego", "san diego county", "chula vista", "oceanside", "carlsbad", "escondido", "la jolla", "coronado"],
    neighborhoods: ["Downtown", "Gaslamp Quarter", "Hillcrest", "North Park", "South Park", "La Jolla", "Pacific Beach", "Ocean Beach", "Mission Beach", "Point Loma", "Coronado", "Normal Heights", "Chula Vista", "Oceanside", "Carlsbad", "Escondido", "El Cajon"],
    tvStations: [
      { callSign: "KFMB", name: "CBS 8 San Diego", network: "CBS", website: "https://www.cbs8.com", rssUrl: "https://www.cbs8.com/feeds/syndication/rss/news" },
      { callSign: "KNSD", name: "NBC 7 San Diego", network: "NBC", website: "https://www.nbcsandiego.com", rssUrl: "https://www.nbcsandiego.com/feed" },
      { callSign: "KGTV", name: "ABC 10News", network: "ABC", website: "https://www.10news.com", rssUrl: "https://www.10news.com/feed" },
      { callSign: "KSWB", name: "FOX 5 San Diego", network: "FOX", website: "https://fox5sandiego.com", rssUrl: "https://fox5sandiego.com/feed" },
    ],
    radioStations: [
      { callSign: "KOGO", name: "KOGO 600", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-600-kogo-7646" },
      { callSign: "KPBS", name: "KPBS", format: "NPR", website: "https://www.kpbs.org", rssUrl: "https://www.kpbs.org/feeds/news" },
    ],
  },
  {
    name: "Tampa", slug: "tampa", state: "FL", latitude: 27.9506, longitude: -82.4572, radiusKm: 50, timezone: "America/New_York",
    keywords: ["tampa", "st petersburg", "clearwater", "hillsborough county", "pinellas county", "pasco county", "tampa bay", "brandon", "lakeland"],
    neighborhoods: ["Downtown Tampa", "Ybor City", "SoHo", "Channelside", "Seminole Heights", "Hyde Park", "Westchase", "Carrollwood", "St Petersburg Downtown", "Gulfport", "Clearwater", "Dunedin", "Brandon", "Riverview", "Wesley Chapel", "Lakeland"],
    tvStations: [
      { callSign: "WTSP", name: "10Tampa Bay CBS", network: "CBS", website: "https://www.wtsp.com", rssUrl: "https://www.wtsp.com/feeds/syndication/rss/news" },
      { callSign: "WFLA", name: "WFLA NBC 8", network: "NBC", website: "https://www.wfla.com", rssUrl: "https://www.wfla.com/feed" },
      { callSign: "WFTS", name: "ABC Action News", network: "ABC", website: "https://www.abcactionnews.com", rssUrl: "https://www.abcactionnews.com/feed" },
      { callSign: "WTVT", name: "FOX 13 Tampa", network: "FOX", website: "https://www.fox13news.com", rssUrl: "https://www.fox13news.com/feed" },
    ],
    radioStations: [
      { callSign: "WFLA-AM", name: "WFLA 970", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-wfla-1531" },
      { callSign: "WUSF", name: "WUSF", format: "NPR", website: "https://www.wusf.org", rssUrl: "https://www.wusf.org/feed" },
    ],
  },
  {
    name: "Denver", slug: "denver", state: "CO", latitude: 39.7392, longitude: -104.9903, radiusKm: 50, timezone: "America/Denver",
    keywords: ["denver", "aurora", "lakewood", "boulder", "arvada", "westminster", "colorado springs", "adams county", "arapahoe county", "jefferson county"],
    neighborhoods: ["LoDo", "RiNo", "Capitol Hill", "Cherry Creek", "Highlands", "Baker", "Five Points", "Wash Park", "City Park", "Congress Park", "Stapleton", "Park Hill", "Aurora", "Lakewood", "Boulder", "Arvada", "Westminster", "Englewood", "Littleton"],
    tvStations: [
      { callSign: "KCNC", name: "CBS Colorado", network: "CBS", website: "https://www.cbsnews.com/colorado", rssUrl: "https://www.cbsnews.com/colorado/latest/rss" },
      { callSign: "KUSA", name: "9NEWS NBC", network: "NBC", website: "https://www.9news.com", rssUrl: "https://www.9news.com/feeds/syndication/rss/news" },
      { callSign: "KMGH", name: "Denver7 ABC", network: "ABC", website: "https://www.denver7.com", rssUrl: "https://www.denver7.com/feed" },
      { callSign: "KDVR", name: "FOX31 Denver", network: "FOX", website: "https://kdvr.com", rssUrl: "https://kdvr.com/feed" },
    ],
    radioStations: [
      { callSign: "KOA", name: "KOA 850", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-850-koa-1441" },
      { callSign: "CPR", name: "Colorado Public Radio", format: "NPR", website: "https://www.cpr.org", rssUrl: "https://www.cpr.org/feed" },
    ],
  },
  {
    name: "St. Louis", slug: "st-louis", state: "MO", latitude: 38.6270, longitude: -90.1994, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["st louis", "saint louis", "st louis county", "st charles", "jefferson county", "east st louis", "missouri", "illinois"],
    neighborhoods: ["Downtown", "Central West End", "Soulard", "The Hill", "Tower Grove", "Cherokee", "Lafayette Square", "The Grove", "Delmar Loop", "Clayton", "Brentwood", "Webster Groves", "Kirkwood", "Florissant", "University City", "Chesterfield"],
    tvStations: [
      { callSign: "KMOV", name: "KMOV CBS 4", network: "CBS", website: "https://www.kmov.com", rssUrl: "https://www.kmov.com/feed" },
      { callSign: "KSDK", name: "KSDK 5", network: "NBC", website: "https://www.ksdk.com", rssUrl: "https://www.ksdk.com/feeds/syndication/rss/news" },
      { callSign: "KTVI", name: "FOX 2 St. Louis", network: "FOX", website: "https://fox2now.com", rssUrl: "https://fox2now.com/feed" },
    ],
    radioStations: [
      { callSign: "KMOX", name: "KMOX 1120", format: "News/Talk", website: "https://www.audacy.com/kmox" },
      { callSign: "KWMU", name: "St. Louis Public Radio", format: "NPR", website: "https://news.stlpublicradio.org", rssUrl: "https://news.stlpublicradio.org/feed" },
    ],
  },
  {
    name: "Baltimore", slug: "baltimore", state: "MD", latitude: 39.2904, longitude: -76.6122, radiusKm: 40, timezone: "America/New_York",
    keywords: ["baltimore", "baltimore county", "anne arundel", "howard county", "harford county", "maryland"],
    neighborhoods: ["Inner Harbor", "Fells Point", "Federal Hill", "Canton", "Mount Vernon", "Hampden", "Charles Village", "Station North", "Remington", "Towson", "Columbia", "Dundalk", "Annapolis", "Catonsville", "Ellicott City"],
    tvStations: [
      { callSign: "WJZ", name: "CBS Baltimore", network: "CBS", website: "https://www.cbsnews.com/baltimore", rssUrl: "https://www.cbsnews.com/baltimore/latest/rss" },
      { callSign: "WBAL", name: "WBAL-TV 11", network: "NBC", website: "https://www.wbaltv.com", rssUrl: "https://www.wbaltv.com/arcio/rss" },
      { callSign: "WMAR", name: "WMAR ABC 2", network: "ABC", website: "https://www.wmar2news.com", rssUrl: "https://www.wmar2news.com/feed" },
      { callSign: "WBFF", name: "FOX45 Baltimore", network: "FOX", website: "https://foxbaltimore.com", rssUrl: "https://foxbaltimore.com/feed" },
    ],
    radioStations: [
      { callSign: "WBAL-AM", name: "WBAL 1090", format: "News/Talk", website: "https://www.wbal.com", rssUrl: "https://www.wbal.com/feed" },
      { callSign: "WYPR", name: "WYPR", format: "NPR", website: "https://www.wypr.org", rssUrl: "https://www.wypr.org/feed" },
    ],
  },
  {
    name: "Orlando", slug: "orlando", state: "FL", latitude: 28.5383, longitude: -81.3792, radiusKm: 50, timezone: "America/New_York",
    keywords: ["orlando", "orange county", "seminole county", "osceola county", "kissimmee", "sanford", "winter park", "central florida"],
    neighborhoods: ["Downtown", "Thornton Park", "Mills 50", "College Park", "Winter Park", "Baldwin Park", "Lake Nona", "Dr. Phillips", "Kissimmee", "Sanford", "Altamonte Springs", "Ocoee", "Celebration", "International Drive"],
    tvStations: [
      { callSign: "WKMG", name: "News 6 CBS", network: "CBS", website: "https://www.clickorlando.com", rssUrl: "https://www.clickorlando.com/arcio/rss" },
      { callSign: "WESH", name: "WESH 2 NBC", network: "NBC", website: "https://www.wesh.com", rssUrl: "https://www.wesh.com/arcio/rss" },
      { callSign: "WFTV", name: "WFTV ABC 9", network: "ABC", website: "https://www.wftv.com", rssUrl: "https://www.wftv.com/arcio/rss" },
      { callSign: "WOFL", name: "FOX 35 Orlando", network: "FOX", website: "https://www.fox35orlando.com", rssUrl: "https://www.fox35orlando.com/feed" },
    ],
    radioStations: [
      { callSign: "WDBO", name: "WDBO 107.3", format: "News/Talk", website: "https://www.iheart.com/live/news-965-wdbo-5765" },
      { callSign: "WMFE", name: "WMFE", format: "NPR", website: "https://www.wmfe.org", rssUrl: "https://www.wmfe.org/feed" },
    ],
  },
  {
    name: "Charlotte", slug: "charlotte", state: "NC", latitude: 35.2271, longitude: -80.8431, radiusKm: 50, timezone: "America/New_York",
    keywords: ["charlotte", "mecklenburg county", "gastonia", "concord", "rock hill", "north carolina", "south carolina"],
    neighborhoods: ["Uptown", "South End", "NoDa", "Plaza Midwood", "Dilworth", "Elizabeth", "Myers Park", "SouthPark", "University City", "Ballantyne", "Steele Creek", "Matthews", "Huntersville", "Concord", "Gastonia"],
    tvStations: [
      { callSign: "WBTV", name: "WBTV 3 CBS", network: "CBS", website: "https://www.wbtv.com", rssUrl: "https://www.wbtv.com/arcio/rss" },
      { callSign: "WCNC", name: "WCNC NBC", network: "NBC", website: "https://www.wcnc.com", rssUrl: "https://www.wcnc.com/feeds/syndication/rss/news" },
      { callSign: "WSOC", name: "WSOC ABC 9", network: "ABC", website: "https://www.wsoctv.com", rssUrl: "https://www.wsoctv.com/arcio/rss" },
      { callSign: "WJZY", name: "FOX 46", network: "FOX", website: "https://www.fox46.com", rssUrl: "https://www.fox46.com/feed" },
    ],
    radioStations: [
      { callSign: "WBT", name: "WBT 1110", format: "News/Talk", website: "https://www.iheart.com/live/wbt-1110-charlotte-4676" },
      { callSign: "WFAE", name: "WFAE", format: "NPR", website: "https://www.wfae.org", rssUrl: "https://www.wfae.org/feed" },
    ],
  },
  {
    name: "San Antonio", slug: "san-antonio", state: "TX", latitude: 29.4241, longitude: -98.4936, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["san antonio", "bexar county", "new braunfels", "alamo", "alamo city", "south texas"],
    neighborhoods: ["Downtown", "River Walk", "Alamo Heights", "Monte Vista", "Southtown", "King William", "Pearl District", "Tobin Hill", "Olmos Park", "Terrell Hills", "Stone Oak", "The Rim", "Helotes", "Leon Valley", "Converse", "Live Oak", "New Braunfels"],
    tvStations: [
      { callSign: "KENS", name: "KENS 5 CBS", network: "CBS", website: "https://www.kens5.com", rssUrl: "https://www.kens5.com/feeds/syndication/rss/news" },
      { callSign: "WOAI", name: "WOAI NBC 4", network: "NBC", website: "https://news4sanantonio.com", rssUrl: "https://news4sanantonio.com/feed" },
      { callSign: "KSAT", name: "KSAT ABC 12", network: "ABC", website: "https://www.ksat.com", rssUrl: "https://www.ksat.com/arcio/rss" },
      { callSign: "KABB", name: "FOX 29 SA", network: "FOX", website: "https://foxsanantonio.com", rssUrl: "https://foxsanantonio.com/feed" },
    ],
    radioStations: [
      { callSign: "WOAI-AM", name: "WOAI 1200", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-1200-woai-1437" },
      { callSign: "TPR", name: "Texas Public Radio", format: "NPR", website: "https://www.tpr.org", rssUrl: "https://www.tpr.org/feed" },
    ],
  },
  {
    name: "Portland", slug: "portland", state: "OR", latitude: 45.5152, longitude: -122.6784, radiusKm: 40, timezone: "America/Los_Angeles",
    keywords: ["portland", "multnomah county", "clackamas county", "washington county", "beaverton", "hillsboro", "gresham", "vancouver wa", "oregon"],
    neighborhoods: ["Pearl District", "Alberta Arts", "Hawthorne", "Division", "Mississippi", "Sellwood", "St Johns", "Nob Hill", "Lloyd District", "Inner SE", "Beaverton", "Hillsboro", "Lake Oswego", "Tigard", "Gresham", "Milwaukie"],
    tvStations: [
      { callSign: "KOIN", name: "KOIN 6 CBS", network: "CBS", website: "https://www.koin.com", rssUrl: "https://www.koin.com/feed" },
      { callSign: "KGW", name: "KGW 8 NBC", network: "NBC", website: "https://www.kgw.com", rssUrl: "https://www.kgw.com/feeds/syndication/rss/news" },
      { callSign: "KATU", name: "KATU ABC 2", network: "ABC", website: "https://katu.com", rssUrl: "https://katu.com/feed" },
      { callSign: "KPTV", name: "FOX 12 Oregon", network: "FOX", website: "https://www.kptv.com", rssUrl: "https://www.kptv.com/feed" },
    ],
    radioStations: [
      { callSign: "KXL", name: "KXL 101.1", format: "News/Talk", website: "https://www.kxl.com", rssUrl: "https://www.kxl.com/feed" },
      { callSign: "OPB", name: "OPB", format: "NPR", website: "https://www.opb.org", rssUrl: "https://www.opb.org/feeds/rss" },
    ],
  },
  {
    name: "Sacramento", slug: "sacramento", state: "CA", latitude: 38.5816, longitude: -121.4944, radiusKm: 40, timezone: "America/Los_Angeles",
    keywords: ["sacramento", "sacramento county", "placer county", "el dorado county", "yolo county", "roseville", "elk grove", "folsom", "davis"],
    neighborhoods: ["Midtown", "Downtown", "East Sacramento", "Land Park", "Tahoe Park", "Oak Park", "Curtis Park", "Natomas", "Arden-Arcade", "Elk Grove", "Roseville", "Folsom", "Rancho Cordova", "Citrus Heights", "Davis"],
    tvStations: [
      { callSign: "KOVR", name: "CBS Sacramento", network: "CBS", website: "https://www.cbsnews.com/sacramento", rssUrl: "https://www.cbsnews.com/sacramento/latest/rss" },
      { callSign: "KCRA", name: "KCRA 3 NBC", network: "NBC", website: "https://www.kcra.com", rssUrl: "https://www.kcra.com/arcio/rss" },
      { callSign: "KXTV", name: "ABC10", network: "ABC", website: "https://www.abc10.com", rssUrl: "https://www.abc10.com/feeds/syndication/rss/news" },
      { callSign: "KTXL", name: "FOX40", network: "FOX", website: "https://fox40.com", rssUrl: "https://fox40.com/feed" },
    ],
    radioStations: [
      { callSign: "KFBK", name: "KFBK 1530", format: "News/Talk", website: "https://www.iheart.com/live/news-93-1-kfbk-5335" },
      { callSign: "CapRadio", name: "CapRadio", format: "NPR", website: "https://www.capradio.org", rssUrl: "https://www.capradio.org/feed" },
    ],
  },
  {
    name: "Pittsburgh", slug: "pittsburgh", state: "PA", latitude: 40.4406, longitude: -79.9959, radiusKm: 40, timezone: "America/New_York",
    keywords: ["pittsburgh", "allegheny county", "westmoreland county", "butler county", "pennsylvania", "steel city"],
    neighborhoods: ["Downtown", "Strip District", "Lawrenceville", "Shadyside", "Squirrel Hill", "Oakland", "South Side", "East Liberty", "Bloomfield", "Polish Hill", "Mount Washington", "North Shore", "Dormont", "Cranberry Twp"],
    tvStations: [
      { callSign: "KDKA", name: "KDKA CBS 2", network: "CBS", website: "https://www.cbsnews.com/pittsburgh", rssUrl: "https://www.cbsnews.com/pittsburgh/latest/rss" },
      { callSign: "WPXI", name: "WPXI NBC 11", network: "NBC", website: "https://www.wpxi.com", rssUrl: "https://www.wpxi.com/arcio/rss" },
      { callSign: "WTAE", name: "WTAE ABC 4", network: "ABC", website: "https://www.wtae.com", rssUrl: "https://www.wtae.com/arcio/rss" },
      { callSign: "WPGH", name: "WPGH FOX 53", network: "FOX", website: "https://www.fox53.com", rssUrl: "https://www.fox53.com/feed" },
    ],
    radioStations: [
      { callSign: "KDKA-AM", name: "KDKA 1020", format: "News/Talk", website: "https://www.audacy.com/kdkaradio" },
      { callSign: "WESA", name: "WESA", format: "NPR", website: "https://www.wesa.fm", rssUrl: "https://www.wesa.fm/feed" },
    ],
  },
  {
    name: "Las Vegas", slug: "las-vegas", state: "NV", latitude: 36.1699, longitude: -115.1398, radiusKm: 40, timezone: "America/Los_Angeles",
    keywords: ["las vegas", "clark county", "henderson", "north las vegas", "nevada", "the strip", "paradise"],
    neighborhoods: ["The Strip", "Downtown", "Summerlin", "Henderson", "North Las Vegas", "Spring Valley", "Enterprise", "Centennial Hills", "Green Valley", "Aliante", "Southern Highlands", "Lakes", "Paradise"],
    tvStations: [
      { callSign: "KLAS", name: "8NewsNow CBS", network: "CBS", website: "https://www.8newsnow.com", rssUrl: "https://www.8newsnow.com/feed" },
      { callSign: "KVVU", name: "FOX5 Vegas", network: "FOX", website: "https://www.fox5vegas.com", rssUrl: "https://www.fox5vegas.com/feed" },
      { callSign: "KSNV", name: "News 3 NBC", network: "NBC", website: "https://news3lv.com", rssUrl: "https://news3lv.com/feed" },
      { callSign: "KTNV", name: "KTNV ABC 13", network: "ABC", website: "https://www.ktnv.com", rssUrl: "https://www.ktnv.com/feed" },
    ],
    radioStations: [
      { callSign: "KNPR", name: "KNPR", format: "NPR", website: "https://knpr.org", rssUrl: "https://knpr.org/feed" },
    ],
  },
  {
    name: "Austin", slug: "austin", state: "TX", latitude: 30.2672, longitude: -97.7431, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["austin", "travis county", "williamson county", "hays county", "round rock", "cedar park", "pflugerville", "san marcos", "texas"],
    neighborhoods: ["Downtown", "South Congress", "East Austin", "Zilker", "Hyde Park", "Mueller", "Domain", "Barton Hills", "Travis Heights", "Clarksville", "Bouldin Creek", "North Loop", "Round Rock", "Cedar Park", "Pflugerville", "Georgetown", "Lakeway", "Bee Cave"],
    tvStations: [
      { callSign: "KEYE", name: "KEYE CBS 42", network: "CBS", website: "https://cbsaustin.com", rssUrl: "https://cbsaustin.com/feed" },
      { callSign: "KXAN", name: "KXAN NBC", network: "NBC", website: "https://www.kxan.com", rssUrl: "https://www.kxan.com/feed" },
      { callSign: "KVUE", name: "KVUE ABC 24", network: "ABC", website: "https://www.kvue.com", rssUrl: "https://www.kvue.com/feeds/syndication/rss/news" },
      { callSign: "KTBC", name: "FOX 7 Austin", network: "FOX", website: "https://www.fox7austin.com", rssUrl: "https://www.fox7austin.com/feed" },
    ],
    radioStations: [
      { callSign: "KUT", name: "KUT 90.5", format: "NPR", website: "https://www.kut.org", rssUrl: "https://www.kut.org/feed" },
      { callSign: "KLBJ", name: "KLBJ AM 590", format: "News/Talk", website: "https://www.iheart.com/live/newsradio-klbj-5328" },
    ],
  },
  {
    name: "Cincinnati", slug: "cincinnati", state: "OH", latitude: 39.1031, longitude: -84.5120, radiusKm: 40, timezone: "America/New_York",
    keywords: ["cincinnati", "hamilton county", "butler county", "warren county", "northern kentucky", "ohio"],
    neighborhoods: ["Downtown", "Over-the-Rhine", "Mount Adams", "Clifton", "Northside", "Hyde Park", "Oakley", "East Walnut Hills", "Covington", "Newport", "Mason", "West Chester", "Blue Ash", "Kenwood"],
    tvStations: [
      { callSign: "WKRC", name: "Local 12 CBS", network: "CBS", website: "https://local12.com", rssUrl: "https://local12.com/feed" },
      { callSign: "WLWT", name: "WLWT NBC 5", network: "NBC", website: "https://www.wlwt.com", rssUrl: "https://www.wlwt.com/arcio/rss" },
      { callSign: "WCPO", name: "WCPO 9 ABC", network: "ABC", website: "https://www.wcpo.com", rssUrl: "https://www.wcpo.com/feed" },
      { callSign: "WXIX", name: "FOX19 NOW", network: "FOX", website: "https://www.fox19.com", rssUrl: "https://www.fox19.com/feed" },
    ],
    radioStations: [
      { callSign: "WLW", name: "WLW 700", format: "News/Talk", website: "https://www.iheart.com/live/700wlw-1547" },
      { callSign: "WVXU", name: "WVXU", format: "NPR", website: "https://www.wvxu.org", rssUrl: "https://www.wvxu.org/feed" },
    ],
  },
  {
    name: "Kansas City", slug: "kansas-city", state: "MO", latitude: 39.0997, longitude: -94.5786, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["kansas city", "jackson county", "johnson county", "wyandotte county", "clay county", "overland park", "olathe", "independence", "missouri", "kansas"],
    neighborhoods: ["Downtown", "Power & Light", "Crossroads", "Westport", "Country Club Plaza", "Brookside", "Waldo", "River Market", "Midtown", "West Bottoms", "Overland Park", "Olathe", "Lee's Summit", "Independence", "Liberty", "North Kansas City"],
    tvStations: [
      { callSign: "KCTV", name: "KCTV 5 CBS", network: "CBS", website: "https://www.kctv5.com", rssUrl: "https://www.kctv5.com/feed" },
      { callSign: "KSHB", name: "KSHB 41 NBC", network: "NBC", website: "https://www.kshb.com", rssUrl: "https://www.kshb.com/feed" },
      { callSign: "KMBC", name: "KMBC 9 ABC", network: "ABC", website: "https://www.kmbc.com", rssUrl: "https://www.kmbc.com/arcio/rss" },
      { callSign: "WDAF", name: "FOX4 KC", network: "FOX", website: "https://fox4kc.com", rssUrl: "https://fox4kc.com/feed" },
    ],
    radioStations: [
      { callSign: "KCMO", name: "KCMO 710", format: "News/Talk", website: "https://www.iheart.com/live/710-kcmo-5407" },
      { callSign: "KCUR", name: "KCUR", format: "NPR", website: "https://www.kcur.org", rssUrl: "https://www.kcur.org/feed" },
    ],
  },
  {
    name: "Columbus", slug: "columbus", state: "OH", latitude: 39.9612, longitude: -82.9988, radiusKm: 40, timezone: "America/New_York",
    keywords: ["columbus", "franklin county", "delaware county", "ohio state", "ohio"],
    neighborhoods: ["Short North", "German Village", "Victorian Village", "Clintonville", "Grandview Heights", "Italian Village", "Franklinton", "Bexley", "Upper Arlington", "Worthington", "Dublin", "Westerville", "Gahanna", "Grove City", "Hilliard"],
    tvStations: [
      { callSign: "WBNS", name: "10TV CBS", network: "CBS", website: "https://www.10tv.com", rssUrl: "https://www.10tv.com/feeds/syndication/rss/news" },
      { callSign: "WCMH", name: "NBC4 Columbus", network: "NBC", website: "https://www.nbc4i.com", rssUrl: "https://www.nbc4i.com/feed" },
      { callSign: "WSYX", name: "ABC 6", network: "ABC", website: "https://abc6onyourside.com", rssUrl: "https://abc6onyourside.com/feed" },
      { callSign: "WTTE", name: "FOX 28", network: "FOX", website: "https://myfox28columbus.com", rssUrl: "https://myfox28columbus.com/feed" },
    ],
    radioStations: [
      { callSign: "WOSU", name: "WOSU", format: "NPR", website: "https://news.wosu.org", rssUrl: "https://news.wosu.org/feed" },
    ],
  },
  {
    name: "Indianapolis", slug: "indianapolis", state: "IN", latitude: 39.7684, longitude: -86.1581, radiusKm: 50, timezone: "America/Indiana/Indianapolis",
    keywords: ["indianapolis", "indy", "marion county", "hamilton county", "carmel", "fishers", "indiana"],
    neighborhoods: ["Downtown", "Broad Ripple", "Fountain Square", "Mass Ave", "Irvington", "Meridian-Kessler", "Carmel", "Fishers", "Noblesville", "Greenwood", "Zionsville", "Speedway", "Beech Grove"],
    tvStations: [
      { callSign: "WISH", name: "WISH-TV CBS 8", network: "CBS", website: "https://www.wishtv.com", rssUrl: "https://www.wishtv.com/feed" },
      { callSign: "WTHR", name: "WTHR NBC 13", network: "NBC", website: "https://www.wthr.com", rssUrl: "https://www.wthr.com/feeds/syndication/rss/news" },
      { callSign: "WRTV", name: "WRTV ABC 6", network: "ABC", website: "https://www.wrtv.com", rssUrl: "https://www.wrtv.com/feed" },
      { callSign: "WXIN", name: "FOX59", network: "FOX", website: "https://fox59.com", rssUrl: "https://fox59.com/feed" },
    ],
    radioStations: [
      { callSign: "WFYI", name: "WFYI", format: "NPR", website: "https://www.wfyi.org", rssUrl: "https://www.wfyi.org/feed" },
    ],
  },
  {
    name: "Cleveland", slug: "cleveland", state: "OH", latitude: 41.4993, longitude: -81.6944, radiusKm: 40, timezone: "America/New_York",
    keywords: ["cleveland", "cuyahoga county", "lake county", "akron", "lorain", "ohio"],
    neighborhoods: ["Downtown", "Ohio City", "Tremont", "University Circle", "Little Italy", "Detroit Shoreway", "Lakewood", "Shaker Heights", "Cleveland Heights", "Westlake", "Strongsville", "Parma", "Akron"],
    tvStations: [
      { callSign: "WOIO", name: "19 News CBS", network: "CBS", website: "https://www.cleveland19.com", rssUrl: "https://www.cleveland19.com/feed" },
      { callSign: "WKYC", name: "WKYC 3 NBC", network: "NBC", website: "https://www.wkyc.com", rssUrl: "https://www.wkyc.com/feeds/syndication/rss/news" },
      { callSign: "WEWS", name: "News 5 ABC", network: "ABC", website: "https://www.news5cleveland.com", rssUrl: "https://www.news5cleveland.com/feed" },
      { callSign: "WJW", name: "FOX 8 Cleveland", network: "FOX", website: "https://fox8.com", rssUrl: "https://fox8.com/feed" },
    ],
    radioStations: [
      { callSign: "WCPN", name: "Ideastream", format: "NPR", website: "https://www.ideastream.org", rssUrl: "https://www.ideastream.org/feed" },
    ],
  },
  {
    name: "San Jose", slug: "san-jose", state: "CA", latitude: 37.3382, longitude: -121.8863, radiusKm: 30, timezone: "America/Los_Angeles",
    keywords: ["san jose", "santa clara county", "silicon valley", "sunnyvale", "cupertino", "milpitas", "campbell", "los gatos"],
    neighborhoods: ["Downtown", "Willow Glen", "Japantown", "Santana Row", "Almaden Valley", "Evergreen", "Berryessa", "Campbell", "Cupertino", "Sunnyvale", "Santa Clara", "Los Gatos", "Milpitas", "Saratoga"],
    tvStations: [
      { callSign: "KNTV", name: "NBC Bay Area", network: "NBC", website: "https://www.nbcbayarea.com", rssUrl: "https://www.nbcbayarea.com/feed" },
      { callSign: "KPIX", name: "CBS Bay Area", network: "CBS", website: "https://www.cbsnews.com/sanfrancisco", rssUrl: "https://www.cbsnews.com/sanfrancisco/latest/rss" },
    ],
    radioStations: [
      { callSign: "KLIV", name: "KLIV 1590", format: "News/Talk", website: "https://www.kliv.com" },
      { callSign: "KQED", name: "KQED", format: "NPR", website: "https://www.kqed.org", rssUrl: "https://www.kqed.org/news/feed" },
    ],
  },
  {
    name: "Nashville", slug: "nashville", state: "TN", latitude: 36.1627, longitude: -86.7816, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["nashville", "davidson county", "williamson county", "music city", "franklin", "murfreesboro", "tennessee"],
    neighborhoods: ["Downtown", "The Gulch", "East Nashville", "Germantown", "12 South", "Midtown", "Music Row", "Berry Hill", "Sylvan Park", "Bellevue", "Green Hills", "Brentwood", "Franklin", "Murfreesboro", "Hendersonville"],
    tvStations: [
      { callSign: "WTVF", name: "NewsChannel 5 CBS", network: "CBS", website: "https://www.newschannel5.com", rssUrl: "https://www.newschannel5.com/feed" },
      { callSign: "WSMV", name: "WSMV 4 NBC", network: "NBC", website: "https://www.wsmv.com", rssUrl: "https://www.wsmv.com/feed" },
      { callSign: "WKRN", name: "News 2 ABC", network: "ABC", website: "https://www.wkrn.com", rssUrl: "https://www.wkrn.com/feed" },
      { callSign: "WZTV", name: "FOX 17", network: "FOX", website: "https://fox17.com", rssUrl: "https://fox17.com/feed" },
    ],
    radioStations: [
      { callSign: "WPLN", name: "Nashville Public Radio", format: "NPR", website: "https://wpln.org", rssUrl: "https://wpln.org/feed" },
    ],
  },
  {
    name: "Virginia Beach", slug: "virginia-beach", state: "VA", latitude: 36.8529, longitude: -75.9780, radiusKm: 50, timezone: "America/New_York",
    keywords: ["virginia beach", "norfolk", "newport news", "hampton roads", "chesapeake", "portsmouth", "suffolk", "hampton"],
    neighborhoods: ["Oceanfront", "Town Center", "Ghent", "Downtown Norfolk", "Chesapeake", "Hampton", "Newport News", "Portsmouth", "Suffolk", "Williamsburg"],
    tvStations: [
      { callSign: "WTKR", name: "News 3 CBS", network: "CBS", website: "https://www.wtkr.com", rssUrl: "https://www.wtkr.com/feed" },
      { callSign: "WAVY", name: "WAVY 10 NBC", network: "NBC", website: "https://www.wavy.com", rssUrl: "https://www.wavy.com/feed" },
      { callSign: "WVEC", name: "13News Now ABC", network: "ABC", website: "https://www.13newsnow.com", rssUrl: "https://www.13newsnow.com/feeds/syndication/rss/news" },
    ],
    radioStations: [
      { callSign: "WHRO", name: "WHRO", format: "NPR", website: "https://whro.org", rssUrl: "https://whro.org/feed" },
    ],
  },
  {
    name: "Providence", slug: "providence", state: "RI", latitude: 41.8240, longitude: -71.4128, radiusKm: 30, timezone: "America/New_York",
    keywords: ["providence", "rhode island", "warwick", "cranston", "pawtucket", "new bedford", "fall river"],
    neighborhoods: ["Downtown", "Federal Hill", "College Hill", "East Side", "Wayland Square", "Fox Point", "Warwick", "Cranston", "Pawtucket", "Newport"],
    tvStations: [
      { callSign: "WPRI", name: "WPRI CBS 12", network: "CBS", website: "https://www.wpri.com", rssUrl: "https://www.wpri.com/feed" },
      { callSign: "WJAR", name: "NBC 10", network: "NBC", website: "https://turnto10.com", rssUrl: "https://turnto10.com/feed" },
      { callSign: "WLNE", name: "ABC 6", network: "ABC", website: "https://www.abc6.com", rssUrl: "https://www.abc6.com/feed" },
    ],
    radioStations: [
      { callSign: "RIPR", name: "Rhode Island Public Radio", format: "NPR", website: "https://thepublicsradio.org", rssUrl: "https://thepublicsradio.org/feed" },
    ],
  },
  {
    name: "Milwaukee", slug: "milwaukee", state: "WI", latitude: 43.0389, longitude: -87.9065, radiusKm: 40, timezone: "America/Chicago",
    keywords: ["milwaukee", "milwaukee county", "waukesha", "racine", "kenosha", "wisconsin"],
    neighborhoods: ["Downtown", "Third Ward", "Bay View", "East Side", "Riverwest", "Walker's Point", "Shorewood", "Whitefish Bay", "Wauwatosa", "Brookfield", "Waukesha"],
    tvStations: [
      { callSign: "WDJT", name: "CBS 58", network: "CBS", website: "https://www.cbs58.com", rssUrl: "https://www.cbs58.com/feed" },
      { callSign: "WTMJ", name: "TMJ4 NBC", network: "NBC", website: "https://www.tmj4.com", rssUrl: "https://www.tmj4.com/feed" },
      { callSign: "WISN", name: "WISN 12 ABC", network: "ABC", website: "https://www.wisn.com", rssUrl: "https://www.wisn.com/arcio/rss" },
      { callSign: "WITI", name: "FOX6 Milwaukee", network: "FOX", website: "https://www.fox6now.com", rssUrl: "https://www.fox6now.com/feed" },
    ],
    radioStations: [
      { callSign: "WUWM", name: "WUWM", format: "NPR", website: "https://www.wuwm.com", rssUrl: "https://www.wuwm.com/feed" },
    ],
  },
  {
    name: "Jacksonville", slug: "jacksonville", state: "FL", latitude: 30.3322, longitude: -81.6557, radiusKm: 50, timezone: "America/New_York",
    keywords: ["jacksonville", "duval county", "st johns county", "clay county", "jax", "beaches", "florida"],
    neighborhoods: ["Downtown", "Riverside", "San Marco", "Springfield", "Murray Hill", "Avondale", "Beaches", "Mandarin", "Southside", "Orange Park", "St Augustine"],
    tvStations: [
      { callSign: "WJAX", name: "CBS47", network: "CBS", website: "https://www.actionnewsjax.com", rssUrl: "https://www.actionnewsjax.com/feed" },
      { callSign: "WTLV", name: "First Coast News NBC", network: "NBC", website: "https://www.firstcoastnews.com", rssUrl: "https://www.firstcoastnews.com/feeds/syndication/rss/news" },
      { callSign: "WJXX", name: "ABC 25", network: "ABC", website: "https://www.actionnewsjax.com" },
    ],
    radioStations: [
      { callSign: "WJCT", name: "WJCT", format: "NPR", website: "https://news.wjct.org", rssUrl: "https://news.wjct.org/feed" },
    ],
  },
  {
    name: "Oklahoma City", slug: "oklahoma-city", state: "OK", latitude: 35.4676, longitude: -97.5164, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["oklahoma city", "okc", "oklahoma county", "norman", "edmond", "moore", "midwest city", "oklahoma"],
    neighborhoods: ["Downtown", "Bricktown", "Midtown", "Paseo", "Plaza District", "Automobile Alley", "Edmond", "Norman", "Moore", "Yukon", "Mustang", "Del City"],
    tvStations: [
      { callSign: "KWTV", name: "News 9 CBS", network: "CBS", website: "https://www.news9.com", rssUrl: "https://www.news9.com/feed" },
      { callSign: "KFOR", name: "KFOR NBC 4", network: "NBC", website: "https://kfor.com", rssUrl: "https://kfor.com/feed" },
      { callSign: "KOCO", name: "KOCO 5 ABC", network: "ABC", website: "https://www.koco.com", rssUrl: "https://www.koco.com/arcio/rss" },
      { callSign: "KOKH", name: "FOX 25", network: "FOX", website: "https://okcfox.com", rssUrl: "https://okcfox.com/feed" },
    ],
    radioStations: [
      { callSign: "KOSU", name: "KOSU", format: "NPR", website: "https://www.kosu.org", rssUrl: "https://www.kosu.org/feed" },
    ],
  },
  {
    name: "Raleigh", slug: "raleigh", state: "NC", latitude: 35.7796, longitude: -78.6382, radiusKm: 40, timezone: "America/New_York",
    keywords: ["raleigh", "durham", "wake county", "durham county", "chapel hill", "cary", "triangle", "research triangle", "north carolina"],
    neighborhoods: ["Downtown Raleigh", "Glenwood South", "North Hills", "Cameron Village", "Downtown Durham", "Ninth Street", "Chapel Hill", "Cary", "Apex", "Holly Springs", "Wake Forest", "Morrisville", "Fuquay-Varina"],
    tvStations: [
      { callSign: "WRAL", name: "WRAL CBS 5", network: "CBS", website: "https://www.wral.com", rssUrl: "https://www.wral.com/rss" },
      { callSign: "WNCN", name: "CBS 17", network: "CBS", website: "https://www.cbs17.com", rssUrl: "https://www.cbs17.com/feed" },
      { callSign: "WTVD", name: "ABC 11", network: "ABC", website: "https://abc11.com", rssUrl: "https://abc11.com/feed" },
    ],
    radioStations: [
      { callSign: "WUNC", name: "WUNC", format: "NPR", website: "https://www.wunc.org", rssUrl: "https://www.wunc.org/feed" },
    ],
  },
  {
    name: "Memphis", slug: "memphis", state: "TN", latitude: 35.1495, longitude: -90.0490, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["memphis", "shelby county", "germantown", "collierville", "bartlett", "southaven", "west memphis", "tennessee"],
    neighborhoods: ["Downtown", "Midtown", "Cooper-Young", "Overton Square", "Beale Street", "South Main", "Crosstown", "East Memphis", "Germantown", "Collierville", "Bartlett", "Cordova"],
    tvStations: [
      { callSign: "WREG", name: "News Channel 3 CBS", network: "CBS", website: "https://wreg.com", rssUrl: "https://wreg.com/feed" },
      { callSign: "WMC", name: "Action News 5 NBC", network: "NBC", website: "https://www.actionnews5.com", rssUrl: "https://www.actionnews5.com/feed" },
      { callSign: "WHBQ", name: "FOX13 Memphis", network: "FOX", website: "https://www.fox13memphis.com", rssUrl: "https://www.fox13memphis.com/feed" },
    ],
    radioStations: [
      { callSign: "WKNO", name: "WKNO", format: "NPR", website: "https://www.wkno.org", rssUrl: "https://www.wkno.org/feed" },
    ],
  },
  {
    name: "Richmond", slug: "richmond", state: "VA", latitude: 37.5407, longitude: -77.4360, radiusKm: 40, timezone: "America/New_York",
    keywords: ["richmond", "henrico county", "chesterfield county", "hanover county", "rva", "virginia"],
    neighborhoods: ["Downtown", "The Fan", "Carytown", "Scott's Addition", "Church Hill", "Shockoe Bottom", "Museum District", "Short Pump", "Midlothian", "Mechanicsville", "Glen Allen"],
    tvStations: [
      { callSign: "WTVR", name: "CBS 6 Richmond", network: "CBS", website: "https://www.wtvr.com", rssUrl: "https://www.wtvr.com/feed" },
      { callSign: "WWBT", name: "NBC12", network: "NBC", website: "https://www.nbc12.com", rssUrl: "https://www.nbc12.com/feed" },
      { callSign: "WRIC", name: "8News ABC", network: "ABC", website: "https://www.wric.com", rssUrl: "https://www.wric.com/feed" },
    ],
    radioStations: [
      { callSign: "WCVE", name: "VPM News", format: "NPR", website: "https://vpm.org", rssUrl: "https://vpm.org/feed" },
    ],
  },
  {
    name: "Louisville", slug: "louisville", state: "KY", latitude: 38.2527, longitude: -85.7585, radiusKm: 40, timezone: "America/Kentucky/Louisville",
    keywords: ["louisville", "jefferson county", "kentucky", "southern indiana", "bardstown"],
    neighborhoods: ["Downtown", "NuLu", "Butchertown", "Highlands", "Germantown", "Old Louisville", "Clifton", "St Matthews", "Jeffersontown", "Okolona", "New Albany"],
    tvStations: [
      { callSign: "WLKY", name: "WLKY CBS 32", network: "CBS", website: "https://www.wlky.com", rssUrl: "https://www.wlky.com/arcio/rss" },
      { callSign: "WAVE", name: "WAVE 3 NBC", network: "NBC", website: "https://www.wave3.com", rssUrl: "https://www.wave3.com/feed" },
      { callSign: "WHAS", name: "WHAS 11 ABC", network: "ABC", website: "https://www.whas11.com", rssUrl: "https://www.whas11.com/feeds/syndication/rss/news" },
    ],
    radioStations: [
      { callSign: "WFPL", name: "WFPL", format: "NPR", website: "https://wfpl.org", rssUrl: "https://wfpl.org/feed" },
    ],
  },
  {
    name: "New Orleans", slug: "new-orleans", state: "LA", latitude: 29.9511, longitude: -90.0715, radiusKm: 40, timezone: "America/Chicago",
    keywords: ["new orleans", "nola", "orleans parish", "jefferson parish", "metairie", "kenner", "louisiana"],
    neighborhoods: ["French Quarter", "Garden District", "Marigny", "Bywater", "Treme", "Mid-City", "Uptown", "CBD", "Warehouse District", "Irish Channel", "Gentilly", "Lakeview", "Metairie", "Kenner", "Algiers"],
    tvStations: [
      { callSign: "WWL", name: "WWL-TV CBS 4", network: "CBS", website: "https://www.wwltv.com", rssUrl: "https://www.wwltv.com/feeds/syndication/rss/news" },
      { callSign: "WDSU", name: "WDSU NBC 6", network: "NBC", website: "https://www.wdsu.com", rssUrl: "https://www.wdsu.com/arcio/rss" },
      { callSign: "WGNO", name: "WGNO ABC 26", network: "ABC", website: "https://wgno.com", rssUrl: "https://wgno.com/feed" },
      { callSign: "WVUE", name: "FOX 8 NOLA", network: "FOX", website: "https://www.fox8live.com", rssUrl: "https://www.fox8live.com/feed" },
    ],
    radioStations: [
      { callSign: "WWNO", name: "WWNO", format: "NPR", website: "https://www.wwno.org", rssUrl: "https://www.wwno.org/feed" },
    ],
  },
  {
    name: "Salt Lake City", slug: "salt-lake-city", state: "UT", latitude: 40.7608, longitude: -111.8910, radiusKm: 50, timezone: "America/Denver",
    keywords: ["salt lake city", "salt lake county", "utah county", "provo", "ogden", "sandy", "west jordan", "utah"],
    neighborhoods: ["Downtown", "Sugar House", "The Avenues", "Capitol Hill", "9th & 9th", "Liberty Park", "Marmalade", "Sandy", "Draper", "Provo", "Ogden", "Park City", "Lehi", "Orem"],
    tvStations: [
      { callSign: "KUTV", name: "KUTV CBS 2", network: "CBS", website: "https://kutv.com", rssUrl: "https://kutv.com/feed" },
      { callSign: "KSL", name: "KSL 5 NBC", network: "NBC", website: "https://www.ksl.com", rssUrl: "https://www.ksl.com/rss" },
      { callSign: "KTVX", name: "ABC4 Utah", network: "ABC", website: "https://www.abc4.com", rssUrl: "https://www.abc4.com/feed" },
      { callSign: "KSTU", name: "FOX 13", network: "FOX", website: "https://www.fox13now.com", rssUrl: "https://www.fox13now.com/feed" },
    ],
    radioStations: [
      { callSign: "KUER", name: "KUER", format: "NPR", website: "https://www.kuer.org", rssUrl: "https://www.kuer.org/feed" },
    ],
  },
  {
    name: "Hartford", slug: "hartford", state: "CT", latitude: 41.7658, longitude: -72.6734, radiusKm: 30, timezone: "America/New_York",
    keywords: ["hartford", "new haven", "connecticut", "west hartford", "east hartford", "manchester", "bristol"],
    neighborhoods: ["Downtown", "West Hartford", "East Hartford", "Glastonbury", "Manchester", "New Britain", "Farmington", "Simsbury", "Wethersfield", "Rocky Hill"],
    tvStations: [
      { callSign: "WFSB", name: "WFSB CBS 3", network: "CBS", website: "https://www.wfsb.com", rssUrl: "https://www.wfsb.com/feed" },
      { callSign: "WVIT", name: "NBC CT", network: "NBC", website: "https://www.nbcconnecticut.com", rssUrl: "https://www.nbcconnecticut.com/feed" },
      { callSign: "WTNH", name: "News 8 ABC", network: "ABC", website: "https://www.wtnh.com", rssUrl: "https://www.wtnh.com/feed" },
      { callSign: "WTIC", name: "FOX 61", network: "FOX", website: "https://www.fox61.com", rssUrl: "https://www.fox61.com/feed" },
    ],
    radioStations: [
      { callSign: "WNPR", name: "Connecticut Public Radio", format: "NPR", website: "https://www.ctpublic.org", rssUrl: "https://www.ctpublic.org/feed" },
    ],
  },
  {
    name: "Birmingham", slug: "birmingham", state: "AL", latitude: 33.5207, longitude: -86.8025, radiusKm: 50, timezone: "America/Chicago",
    keywords: ["birmingham", "jefferson county", "shelby county", "hoover", "vestavia hills", "homewood", "mountain brook", "alabama"],
    neighborhoods: ["Downtown", "Avondale", "Lakeview", "Five Points South", "Homewood", "Mountain Brook", "Vestavia Hills", "Hoover", "Trussville", "Irondale", "Bessemer"],
    tvStations: [
      { callSign: "WBRC", name: "WBRC FOX 6", network: "FOX", website: "https://www.wbrc.com", rssUrl: "https://www.wbrc.com/feed" },
      { callSign: "WVTM", name: "WVTM 13 NBC", network: "NBC", website: "https://www.wvtm13.com", rssUrl: "https://www.wvtm13.com/arcio/rss" },
      { callSign: "WBMA", name: "ABC 33/40", network: "ABC", website: "https://abc3340.com", rssUrl: "https://abc3340.com/feed" },
    ],
    radioStations: [
      { callSign: "WBHM", name: "WBHM", format: "NPR", website: "https://wbhm.org", rssUrl: "https://wbhm.org/feed" },
    ],
  },
  {
    name: "Buffalo", slug: "buffalo", state: "NY", latitude: 42.8864, longitude: -78.8784, radiusKm: 40, timezone: "America/New_York",
    keywords: ["buffalo", "erie county", "niagara falls", "niagara county", "tonawanda", "cheektowaga", "western new york"],
    neighborhoods: ["Downtown", "Elmwood Village", "Allentown", "North Buffalo", "South Buffalo", "Hertel", "Canalside", "Amherst", "Williamsville", "Tonawanda", "Cheektowaga", "Niagara Falls", "Lockport"],
    tvStations: [
      { callSign: "WIVB", name: "News 4 CBS", network: "CBS", website: "https://www.wivb.com", rssUrl: "https://www.wivb.com/feed" },
      { callSign: "WGRZ", name: "WGRZ 2 NBC", network: "NBC", website: "https://www.wgrz.com", rssUrl: "https://www.wgrz.com/feeds/syndication/rss/news" },
      { callSign: "WKBW", name: "WKBW 7 ABC", network: "ABC", website: "https://www.wkbw.com", rssUrl: "https://www.wkbw.com/feed" },
    ],
    radioStations: [
      { callSign: "WBFO", name: "WBFO", format: "NPR", website: "https://www.wbfo.org", rssUrl: "https://www.wbfo.org/feed" },
    ],
  },
];
