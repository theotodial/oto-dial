/**
 * Area Code to City/State Mapping
 * Maps the first 3 digits (area code) of a US phone number to its primary city and state
 */

const areaCodeMapping = {
  // Alabama
  '205': { city: 'Birmingham', state: 'Alabama', timezone: 'Central' },
  '251': { city: 'Mobile', state: 'Alabama', timezone: 'Central' },
  '256': { city: 'Huntsville', state: 'Alabama', timezone: 'Central' },
  '334': { city: 'Montgomery', state: 'Alabama', timezone: 'Central' },
  '938': { city: 'Auburn', state: 'Alabama', timezone: 'Central' },
  
  // Alaska
  '907': { city: 'Anchorage', state: 'Alaska', timezone: 'Alaska' },
  
  // Arizona
  '480': { city: 'Mesa', state: 'Arizona', timezone: 'Mountain' },
  '520': { city: 'Tucson', state: 'Arizona', timezone: 'Mountain' },
  '602': { city: 'Phoenix', state: 'Arizona', timezone: 'Mountain' },
  '623': { city: 'Glendale', state: 'Arizona', timezone: 'Mountain' },
  '928': { city: 'Flagstaff', state: 'Arizona', timezone: 'Mountain' },
  
  // Arkansas
  '479': { city: 'Fort Smith', state: 'Arkansas', timezone: 'Central' },
  '501': { city: 'Little Rock', state: 'Arkansas', timezone: 'Central' },
  '870': { city: 'Jonesboro', state: 'Arkansas', timezone: 'Central' },
  
  // California
  '209': { city: 'Stockton', state: 'California', timezone: 'Pacific' },
  '213': { city: 'Los Angeles', state: 'California', timezone: 'Pacific' },
  '310': { city: 'Beverly Hills', state: 'California', timezone: 'Pacific' },
  '323': { city: 'Los Angeles', state: 'California', timezone: 'Pacific' },
  '408': { city: 'San Jose', state: 'California', timezone: 'Pacific' },
  '415': { city: 'San Francisco', state: 'California', timezone: 'Pacific' },
  '424': { city: 'Los Angeles', state: 'California', timezone: 'Pacific' },
  '442': { city: 'Oceanside', state: 'California', timezone: 'Pacific' },
  '510': { city: 'Oakland', state: 'California', timezone: 'Pacific' },
  '530': { city: 'Sacramento', state: 'California', timezone: 'Pacific' },
  '559': { city: 'Fresno', state: 'California', timezone: 'Pacific' },
  '562': { city: 'Long Beach', state: 'California', timezone: 'Pacific' },
  '619': { city: 'San Diego', state: 'California', timezone: 'Pacific' },
  '626': { city: 'Pasadena', state: 'California', timezone: 'Pacific' },
  '628': { city: 'San Francisco', state: 'California', timezone: 'Pacific' },
  '650': { city: 'Palo Alto', state: 'California', timezone: 'Pacific' },
  '657': { city: 'Anaheim', state: 'California', timezone: 'Pacific' },
  '661': { city: 'Bakersfield', state: 'California', timezone: 'Pacific' },
  '669': { city: 'San Jose', state: 'California', timezone: 'Pacific' },
  '707': { city: 'Santa Rosa', state: 'California', timezone: 'Pacific' },
  '714': { city: 'Anaheim', state: 'California', timezone: 'Pacific' },
  '747': { city: 'Burbank', state: 'California', timezone: 'Pacific' },
  '760': { city: 'Oceanside', state: 'California', timezone: 'Pacific' },
  '805': { city: 'Oxnard', state: 'California', timezone: 'Pacific' },
  '818': { city: 'Burbank', state: 'California', timezone: 'Pacific' },
  '831': { city: 'Salinas', state: 'California', timezone: 'Pacific' },
  '858': { city: 'San Diego', state: 'California', timezone: 'Pacific' },
  '909': { city: 'San Bernardino', state: 'California', timezone: 'Pacific' },
  '916': { city: 'Sacramento', state: 'California', timezone: 'Pacific' },
  '925': { city: 'Concord', state: 'California', timezone: 'Pacific' },
  '949': { city: 'Irvine', state: 'California', timezone: 'Pacific' },
  '951': { city: 'Riverside', state: 'California', timezone: 'Pacific' },
  
  // Colorado
  '303': { city: 'Denver', state: 'Colorado', timezone: 'Mountain' },
  '719': { city: 'Colorado Springs', state: 'Colorado', timezone: 'Mountain' },
  '720': { city: 'Denver', state: 'Colorado', timezone: 'Mountain' },
  '970': { city: 'Fort Collins', state: 'Colorado', timezone: 'Mountain' },
  
  // Connecticut
  '203': { city: 'Bridgeport', state: 'Connecticut', timezone: 'Eastern' },
  '475': { city: 'New Haven', state: 'Connecticut', timezone: 'Eastern' },
  '860': { city: 'Hartford', state: 'Connecticut', timezone: 'Eastern' },
  
  // Delaware
  '302': { city: 'Wilmington', state: 'Delaware', timezone: 'Eastern' },
  
  // Florida
  '305': { city: 'Miami', state: 'Florida', timezone: 'Eastern' },
  '321': { city: 'Orlando', state: 'Florida', timezone: 'Eastern' },
  '352': { city: 'Gainesville', state: 'Florida', timezone: 'Eastern' },
  '386': { city: 'Daytona Beach', state: 'Florida', timezone: 'Eastern' },
  '407': { city: 'Orlando', state: 'Florida', timezone: 'Eastern' },
  '561': { city: 'West Palm Beach', state: 'Florida', timezone: 'Eastern' },
  '727': { city: 'St. Petersburg', state: 'Florida', timezone: 'Eastern' },
  '754': { city: 'Fort Lauderdale', state: 'Florida', timezone: 'Eastern' },
  '772': { city: 'Port St. Lucie', state: 'Florida', timezone: 'Eastern' },
  '786': { city: 'Miami', state: 'Florida', timezone: 'Eastern' },
  '813': { city: 'Tampa', state: 'Florida', timezone: 'Eastern' },
  '850': { city: 'Tallahassee', state: 'Florida', timezone: 'Eastern' },
  '863': { city: 'Lakeland', state: 'Florida', timezone: 'Eastern' },
  '904': { city: 'Jacksonville', state: 'Florida', timezone: 'Eastern' },
  '941': { city: 'Sarasota', state: 'Florida', timezone: 'Eastern' },
  '954': { city: 'Fort Lauderdale', state: 'Florida', timezone: 'Eastern' },
  
  // Georgia
  '229': { city: 'Albany', state: 'Georgia', timezone: 'Eastern' },
  '404': { city: 'Atlanta', state: 'Georgia', timezone: 'Eastern' },
  '470': { city: 'Atlanta', state: 'Georgia', timezone: 'Eastern' },
  '478': { city: 'Macon', state: 'Georgia', timezone: 'Eastern' },
  '678': { city: 'Atlanta', state: 'Georgia', timezone: 'Eastern' },
  '706': { city: 'Columbus', state: 'Georgia', timezone: 'Eastern' },
  '762': { city: 'Augusta', state: 'Georgia', timezone: 'Eastern' },
  '770': { city: 'Atlanta', state: 'Georgia', timezone: 'Eastern' },
  '912': { city: 'Savannah', state: 'Georgia', timezone: 'Eastern' },
  
  // Hawaii
  '808': { city: 'Honolulu', state: 'Hawaii', timezone: 'Hawaii' },
  
  // Idaho
  '208': { city: 'Boise', state: 'Idaho', timezone: 'Mountain' },
  '986': { city: 'Coeur d\'Alene', state: 'Idaho', timezone: 'Mountain' },
  
  // Illinois
  '217': { city: 'Springfield', state: 'Illinois', timezone: 'Central' },
  '224': { city: 'Evanston', state: 'Illinois', timezone: 'Central' },
  '309': { city: 'Peoria', state: 'Illinois', timezone: 'Central' },
  '312': { city: 'Chicago', state: 'Illinois', timezone: 'Central' },
  '331': { city: 'Aurora', state: 'Illinois', timezone: 'Central' },
  '618': { city: 'Carbondale', state: 'Illinois', timezone: 'Central' },
  '630': { city: 'Aurora', state: 'Illinois', timezone: 'Central' },
  '708': { city: 'Cicero', state: 'Illinois', timezone: 'Central' },
  '773': { city: 'Chicago', state: 'Illinois', timezone: 'Central' },
  '779': { city: 'Rockford', state: 'Illinois', timezone: 'Central' },
  '815': { city: 'Rockford', state: 'Illinois', timezone: 'Central' },
  '847': { city: 'Evanston', state: 'Illinois', timezone: 'Central' },
  '872': { city: 'Chicago', state: 'Illinois', timezone: 'Central' },
  
  // Indiana
  '219': { city: 'Gary', state: 'Indiana', timezone: 'Central' },
  '260': { city: 'Fort Wayne', state: 'Indiana', timezone: 'Eastern' },
  '317': { city: 'Indianapolis', state: 'Indiana', timezone: 'Eastern' },
  '463': { city: 'Indianapolis', state: 'Indiana', timezone: 'Eastern' },
  '574': { city: 'South Bend', state: 'Indiana', timezone: 'Eastern' },
  '765': { city: 'Muncie', state: 'Indiana', timezone: 'Eastern' },
  '812': { city: 'Evansville', state: 'Indiana', timezone: 'Eastern' },
  
  // Iowa
  '319': { city: 'Cedar Rapids', state: 'Iowa', timezone: 'Central' },
  '515': { city: 'Des Moines', state: 'Iowa', timezone: 'Central' },
  '563': { city: 'Davenport', state: 'Iowa', timezone: 'Central' },
  '641': { city: 'Mason City', state: 'Iowa', timezone: 'Central' },
  '712': { city: 'Sioux City', state: 'Iowa', timezone: 'Central' },
  
  // Kansas
  '316': { city: 'Wichita', state: 'Kansas', timezone: 'Central' },
  '620': { city: 'Hutchinson', state: 'Kansas', timezone: 'Central' },
  '785': { city: 'Topeka', state: 'Kansas', timezone: 'Central' },
  '913': { city: 'Overland Park', state: 'Kansas', timezone: 'Central' },
  
  // Kentucky
  '270': { city: 'Bowling Green', state: 'Kentucky', timezone: 'Central' },
  '364': { city: 'Owensboro', state: 'Kentucky', timezone: 'Central' },
  '502': { city: 'Louisville', state: 'Kentucky', timezone: 'Eastern' },
  '606': { city: 'Ashland', state: 'Kentucky', timezone: 'Eastern' },
  '859': { city: 'Lexington', state: 'Kentucky', timezone: 'Eastern' },
  
  // Louisiana
  '225': { city: 'Baton Rouge', state: 'Louisiana', timezone: 'Central' },
  '318': { city: 'Shreveport', state: 'Louisiana', timezone: 'Central' },
  '337': { city: 'Lafayette', state: 'Louisiana', timezone: 'Central' },
  '504': { city: 'New Orleans', state: 'Louisiana', timezone: 'Central' },
  '985': { city: 'Hammond', state: 'Louisiana', timezone: 'Central' },
  
  // Maine
  '207': { city: 'Portland', state: 'Maine', timezone: 'Eastern' },
  
  // Maryland
  '240': { city: 'Frederick', state: 'Maryland', timezone: 'Eastern' },
  '301': { city: 'Frederick', state: 'Maryland', timezone: 'Eastern' },
  '410': { city: 'Baltimore', state: 'Maryland', timezone: 'Eastern' },
  '443': { city: 'Baltimore', state: 'Maryland', timezone: 'Eastern' },
  '667': { city: 'Baltimore', state: 'Maryland', timezone: 'Eastern' },
  
  // Massachusetts
  '339': { city: 'Boston', state: 'Massachusetts', timezone: 'Eastern' },
  '351': { city: 'Lowell', state: 'Massachusetts', timezone: 'Eastern' },
  '413': { city: 'Springfield', state: 'Massachusetts', timezone: 'Eastern' },
  '508': { city: 'Worcester', state: 'Massachusetts', timezone: 'Eastern' },
  '617': { city: 'Boston', state: 'Massachusetts', timezone: 'Eastern' },
  '774': { city: 'Worcester', state: 'Massachusetts', timezone: 'Eastern' },
  '781': { city: 'Lynn', state: 'Massachusetts', timezone: 'Eastern' },
  '857': { city: 'Boston', state: 'Massachusetts', timezone: 'Eastern' },
  '978': { city: 'Lowell', state: 'Massachusetts', timezone: 'Eastern' },
  
  // Michigan
  '231': { city: 'Muskegon', state: 'Michigan', timezone: 'Eastern' },
  '248': { city: 'Troy', state: 'Michigan', timezone: 'Eastern' },
  '269': { city: 'Kalamazoo', state: 'Michigan', timezone: 'Eastern' },
  '313': { city: 'Detroit', state: 'Michigan', timezone: 'Eastern' },
  '517': { city: 'Lansing', state: 'Michigan', timezone: 'Eastern' },
  '586': { city: 'Warren', state: 'Michigan', timezone: 'Eastern' },
  '616': { city: 'Grand Rapids', state: 'Michigan', timezone: 'Eastern' },
  '734': { city: 'Ann Arbor', state: 'Michigan', timezone: 'Eastern' },
  '810': { city: 'Flint', state: 'Michigan', timezone: 'Eastern' },
  '906': { city: 'Marquette', state: 'Michigan', timezone: 'Eastern' },
  '947': { city: 'Troy', state: 'Michigan', timezone: 'Eastern' },
  '989': { city: 'Saginaw', state: 'Michigan', timezone: 'Eastern' },
  
  // Minnesota
  '218': { city: 'Duluth', state: 'Minnesota', timezone: 'Central' },
  '320': { city: 'St. Cloud', state: 'Minnesota', timezone: 'Central' },
  '507': { city: 'Rochester', state: 'Minnesota', timezone: 'Central' },
  '612': { city: 'Minneapolis', state: 'Minnesota', timezone: 'Central' },
  '651': { city: 'St. Paul', state: 'Minnesota', timezone: 'Central' },
  '763': { city: 'Brooklyn Park', state: 'Minnesota', timezone: 'Central' },
  '952': { city: 'Bloomington', state: 'Minnesota', timezone: 'Central' },
  
  // Mississippi
  '228': { city: 'Gulfport', state: 'Mississippi', timezone: 'Central' },
  '601': { city: 'Jackson', state: 'Mississippi', timezone: 'Central' },
  '662': { city: 'Tupelo', state: 'Mississippi', timezone: 'Central' },
  '769': { city: 'Jackson', state: 'Mississippi', timezone: 'Central' },
  
  // Missouri
  '314': { city: 'St. Louis', state: 'Missouri', timezone: 'Central' },
  '417': { city: 'Springfield', state: 'Missouri', timezone: 'Central' },
  '573': { city: 'Columbia', state: 'Missouri', timezone: 'Central' },
  '636': { city: 'O\'Fallon', state: 'Missouri', timezone: 'Central' },
  '660': { city: 'Sedalia', state: 'Missouri', timezone: 'Central' },
  '816': { city: 'Kansas City', state: 'Missouri', timezone: 'Central' },
  
  // Montana
  '406': { city: 'Billings', state: 'Montana', timezone: 'Mountain' },
  
  // Nebraska
  '308': { city: 'North Platte', state: 'Nebraska', timezone: 'Central' },
  '402': { city: 'Omaha', state: 'Nebraska', timezone: 'Central' },
  '531': { city: 'Omaha', state: 'Nebraska', timezone: 'Central' },
  
  // Nevada
  '702': { city: 'Las Vegas', state: 'Nevada', timezone: 'Pacific' },
  '725': { city: 'Las Vegas', state: 'Nevada', timezone: 'Pacific' },
  '775': { city: 'Reno', state: 'Nevada', timezone: 'Pacific' },
  
  // New Hampshire
  '603': { city: 'Manchester', state: 'New Hampshire', timezone: 'Eastern' },
  
  // New Jersey
  '201': { city: 'Jersey City', state: 'New Jersey', timezone: 'Eastern' },
  '551': { city: 'Jersey City', state: 'New Jersey', timezone: 'Eastern' },
  '609': { city: 'Trenton', state: 'New Jersey', timezone: 'Eastern' },
  '732': { city: 'New Brunswick', state: 'New Jersey', timezone: 'Eastern' },
  '848': { city: 'New Brunswick', state: 'New Jersey', timezone: 'Eastern' },
  '856': { city: 'Camden', state: 'New Jersey', timezone: 'Eastern' },
  '862': { city: 'Newark', state: 'New Jersey', timezone: 'Eastern' },
  '908': { city: 'Elizabeth', state: 'New Jersey', timezone: 'Eastern' },
  '973': { city: 'Newark', state: 'New Jersey', timezone: 'Eastern' },
  
  // New Mexico
  '505': { city: 'Albuquerque', state: 'New Mexico', timezone: 'Mountain' },
  '575': { city: 'Las Cruces', state: 'New Mexico', timezone: 'Mountain' },
  
  // New York
  '212': { city: 'New York', state: 'New York', timezone: 'Eastern' },
  '315': { city: 'Syracuse', state: 'New York', timezone: 'Eastern' },
  '332': { city: 'New York', state: 'New York', timezone: 'Eastern' },
  '347': { city: 'Brooklyn', state: 'New York', timezone: 'Eastern' },
  '516': { city: 'Hempstead', state: 'New York', timezone: 'Eastern' },
  '518': { city: 'Albany', state: 'New York', timezone: 'Eastern' },
  '585': { city: 'Rochester', state: 'New York', timezone: 'Eastern' },
  '607': { city: 'Binghamton', state: 'New York', timezone: 'Eastern' },
  '631': { city: 'Huntington', state: 'New York', timezone: 'Eastern' },
  '646': { city: 'New York', state: 'New York', timezone: 'Eastern' },
  '716': { city: 'Buffalo', state: 'New York', timezone: 'Eastern' },
  '718': { city: 'Brooklyn', state: 'New York', timezone: 'Eastern' },
  '845': { city: 'Poughkeepsie', state: 'New York', timezone: 'Eastern' },
  '914': { city: 'Yonkers', state: 'New York', timezone: 'Eastern' },
  '917': { city: 'New York', state: 'New York', timezone: 'Eastern' },
  '929': { city: 'Brooklyn', state: 'New York', timezone: 'Eastern' },
  
  // North Carolina
  '252': { city: 'Greenville', state: 'North Carolina', timezone: 'Eastern' },
  '336': { city: 'Greensboro', state: 'North Carolina', timezone: 'Eastern' },
  '704': { city: 'Charlotte', state: 'North Carolina', timezone: 'Eastern' },
  '743': { city: 'Greensboro', state: 'North Carolina', timezone: 'Eastern' },
  '828': { city: 'Asheville', state: 'North Carolina', timezone: 'Eastern' },
  '910': { city: 'Fayetteville', state: 'North Carolina', timezone: 'Eastern' },
  '919': { city: 'Raleigh', state: 'North Carolina', timezone: 'Eastern' },
  '980': { city: 'Charlotte', state: 'North Carolina', timezone: 'Eastern' },
  '984': { city: 'Raleigh', state: 'North Carolina', timezone: 'Eastern' },
  
  // North Dakota
  '701': { city: 'Fargo', state: 'North Dakota', timezone: 'Central' },
  
  // Ohio
  '216': { city: 'Cleveland', state: 'Ohio', timezone: 'Eastern' },
  '220': { city: 'Zanesville', state: 'Ohio', timezone: 'Eastern' },
  '234': { city: 'Akron', state: 'Ohio', timezone: 'Eastern' },
  '330': { city: 'Akron', state: 'Ohio', timezone: 'Eastern' },
  '380': { city: 'Columbus', state: 'Ohio', timezone: 'Eastern' },
  '419': { city: 'Toledo', state: 'Ohio', timezone: 'Eastern' },
  '440': { city: 'Cleveland', state: 'Ohio', timezone: 'Eastern' },
  '513': { city: 'Cincinnati', state: 'Ohio', timezone: 'Eastern' },
  '567': { city: 'Toledo', state: 'Ohio', timezone: 'Eastern' },
  '614': { city: 'Columbus', state: 'Ohio', timezone: 'Eastern' },
  '740': { city: 'Zanesville', state: 'Ohio', timezone: 'Eastern' },
  '937': { city: 'Dayton', state: 'Ohio', timezone: 'Eastern' },
  
  // Oklahoma
  '405': { city: 'Oklahoma City', state: 'Oklahoma', timezone: 'Central' },
  '539': { city: 'Tulsa', state: 'Oklahoma', timezone: 'Central' },
  '580': { city: 'Lawton', state: 'Oklahoma', timezone: 'Central' },
  '918': { city: 'Tulsa', state: 'Oklahoma', timezone: 'Central' },
  
  // Oregon
  '458': { city: 'Eugene', state: 'Oregon', timezone: 'Pacific' },
  '503': { city: 'Portland', state: 'Oregon', timezone: 'Pacific' },
  '541': { city: 'Eugene', state: 'Oregon', timezone: 'Pacific' },
  '971': { city: 'Portland', state: 'Oregon', timezone: 'Pacific' },
  
  // Pennsylvania
  '215': { city: 'Philadelphia', state: 'Pennsylvania', timezone: 'Eastern' },
  '267': { city: 'Philadelphia', state: 'Pennsylvania', timezone: 'Eastern' },
  '272': { city: 'Scranton', state: 'Pennsylvania', timezone: 'Eastern' },
  '412': { city: 'Pittsburgh', state: 'Pennsylvania', timezone: 'Eastern' },
  '445': { city: 'Philadelphia', state: 'Pennsylvania', timezone: 'Eastern' },
  '484': { city: 'Allentown', state: 'Pennsylvania', timezone: 'Eastern' },
  '570': { city: 'Scranton', state: 'Pennsylvania', timezone: 'Eastern' },
  '610': { city: 'Allentown', state: 'Pennsylvania', timezone: 'Eastern' },
  '717': { city: 'Harrisburg', state: 'Pennsylvania', timezone: 'Eastern' },
  '724': { city: 'Washington', state: 'Pennsylvania', timezone: 'Eastern' },
  '814': { city: 'Erie', state: 'Pennsylvania', timezone: 'Eastern' },
  '878': { city: 'Pittsburgh', state: 'Pennsylvania', timezone: 'Eastern' },
  
  // Rhode Island
  '401': { city: 'Providence', state: 'Rhode Island', timezone: 'Eastern' },
  
  // South Carolina
  '803': { city: 'Columbia', state: 'South Carolina', timezone: 'Eastern' },
  '843': { city: 'Charleston', state: 'South Carolina', timezone: 'Eastern' },
  '854': { city: 'Charleston', state: 'South Carolina', timezone: 'Eastern' },
  '864': { city: 'Greenville', state: 'South Carolina', timezone: 'Eastern' },
  
  // South Dakota
  '605': { city: 'Sioux Falls', state: 'South Dakota', timezone: 'Central' },
  
  // Tennessee
  '423': { city: 'Chattanooga', state: 'Tennessee', timezone: 'Eastern' },
  '615': { city: 'Nashville', state: 'Tennessee', timezone: 'Central' },
  '629': { city: 'Nashville', state: 'Tennessee', timezone: 'Central' },
  '731': { city: 'Jackson', state: 'Tennessee', timezone: 'Central' },
  '865': { city: 'Knoxville', state: 'Tennessee', timezone: 'Eastern' },
  '901': { city: 'Memphis', state: 'Tennessee', timezone: 'Central' },
  '931': { city: 'Clarksville', state: 'Tennessee', timezone: 'Central' },
  
  // Texas
  '210': { city: 'San Antonio', state: 'Texas', timezone: 'Central' },
  '214': { city: 'Dallas', state: 'Texas', timezone: 'Central' },
  '254': { city: 'Killeen', state: 'Texas', timezone: 'Central' },
  '281': { city: 'Houston', state: 'Texas', timezone: 'Central' },
  '325': { city: 'Abilene', state: 'Texas', timezone: 'Central' },
  '346': { city: 'Houston', state: 'Texas', timezone: 'Central' },
  '361': { city: 'Corpus Christi', state: 'Texas', timezone: 'Central' },
  '409': { city: 'Beaumont', state: 'Texas', timezone: 'Central' },
  '430': { city: 'Tyler', state: 'Texas', timezone: 'Central' },
  '432': { city: 'Midland', state: 'Texas', timezone: 'Central' },
  '469': { city: 'Dallas', state: 'Texas', timezone: 'Central' },
  '512': { city: 'Austin', state: 'Texas', timezone: 'Central' },
  '713': { city: 'Houston', state: 'Texas', timezone: 'Central' },
  '726': { city: 'San Antonio', state: 'Texas', timezone: 'Central' },
  '737': { city: 'Austin', state: 'Texas', timezone: 'Central' },
  '806': { city: 'Lubbock', state: 'Texas', timezone: 'Central' },
  '817': { city: 'Fort Worth', state: 'Texas', timezone: 'Central' },
  '830': { city: 'New Braunfels', state: 'Texas', timezone: 'Central' },
  '832': { city: 'Houston', state: 'Texas', timezone: 'Central' },
  '903': { city: 'Tyler', state: 'Texas', timezone: 'Central' },
  '915': { city: 'El Paso', state: 'Texas', timezone: 'Mountain' },
  '936': { city: 'Huntsville', state: 'Texas', timezone: 'Central' },
  '940': { city: 'Wichita Falls', state: 'Texas', timezone: 'Central' },
  '956': { city: 'Laredo', state: 'Texas', timezone: 'Central' },
  '972': { city: 'Dallas', state: 'Texas', timezone: 'Central' },
  '979': { city: 'Bryan', state: 'Texas', timezone: 'Central' },
  
  // Utah
  '385': { city: 'Salt Lake City', state: 'Utah', timezone: 'Mountain' },
  '435': { city: 'St. George', state: 'Utah', timezone: 'Mountain' },
  '801': { city: 'Salt Lake City', state: 'Utah', timezone: 'Mountain' },
  
  // Vermont
  '802': { city: 'Burlington', state: 'Vermont', timezone: 'Eastern' },
  
  // Virginia
  '276': { city: 'Bristol', state: 'Virginia', timezone: 'Eastern' },
  '434': { city: 'Lynchburg', state: 'Virginia', timezone: 'Eastern' },
  '540': { city: 'Roanoke', state: 'Virginia', timezone: 'Eastern' },
  '571': { city: 'Arlington', state: 'Virginia', timezone: 'Eastern' },
  '703': { city: 'Arlington', state: 'Virginia', timezone: 'Eastern' },
  '757': { city: 'Norfolk', state: 'Virginia', timezone: 'Eastern' },
  '804': { city: 'Richmond', state: 'Virginia', timezone: 'Eastern' },
  
  // Washington
  '206': { city: 'Seattle', state: 'Washington', timezone: 'Pacific' },
  '253': { city: 'Tacoma', state: 'Washington', timezone: 'Pacific' },
  '360': { city: 'Olympia', state: 'Washington', timezone: 'Pacific' },
  '425': { city: 'Bellevue', state: 'Washington', timezone: 'Pacific' },
  '509': { city: 'Spokane', state: 'Washington', timezone: 'Pacific' },
  '564': { city: 'Vancouver', state: 'Washington', timezone: 'Pacific' },
  
  // West Virginia
  '304': { city: 'Charleston', state: 'West Virginia', timezone: 'Eastern' },
  '681': { city: 'Charleston', state: 'West Virginia', timezone: 'Eastern' },
  
  // Wisconsin
  '262': { city: 'Kenosha', state: 'Wisconsin', timezone: 'Central' },
  '414': { city: 'Milwaukee', state: 'Wisconsin', timezone: 'Central' },
  '534': { city: 'Eau Claire', state: 'Wisconsin', timezone: 'Central' },
  '608': { city: 'Madison', state: 'Wisconsin', timezone: 'Central' },
  '715': { city: 'Eau Claire', state: 'Wisconsin', timezone: 'Central' },
  '920': { city: 'Green Bay', state: 'Wisconsin', timezone: 'Central' },
  
  // Wyoming
  '307': { city: 'Cheyenne', state: 'Wyoming', timezone: 'Mountain' },
  
  // District of Columbia
  '202': { city: 'Washington', state: 'District of Columbia', timezone: 'Eastern' },
};

/**
 * Extract area code from phone number
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string|null} - Area code (3 digits) or null
 */
export function extractAreaCode(phoneNumber) {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // If it starts with 1 (US country code), skip it
  if (digits.length === 11 && digits[0] === '1') {
    return digits.substring(1, 4);
  }
  
  // If it's 10 digits, first 3 are area code
  if (digits.length === 10) {
    return digits.substring(0, 3);
  }
  
  // If it's 11 digits and doesn't start with 1, or other lengths, try first 3
  if (digits.length >= 3) {
    return digits.substring(0, 3);
  }
  
  return null;
}

/**
 * Get location information from area code
 * @param {string} phoneNumber - Phone number
 * @returns {Object|null} - Location info with city, state, timezone or null
 */
export function getLocationFromAreaCode(phoneNumber) {
  const areaCode = extractAreaCode(phoneNumber);
  if (!areaCode) return null;
  
  return areaCodeMapping[areaCode] || null;
}

export default areaCodeMapping;
