// Team nicknames people actually type (v1.5.0). Keyed by the team's full ESPN name, folded (see fuzzy.js fold()).
// Only well-known, public nicknames/short forms; matching also covers location, mascot, abbreviation and typos.
import { fold } from './fuzzy.js?v=29';
const RAW = {
  // NFL
  'San Francisco 49ers': ['Niners', 'Forty Niners', 'SF'], 'New England Patriots': ['Pats'], 'Tampa Bay Buccaneers': ['Bucs'], 'Green Bay Packers': ['Pack', 'GB'],
  'Kansas City Chiefs': ['KC'], 'Philadelphia Eagles': ['Birds', 'Philly'], 'Jacksonville Jaguars': ['Jags'], 'Arizona Cardinals': ['Cards', 'Big Red'], 'Washington Commanders': ['Commies', 'WFT', 'DC'],
  'Dallas Cowboys': ['Boys', 'Americas Team'], 'Pittsburgh Steelers': ['Stillers'], 'Cincinnati Bengals': ['Bungals', 'Cincy'], 'Las Vegas Raiders': ['Raidahs', 'Silver and Black'],
  'Los Angeles Rams': ['LA Rams'], 'Los Angeles Chargers': ['Bolts', 'LA Chargers'], 'New York Giants': ['G Men', 'Big Blue', 'NYG'], 'New York Jets': ['Gang Green', 'NYJ'],
  'Minnesota Vikings': ['Vikes', 'Purple'], 'Seattle Seahawks': ['Hawks', 'Legion of Boom', '12s'], 'Denver Broncos': ['Donkeys'], 'Indianapolis Colts': ['Indy'], 'Tennessee Titans': ['Titans'],
  // MLB
  'Boston Red Sox': ['Sox', 'Sawx'], 'Chicago White Sox': ['Sox', 'Pale Hose', 'Chisox'], 'New York Yankees': ['Yanks', 'Bronx Bombers', 'NYY'], 'New York Mets': ['Amazins', 'Metropolitans', 'NYM'],
  'Los Angeles Dodgers': ['Dodgers', 'Blue Crew', 'LAD'], 'Chicago Cubs': ['Cubbies', 'North Siders'], 'San Diego Padres': ['Friars', 'Pads'], 'Philadelphia Phillies': ['Phils', 'Phightins'],
  'St. Louis Cardinals': ['Cards', 'Redbirds', 'STL'], 'Toronto Blue Jays': ['Jays'], 'Atlanta Braves': ['Bravos'], 'Houston Astros': ['Stros'], 'Arizona Diamondbacks': ['Dbacks', 'Snakes'],
  'Cincinnati Reds': ['Redlegs'], 'Detroit Tigers': ['Tigs'], 'Athletics': ['As', 'Oakland', 'Sacramento'], 'Tampa Bay Rays': ['Rays'], 'Seattle Mariners': ['Ms'],
  // NBA / WNBA
  'Philadelphia 76ers': ['Sixers', 'Philly'], 'Los Angeles Lakers': ['Lakeshow', 'LAL'], 'LA Clippers': ['Clips', 'Clippers', 'LAC'], 'Golden State Warriors': ['Dubs', 'GSW', 'Warriors'],
  'Cleveland Cavaliers': ['Cavs'], 'Dallas Mavericks': ['Mavs'], 'Minnesota Timberwolves': ['Wolves', 'Twolves'], 'Portland Trail Blazers': ['Blazers', 'Rip City'], 'Oklahoma City Thunder': ['OKC'],
  'New Orleans Pelicans': ['Pels', 'NOLA'], 'San Antonio Spurs': ['Spurs'], 'Brooklyn Nets': ['Nets'], 'New York Knicks': ['Knicks', 'Knickerbockers'], 'Boston Celtics': ['Cs', 'Celts'],
  'Indiana Pacers': ['Pacers'], 'Las Vegas Aces': ['Aces'], 'New York Liberty': ['Libs'], 'Golden State Valkyries': ['Valks'],
  // NHL
  'Montreal Canadiens': ['Habs', 'Canadiens', 'Les Habitants'], 'Toronto Maple Leafs': ['Leafs', 'Buds'], 'Pittsburgh Penguins': ['Pens'], 'Philadelphia Flyers': ['Flyers', 'Broad Street Bullies'],
  'Chicago Blackhawks': ['Hawks'], 'Detroit Red Wings': ['Wings'], 'Tampa Bay Lightning': ['Bolts'], 'Columbus Blue Jackets': ['CBJ', 'Jackets'], 'Vegas Golden Knights': ['Knights', 'VGK'],
  'Washington Capitals': ['Caps'], 'Colorado Avalanche': ['Avs'], 'Boston Bruins': ['Bs'], 'Florida Panthers': ['Cats'], 'New York Rangers': ['Blueshirts', 'NYR'], 'New York Islanders': ['Isles', 'NYI'],
  'Edmonton Oilers': ['Oil'], 'Carolina Hurricanes': ['Canes'], 'Anaheim Ducks': ['Ducks'], 'Utah Mammoth': ['Utah Hockey Club', 'Mammoth'],
  // Soccer
  'Manchester United': ['Man United', 'Man Utd', 'Man U', 'United', 'Red Devils', 'MUFC'], 'Manchester City': ['Man City', 'City', 'Citizens', 'MCFC'], 'Arsenal': ['Gunners', 'Gooners'],
  'Tottenham Hotspur': ['Spurs', 'Tottenham'], 'Liverpool': ['Reds', 'LFC'], 'Chelsea': ['Blues', 'CFC'], 'Newcastle United': ['Magpies', 'Toon', 'Newcastle'], 'West Ham United': ['Hammers', 'Irons'],
  'Aston Villa': ['Villa', 'Villans'], 'Wolverhampton Wanderers': ['Wolves'], 'Brighton & Hove Albion': ['Brighton', 'Seagulls'], 'Nottingham Forest': ['Forest'], 'Everton': ['Toffees'],
  'Barcelona': ['Barca', 'Blaugrana', 'FCB'], 'Real Madrid': ['Madrid', 'Los Blancos', 'Real'], 'Atlético Madrid': ['Atleti', 'Atletico'], 'Athletic Club': ['Athletic Bilbao', 'Bilbao'],
  'Bayern Munich': ['Bayern', 'FC Bayern', 'Bayern Munchen'], 'Borussia Dortmund': ['Dortmund', 'BVB'], 'Bayer Leverkusen': ['Leverkusen'], 'RB Leipzig': ['Leipzig'],
  'Juventus': ['Juve', 'Old Lady'], 'Internazionale': ['Inter', 'Inter Milan'], 'AC Milan': ['Milan', 'Rossoneri'], 'AS Roma': ['Roma'], 'Napoli': ['Partenopei'],
  'Paris Saint-Germain': ['PSG', 'Paris'], 'Olympique de Marseille': ['Marseille', 'OM'], 'Olympique Lyonnais': ['Lyon', 'OL'], 'LA Galaxy': ['Galaxy'], 'Los Angeles FC': ['LAFC'],
  'Inter Miami CF': ['Inter Miami', 'Miami'], 'New York City FC': ['NYCFC'], 'New York Red Bulls': ['Red Bulls', 'RBNY'], 'Atlanta United FC': ['ATL UTD', 'Atlanta United'], 'Club América': ['America', 'Aguilas'],
  'Guadalajara': ['Chivas'], 'Cruz Azul': ['La Maquina'], 'UNAM Pumas': ['Pumas'],
  // College
  'Alabama Crimson Tide': ['Bama', 'Roll Tide', 'Tide'], 'Ole Miss Rebels': ['Ole Miss', 'Mississippi'], 'Mississippi State Bulldogs': ['Miss State', 'MSU'], 'Louisiana State Tigers': ['LSU'], 'LSU Tigers': ['LSU'],
  'Southern California Trojans': ['USC'], 'USC Trojans': ['SC', 'Southern Cal'], 'UCLA Bruins': ['UCLA'], 'Pittsburgh Panthers': ['Pitt'], 'UConn Huskies': ['Connecticut', 'UConn'],
  'Ohio State Buckeyes': ['tOSU', 'Buckeyes', 'OSU'], 'Michigan Wolverines': ['UM', 'Big Blue'], 'Penn State Nittany Lions': ['PSU'], 'Texas A&M Aggies': ['TAMU', 'Aggies'], 'Texas Longhorns': ['UT', 'Horns'],
  'Miami Hurricanes': ['The U', 'Canes', 'Miami FL'], 'Miami (OH) RedHawks': ['Miami Ohio'], 'Florida State Seminoles': ['FSU', 'Noles'], 'Florida Gators': ['UF'], 'Georgia Bulldogs': ['UGA', 'Dawgs'],
  'Virginia Tech Hokies': ['VT', 'Hokies'], 'Brigham Young Cougars': ['BYU'], 'BYU Cougars': ['Brigham Young'], 'Utah Utes': ['Utes', 'U of U'], 'Utah State Aggies': ['USU'], 'Boise State Broncos': ['BSU', 'Boise'],
  'North Carolina Tar Heels': ['UNC', 'Heels'], 'NC State Wolfpack': ['North Carolina State', 'Pack'], 'Southern Methodist Mustangs': ['SMU'], 'SMU Mustangs': ['Southern Methodist'], 'TCU Horned Frogs': ['Texas Christian', 'Frogs'],
  'UNLV Rebels': ['Las Vegas'], 'UTEP Miners': ['El Paso'], 'UTSA Roadrunners': ['San Antonio'], 'UCF Knights': ['Central Florida'], 'USF Bulls': ['South Florida'], 'South Florida Bulls': ['USF'],
  'Hawaii Rainbow Warriors': ["Hawai'i", 'Bows'], "Hawai'i Rainbow Warriors": ['Hawaii', 'Bows'], 'Louisiana Ragin\' Cajuns': ['ULL', 'Lafayette', 'Cajuns'], 'Massachusetts Minutemen': ['UMass'],
  'North Dakota State Bison': ['NDSU'], 'South Dakota State Jackrabbits': ['SDSU', 'Jacks'], 'James Madison Dukes': ['JMU'], 'Appalachian State Mountaineers': ['App State', 'App'], 'App State Mountaineers': ['Appalachian State'],
  'Gonzaga Bulldogs': ['Zags'], 'Kentucky Wildcats': ['UK', 'Cats'], 'Kansas Jayhawks': ['KU', 'Rock Chalk'], 'Duke Blue Devils': ['Dookies'], 'Villanova Wildcats': ['Nova'], 'Saint Mary\'s Gaels': ['St Marys'],
  'Virginia Commonwealth Rams': ['VCU'], 'VCU Rams': ['Virginia Commonwealth'], 'Loyola Chicago Ramblers': ['Loyola'], 'St. John\'s Red Storm': ['Saint Johns', 'Johnnies'], 'Montana Grizzlies': ['Griz'],
  'Sam Houston Bearkats': ['Sam Houston State', 'SHSU'], 'Stephen F. Austin Lumberjacks': ['SFA'], 'Florida A&M Rattlers': ['FAMU'], 'Jackson State Tigers': ['JSU', 'Jackson St'], 'Prairie View A&M Panthers': ['PVAMU'],
  // AUSL
  'Utah Talons': ['Talons'], 'Chicago Bandits': ['Bandits'], 'Texas Volts': ['Volts'], 'Oklahoma City Spark': ['OKC Spark', 'Spark'], 'Portland Cascade': ['Cascade'], 'Carolina Blaze': ['Blaze']
};
export const ALIASES = new Map(Object.entries(RAW).map(([k, v]) => [fold(k), v]));
export const aliasesOf = (name) => ALIASES.get(fold(name)) || [];
