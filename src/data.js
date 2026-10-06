/* ===================== DATA ===================== */
const ITEMS = {
  canned:{n:'Canned Food',c:'food',w:0.5,v:6,eat:{hunger:30}},
  rawmeat:{n:'Raw Meat',c:'food',w:0.5,v:4,eat:{hunger:20,sick:0.35}},
  veg:{n:'Vegetables',c:'food',w:0.3,v:4,eat:{hunger:16,thirst:6}},
  meal:{n:'Cooked Meal',c:'food',w:0.4,v:10,eat:{hunger:45,morale:4}},
  snack:{n:'Snack Bar',c:'food',w:0.1,v:4,eat:{hunger:12,sta:10}},
  dirtywater:{n:'Dirty Water',c:'water',w:1,v:2,eat:{thirst:30,sick:0.3}},
  water:{n:'Clean Water',c:'water',w:1,v:5,eat:{thirst:40}},
  wood:{n:'Wood',c:'mat',w:1.2,v:2},
  scrap:{n:'Scrap Metal',c:'mat',w:1.5,v:3},
  cloth:{n:'Cloth',c:'mat',w:0.3,v:2},
  parts:{n:'Components',c:'mat',w:0.5,v:6},
  fuel:{n:'Fuel',c:'mat',w:2,v:8},
  chem:{n:'Chemicals',c:'mat',w:0.5,v:5},
  bandage:{n:'Bandage',c:'med',w:0.1,v:5,use:{hp:15,cure:['bleeding']}},
  medkit:{n:'Medkit',c:'med',w:0.6,v:18,use:{hp:45,cure:['bleeding','injured']}},
  antibiotics:{n:'Antibiotics',c:'med',w:0.1,v:22,use:{cure:['sick'],infect:-45}},
  painkillers:{n:'Painkillers',c:'med',w:0.1,v:8,use:{hp:6,sta:25,cure:['injured']}},
  serum:{n:'Experimental Serum',c:'med',w:0.1,v:90,use:{infect:-999,hp:20}},
  knife:{n:'Knife',c:'weapon',w:0.5,v:5,dmg:[3,6],noise:0},
  pipe:{n:'Lead Pipe',c:'weapon',w:2,v:6,dmg:[4,8],noise:0},
  bat:{n:'Nail Bat',c:'weapon',w:1.5,v:7,dmg:[5,9],noise:0},
  machete:{n:'Machete',c:'weapon',w:1.2,v:14,dmg:[7,12],noise:0},
  axe:{n:'Fire Axe',c:'weapon',w:2.5,v:16,dmg:[8,14],noise:0},
  crossbow:{n:'Crossbow',c:'weapon',w:3,v:30,dmg:[11,17],ammo:'bolts',noise:0},
  pistol:{n:'Pistol',c:'weapon',w:1,v:35,dmg:[12,18],ammo:'ammo',noise:3},
  shotgun:{n:'Shotgun',c:'weapon',w:3.5,v:50,dmg:[18,28],ammo:'shells',noise:5,aoe:true},
  bolts:{n:'Bolts',c:'ammo',w:0.05,v:2},
  ammo:{n:'Pistol Rounds',c:'ammo',w:0.03,v:3},
  shells:{n:'Shotgun Shells',c:'ammo',w:0.05,v:4},
  backpack:{n:'Hiking Backpack',c:'gear',w:0,v:25,desc:'+15 carry capacity'},
  boots:{n:'Work Boots',c:'gear',w:0,v:15,desc:'-30% travel stamina'},
  vest:{n:'Kevlar Vest',c:'gear',w:3,v:40,desc:'-3 damage taken, halves bite chance'},
  coat:{n:'Winter Coat',c:'gear',w:1.5,v:22,desc:'Keeps the cold out: no stamina loss in snow'},
  cigs:{n:'Cigarettes',c:'misc',w:0.05,v:3},
  bottle:{n:'Glass Bottle',c:'misc',w:0.4,v:1,desc:'Throw it (G) and the dead go to the noise.'},
  batteries:{n:'Batteries',c:'misc',w:0.2,v:4},
  hose:{n:'Siphon Hose',c:'gear',w:0.3,v:6,desc:'Siphon fuel from any wreck you find (hold E at a car).'},
  radio_coil:{n:'Radio Coil',c:'story',w:0.3,v:0},
  radio_antenna:{n:'Radio Antenna',c:'story',w:1,v:0},
  radio_cell:{n:'Power Cell',c:'story',w:1,v:0},
  engine_parts:{n:'Engine Parts',c:'story',w:4,v:0},
  haven_map:{n:'Haven Route Map',c:'story',w:0.1,v:0},
};
const CAT_LABEL = {food:'Food',water:'Water',mat:'Materials',med:'Medical',weapon:'Weapons',ammo:'Ammo',gear:'Gear',misc:'Trade goods',story:'Key items'};

const ENEMIES = {
  walker:{n:'Walker',hp:18,dmg:[3,7],acc:0.55,flee:0.85,xp:6,z:true,desc:'Slow. Relentless.'},
  runner:{n:'Runner',hp:14,dmg:[4,8],acc:0.7,flee:0.35,xp:9,z:true,desc:'Fast. You will not outrun it.'},
  bloater:{n:'Bloater',hp:24,dmg:[2,5],acc:0.45,flee:0.85,xp:10,z:true,gas:true,desc:'Swollen with gas. Do not pop it up close.'},
  screamer:{n:'Screamer',hp:12,dmg:[2,4],acc:0.5,flee:0.6,xp:9,z:true,scream:true,desc:'Its shriek calls the others.'},
  brute:{n:'Brute',hp:52,dmg:[9,16],acc:0.55,flee:0.75,xp:22,z:true,desc:'A wall of dead muscle.'},
  zdog:{n:'Infected Dog',hp:10,dmg:[3,6],acc:0.75,flee:0.3,xp:5,z:true,desc:'Quick and hungry.'},
  raider:{n:'Raider',hp:24,dmg:[5,10],acc:0.6,flee:0.6,xp:12,loot:[['ammo',3],['canned',1],['cigs',3],['bandage',1]]},
  tollman:{n:'Tollman',hp:30,dmg:[6,11],acc:0.62,flee:0.55,xp:15,loot:[['ammo',4],['cigs',5],['scrap',2]]},
  warden:{n:'The Warden',hp:85,dmg:[10,18],acc:0.65,flee:0.4,xp:60,loot:[['shotgun',1],['shells',6]]},
  /* act bosses: one named dead per act, in its lair (rules: BOSS_LAIR in engine.js). guar = guaranteed drops */
  orderly:{n:'The Orderly',hp:120,dmg:[10,17],acc:0.6,flee:0.6,xp:60,z:true,boss:1,intro:'Still doing its rounds.',guar:[['medkit',1],['antibiotics',2]],desc:'A brute in hospital whites.'},
  butcher:{n:'The Butcher',hp:95,dmg:[5,10],acc:0.5,flee:0.7,xp:60,z:true,gas:true,boss:2,intro:'The cold store kept it fresh.',guar:[['shells',8],['painkillers',2]],desc:'Swollen, in a butcher apron. Do not pop it up close.'},
  sergeant:{n:'The Sergeant',hp:170,dmg:[12,20],acc:0.62,flee:0.6,xp:90,z:true,boss:3,intro:'The convoy never left. Neither did he.',guar:[['fuel',2],['ammo',12],['coat',1]],desc:'Snow-crusted, still in uniform.'},
};

/* loot: [id, weight, min, max]; story: item obtainable here when quest allows */
const LOCS = {
  shelter:{n:'Metro Bunker',icon:'🚇',danger:0,desc:'A maintenance bunker under the old Line 3. Thick concrete, one steel door. Home.'},
  street:{n:'Ruined Street',icon:'🏚️',danger:1,searches:3,loot:[['bottle',4,1,2],['hose',1,1,1],['wood',5,1,2],['scrap',5,1,2],['cloth',4,1,2],['canned',2,1,1],['dirtywater',2,1,1],['cigs',2,1,3],['pipe',1,1,1]],desc:'Burned-out cars and broken windows. Picked over, but not clean.'},
  supermarket:{n:'FreshMart',icon:'🛒',danger:2,searches:5,loot:[['bottle',4,1,2],['canned',6,1,2],['snack',5,1,3],['water',4,1,2],['veg',2,1,2],['cloth',2,1,2],['cigs',2,2,4],['batteries',1,1,2]],rare:['backpack','medkit'],desc:'Shelves toppled, freezers rotten. Something still shuffles in the stockroom.'},
  hospital:{n:"St. Agnes Hospital",icon:'🏥',danger:3,searches:5,loot:[['bandage',6,1,2],['painkillers',4,1,2],['medkit',2,1,1],['antibiotics',2,1,1],['chem',3,1,2],['cloth',3,1,2]],rare:['serum','antibiotics'],desc:'Ground zero for the Fever in this district. The quarantine tape still flutters.'},
  police:{n:'Precinct 9',icon:'🚓',danger:3,searches:4,loot:[['ammo',6,2,6],['batteries',3,1,2],['bandage',2,1,1],['canned',2,1,1],['knife',1,1,1]],rare:['pistol','vest'],story:['radio_cell'],desc:'The last stand of the city police. Barricades from the inside.'},
  gas:{n:'Gas Station',icon:'⛽',danger:2,searches:4,loot:[['bottle',4,1,2],['fuel',5,1,2],['hose',1,1,1],['snack',4,1,2],['water',3,1,1],['parts',2,1,1],['cigs',3,2,4],['chem',2,1,1]],rare:['boots'],desc:'Pumps dry, but the underground tank might still hold something.'},
  factory:{n:'Rail Works',icon:'🏭',danger:2,searches:5,loot:[['bottle',4,1,2],['scrap',7,1,3],['parts',4,1,2],['chem',3,1,1],['wood',3,1,2],['fuel',1,1,1]],rare:['axe','boots'],desc:'Rusting cranes and stacked sheet metal. Echoes carry far here.'},
  farm:{n:'Allotment Farm',icon:'🌾',danger:1,searches:4,loot:[['veg',6,1,3],['rawmeat',2,1,1],['wood',3,1,2],['dirtywater',3,1,2],['cloth',1,1,1]],desc:'Overgrown community plots. Some vegetables survived without anyone.'},
  river:{n:'Vale River',icon:'🌊',danger:1,searches:6,loot:[['dirtywater',8,2,3],['rawmeat',3,1,1],['wood',2,1,1]],desc:'Brown water and drifting debris. Bodies float past sometimes.'},
  forest:{n:'Kessler Woods',icon:'🌲',danger:1,searches:6,loot:[['wood',8,2,3],['rawmeat',3,1,1],['veg',1,1,1],['dirtywater',2,1,1]],desc:'Quiet pines on the edge of the city. Too quiet, some say.'},
  apartments:{n:'Tower Blocks',icon:'🏢',danger:2,searches:5,loot:[['bottle',4,1,2],['canned',4,1,2],['cloth',5,1,3],['bandage',2,1,1],['cigs',3,1,3],['batteries',2,1,1],['painkillers',1,1,1],['knife',1,1,1]],rare:['backpack','bat'],story:['radio_coil'],desc:'Twelve floors of locked doors. Not all of them are empty.'},
  electronics:{n:'Volt & Co.',icon:'📻',danger:2,searches:4,loot:[['parts',6,1,2],['batteries',5,1,3],['scrap',2,1,1],['cigs',1,1,2]],rare:['crossbow'],story:['radio_coil','radio_cell'],desc:'An electronics store. Looters took the TVs and left the useful stuff.'},
  radiotower:{n:'KVAL Radio Tower',icon:'📡',danger:3,searches:3,loot:[['parts',5,1,2],['scrap',4,1,2],['batteries',3,1,2],['cloth',1,1,1]],story:['radio_antenna'],desc:'The old broadcast mast on Signal Hill. Its red light died months ago.'},
  military:{n:'Checkpoint Echo',icon:'🪖',danger:4,searches:4,loot:[['ammo',5,3,8],['shells',3,2,4],['medkit',2,1,1],['canned',4,1,3],['water',3,1,2],['bolts',2,3,6]],rare:['shotgun','vest','coat'],story:['haven_map'],desc:'An abandoned army checkpoint. Overrun, then forgotten.'},
  depot:{n:'Bus Depot',icon:'🚌',danger:3,searches:4,loot:[['scrap',5,1,3],['hose',1,1,1],['parts',4,1,2],['fuel',4,1,2],['wood',1,1,1]],story:['engine_parts'],desc:'Rows of city buses. One yellow school bus looks almost whole.'},
  tollcamp:{n:'Tollmen Camp',icon:'⛓️',danger:0,desc:'A fortified gas depot flying a black flag. The Warden holds court here.'},
  /* biome districts (WORLD.biome) and their buildings. alias = an older type whose encounters also fit here */
  park:{n:'City Park',icon:'🌳',danger:1,searches:3,alias:'street',loot:[['wood',6,1,2],['dirtywater',3,1,1],['bottle',3,1,1],['veg',1,1,1],['cloth',1,1,1]],desc:'Overgrown lawns and a scummy pond. The trees are taking it back.'},
  docks:{n:'Vale Docks',icon:'⚓',danger:2,searches:4,alias:'factory',loot:[['scrap',6,1,3],['parts',3,1,2],['fuel',3,1,2],['chem',2,1,1],['cloth',2,1,2],['canned',2,1,2],['rawmeat',2,1,1],['bottle',3,1,2],['cigs',2,1,3]],rare:['crossbow','vest'],desc:'Cranes over black water. Shipping containers stacked like tombstones.'},
  warehouse:{n:'Dock Warehouse',icon:'📦',danger:3,searches:5,alias:'factory',loot:[['canned',5,1,3],['water',3,1,2],['cloth',3,1,2],['scrap',3,1,2],['chem',2,1,1],['batteries',2,1,2],['bottle',2,1,2]],rare:['backpack','coat'],desc:'Knee-deep water between the racks. Something bloated drifts in the dark.'},
  suburbs:{n:'Elm Row',icon:'🏡',danger:1,searches:3,alias:'street',loot:[['canned',3,1,2],['cloth',4,1,2],['bottle',3,1,2],['snack',2,1,2],['wood',3,1,2],['batteries',1,1,1],['cigs',2,1,2]],desc:'Quiet streets of identical houses. The dogs run in packs here now.'},
  house:{n:'House',icon:'🏠',danger:1,searches:3,alias:'apartments',loot:[['canned',4,1,2],['water',3,1,1],['snack',3,1,2],['cloth',4,1,2],['bandage',2,1,1],['painkillers',1,1,1],['batteries',2,1,1],['cigs',2,1,2],['bottle',3,1,2],['knife',1,1,1]],rare:['coat','backpack','bat'],desc:'Family photos still on the walls. The dog bowl is empty.'},
  garage:{n:'Garage',icon:'🔧',danger:1,searches:2,alias:'street',loot:[['fuel',4,1,2],['hose',2,1,1],['scrap',5,1,2],['parts',3,1,1],['wood',2,1,2],['chem',2,1,1]],rare:['axe','boots'],desc:'Oil stains, a workbench, a car that never left.'},
  ranger:{n:'Ranger Station',icon:'🛖',danger:2,searches:4,alias:'forest',loot:[['canned',3,1,2],['water',3,1,2],['bandage',3,1,2],['bolts',3,2,5],['wood',3,1,2],['batteries',2,1,2],['rawmeat',2,1,1]],rare:['crossbow','coat','boots'],desc:'A log cabin above the tree line. Someone kept the stove warm here.'},
  flooded:{n:'Flooded Quarter',icon:'🌫️',danger:2,searches:4,alias:'river',loot:[['dirtywater',5,1,2],['cloth',4,1,2],['canned',3,1,2],['bottle',3,1,2],['chem',2,1,1],['bandage',2,1,1],['scrap',2,1,2]],rare:['medkit','coat'],desc:'The river took these streets. Houses stand to their windows in brown water.'},
  pass:{n:'Northern Pass',icon:'🏔️',danger:3,searches:3,alias:'military',loot:[['canned',4,1,2],['water',3,1,2],['ammo',3,2,5],['fuel',2,1,2],['cloth',2,1,2],['bandage',2,1,1]],rare:['coat','vest'],desc:'The road to Haven climbs into the snow. Wrecked convoys mark the way.'},
};

/* Buildings: cost per level (index = level-1) */
const BUILDINGS = {
  bed:{n:'Bunks',max:3,cost:[{wood:5,cloth:3},{wood:8,cloth:6,scrap:2},{wood:12,cloth:8,scrap:5}],desc:'Better sleep. Each level houses 2 more survivors.'},
  rain:{n:'Rain Collector',max:3,cost:[{wood:3,scrap:2,cloth:2},{scrap:5,cloth:3},{scrap:8,parts:2}],desc:'Collects 3 dirty water per level each day.'},
  garden:{n:'Garden',max:3,cost:[{wood:6,dirtywater:2},{wood:8,scrap:3},{wood:10,scrap:5,parts:2}],workers:true,skill:'farm',desc:'Workers grow vegetables.'},
  bench:{n:'Workbench',max:3,cost:[{wood:5,scrap:3},{wood:6,scrap:6,parts:2},{scrap:10,parts:5}],desc:'Unlocks crafting recipes. Higher levels, better gear.'},
  purifier:{n:'Water Purifier',max:2,req:{bench:1},cost:[{scrap:6,parts:2,chem:1},{scrap:8,parts:4,chem:2}],workers:true,skill:'build',desc:'Workers turn dirty water into clean water.'},
  kitchen:{n:'Kitchen',max:2,cost:[{scrap:4,wood:4},{scrap:6,parts:2}],workers:true,skill:'farm',desc:'Workers cook raw meat and vegetables into meals.'},
  woodshop:{n:'Wood Yard',max:2,cost:[{wood:4,scrap:3},{wood:6,scrap:6}],workers:true,skill:'build',desc:'Workers bring in wood from the parks.'},
  forge:{n:'Scrap Forge',max:2,req:{bench:1},cost:[{wood:6,scrap:6},{scrap:10,parts:3}],workers:true,skill:'build',desc:'Workers strip cars for scrap and components.'},
  infirmary:{n:'Infirmary',max:2,req:{bench:1},cost:[{wood:4,cloth:6,bandage:2},{scrap:6,cloth:6,chem:3}],workers:true,skill:'med',desc:'Heals survivors, treats sickness. Medics can slow infection.'},
  walls:{n:'Barricades',lvNames:['Barricades','Fence','Concrete Wall'],max:3,cost:[{wood:8,scrap:4},{wood:10,scrap:10},{scrap:16,parts:4,wood:6}],desc:'Defense against hordes and raids (+12 per level).'},
  tower:{n:'Watchtower',max:1,req:{walls:1},cost:[{wood:8,scrap:4}],workers:true,skill:'combat',desc:'+6 defense. Guards posted here count double. Warns of hordes.'},
  radio:{n:'Shortwave Radio',max:1,hidden:true,cost:[{radio_coil:1,radio_antenna:1,radio_cell:1,scrap:2}],desc:'Repair the dead radio with the three parts.'},
};
const WORKER_SLOTS = lv => lv; // slots = level

/* Crafting */
const RECIPES = [
  {out:'bandage',q:1,in:{cloth:2},bench:0,int:1},
  {out:'water',q:1,in:{dirtywater:1,wood:1},bench:0,int:1,label:'Boil Water'},
  {out:'meal',q:1,in:{rawmeat:1,wood:1},bench:0,int:1,label:'Cook Meat'},
  {out:'meal',q:1,in:{veg:2,wood:1},bench:0,int:1,label:'Cook Stew'},
  {out:'bat',q:1,in:{wood:3,scrap:1},bench:0,int:1},
  {out:'bolts',q:6,in:{wood:1,scrap:1},bench:1,int:2},
  {out:'machete',q:1,in:{scrap:4,cloth:1},bench:1,int:3},
  {out:'axe',q:1,in:{scrap:3,wood:3},bench:1,int:4},
  {out:'backpack',q:1,in:{cloth:6,scrap:1},bench:1,int:3},
  {out:'boots',q:1,in:{cloth:3,scrap:2},bench:1,int:3},
  {out:'medkit',q:1,in:{bandage:2,chem:1,painkillers:1},bench:1,int:5},
  {out:'crossbow',q:1,in:{wood:4,scrap:3,parts:2},bench:2,int:5},
  {out:'shells',q:3,in:{scrap:1,chem:2},bench:2,int:5},
  {out:'ammo',q:6,in:{scrap:1,chem:1,parts:1},bench:2,int:6},
  {out:'vest',q:1,in:{scrap:6,cloth:4},bench:2,int:4},
  {out:'coat',q:1,in:{cloth:6,scrap:1},bench:1,int:2,label:'Sew a Winter Coat'},
  {out:'antibiotics',q:1,in:{chem:3,parts:1},bench:3,int:8},
  {out:'engine_parts',q:1,in:{parts:8,scrap:10},bench:3,int:6,label:'Rebuild Engine Parts'},
];

const BACKGROUNDS = {
  mechanic:{n:'Mechanic',bonus:{int:2,str:1},items:{scrap:4,parts:2,pipe:1},desc:'Good with tools. Cheaper building and better crafting.'},
  medic:{n:'Paramedic',bonus:{int:2,cha:1},items:{bandage:3,antibiotics:1,knife:1},desc:'Medicine heals more. Starts with supplies.'},
  athlete:{n:'Athlete',bonus:{end:2,agi:1},items:{snack:3,water:2,bat:1},desc:'Huge stamina and fast on foot.'},
  scavenger:{n:'Scavenger',bonus:{per:2,agi:1},items:{cloth:3,canned:2,knife:1},desc:'Finds more in every ruin.'},
  negotiator:{n:'Negotiator',bonus:{cha:3},items:{cigs:15,canned:1,knife:1},desc:'Talks people into almost anything.'},
  soldier:{n:'Ex-Soldier',bonus:{str:2,end:1},items:{pistol:1,ammo:8,bandage:1},desc:'Strong, armed, and steady under fire.'},
};
const ATTRS = {
  str:{n:'Strength',d:'Carry capacity and melee damage'},
  end:{n:'Endurance',d:'Max stamina, slower hunger and thirst'},
  per:{n:'Perception',d:'More loot per search, rare finds, spotting danger'},
  cha:{n:'Charisma',d:'Recruiting, trade prices, survivor morale'},
  agi:{n:'Agility',d:'Dodge, fleeing, travel speed'},
  int:{n:'Intellect',d:'Crafting, cheaper buildings, medicine'},
};
const TRAITS = {
  hardworker:{n:'Hard-worker',d:'+30% production'},
  lazy:{n:'Lazy',d:'-30% production'},
  glutton:{n:'Glutton',d:'Eats double'},
  brave:{n:'Brave',d:'+2 combat when guarding or scavenging'},
  cheerful:{n:'Cheerful',d:'Lifts everyone\'s morale'},
  sickly:{n:'Sickly',d:'Gets sick more often'},
  scavenger:{n:'Scrounger',d:'Better scavenging runs'},
  medic:{n:'Nurse',d:'+2 medicine'},
  grumpy:{n:'Grumpy',d:'Lowers morale, but works hard'},
  quiet:{n:'Quiet',d:'No effect. Keeps to themselves'},
  grateful:{n:'Grateful',d:'Morale recovers fast'},
  loyal:{n:'Loyal',d:'Will never abandon the shelter'},
  scared:{n:'Scared',d:'Poor guard, careful scavenger'},
  steady:{n:'Steady',d:'Never panics, even on horde nights'},
};
const JOBS_BASE = {idle:'Idle',guard:'Guard',scavenge:'Scavenge runs'};

/* ===================== 3D GAMEPLAY PARAMS ===================== */
/* Units: distances in tiles (1 tile = 2 m in the 3D world), times in real seconds. */
/* Melee: reach, wind (wind-up before the hit lands), cd (recovery), sta (stamina per swing), arc (radians).
   Guns: rng (max range), spread (radians), pellets, cd. Unarmed uses WEAPON_FISTS. */
const WEAPON_FISTS = { n: 'Fists', dmg: [2, 4], reach: 1.0, wind: 0.15, cd: 0.45, sta: 3, arc: 1.4 };
Object.assign(ITEMS.knife, { reach: 1.0, wind: 0.12, cd: 0.35, sta: 4, arc: 1.2 });
Object.assign(ITEMS.pipe, { reach: 1.35, wind: 0.28, cd: 0.6, sta: 8, arc: 1.6 });
Object.assign(ITEMS.bat, { reach: 1.4, wind: 0.3, cd: 0.65, sta: 9, arc: 1.7 });
Object.assign(ITEMS.machete, { reach: 1.3, wind: 0.2, cd: 0.5, sta: 7, arc: 1.5 });
Object.assign(ITEMS.axe, { reach: 1.5, wind: 0.4, cd: 0.8, sta: 12, arc: 1.8 });
Object.assign(ITEMS.crossbow, { rng: 9, wind: 0.2, cd: 1.2, sta: 2, spread: 0.03 });
Object.assign(ITEMS.pistol, { rng: 10, wind: 0.05, cd: 0.35, sta: 1, spread: 0.06 });
Object.assign(ITEMS.shotgun, { rng: 6, wind: 0.1, cd: 0.9, sta: 2, spread: 0.22, pellets: 5 });

/* Enemies: spd (tiles/s when chasing), sense (detection radius in tiles, halved when player crouches),
   reach (attack range), lunge (dash speed multiplier for the lunge), grab (chance a hit becomes a grab),
   rng/cd for ranged humans. hue/scale/shape drive the procedural model. */
Object.assign(ENEMIES.walker, { spd: 1.1, sense: 6, reach: 0.9, lunge: 2.0, grab: 0.25, shape: 'walker', scale: 1.0 });
Object.assign(ENEMIES.runner, { spd: 3.3, sense: 8, reach: 0.9, lunge: 2.4, grab: 0.15, shape: 'runner', scale: 0.95 });
Object.assign(ENEMIES.bloater, { spd: 0.8, sense: 5, reach: 1.0, lunge: 1.5, grab: 0.1, shape: 'bloater', scale: 1.25 });
Object.assign(ENEMIES.screamer, { spd: 1.4, sense: 9, reach: 0.9, lunge: 1.8, grab: 0.1, shape: 'screamer', scale: 0.9 });
Object.assign(ENEMIES.brute, { spd: 1.3, sense: 6, reach: 1.3, lunge: 2.2, grab: 0.0, shape: 'brute', scale: 1.5, knock: true });
Object.assign(ENEMIES.zdog, { spd: 3.8, sense: 9, reach: 0.8, lunge: 2.6, grab: 0.0, shape: 'dog', scale: 0.7 });
Object.assign(ENEMIES.raider, { spd: 2.4, sense: 9, reach: 1.0, lunge: 1.6, grab: 0, shape: 'human', scale: 1.0, rng: 8, cd: 1.5, drop: ['pipe', 'pistol'] });
Object.assign(ENEMIES.tollman, { spd: 2.4, sense: 9, reach: 1.0, lunge: 1.6, grab: 0, shape: 'human', scale: 1.05, rng: 8, cd: 1.3, drop: ['machete', 'pistol'] });
/* bosses: their kind's shape and gait, bigger, with a look of their own (KINDS overrides in actors.js) */
Object.assign(ENEMIES.orderly, { spd: 1.35, sense: 7, reach: 1.4, lunge: 2.2, grab: 0.0, shape: 'brute', scale: 1.8, knock: true, look: { shirt: 0xb8c4bc, sleeve: 0x485640, pants: 0x9aaaa4, shin: 0x6a7a74 } });
Object.assign(ENEMIES.butcher, { spd: 0.9, sense: 6, reach: 1.1, lunge: 1.6, grab: 0.15, shape: 'bloater', scale: 1.6, look: { shirt: 0xd8d0c0, belly: 0xa83a2a, skin: 0x9aa8a0 } });
Object.assign(ENEMIES.sergeant, { spd: 1.45, sense: 7, reach: 1.4, lunge: 2.3, grab: 0.0, shape: 'brute', scale: 1.85, knock: true, look: { skin: 0xb8c2c8, sleeve: 0xb8c2c8, shirt: 0x5a6446, pants: 0x4a5040, shin: 0xd8dee2, fist: 0x9aa4aa } });
Object.assign(ENEMIES.warden, { spd: 2.0, sense: 10, reach: 1.1, lunge: 1.6, grab: 0, shape: 'human', scale: 1.15, rng: 6, cd: 1.6, drop: ['shotgun'] });
/* Zombie types unlock over the first days so the threat grows gradually. */
const ZTIERS = [[1, ['walker']], [2, ['zdog', 'runner']], [3, ['screamer', 'bloater']], [4, ['brute']]];

/* Searchable containers. t = base seconds to search (PER shortens), r = loot rolls, cats = item categories they favour */
const CONTAINERS = {
  shelf: { n: 'Shelf', t: 1.6, r: 2, cats: null },
  cabinet: { n: 'Cabinet', t: 2.0, r: 2, cats: ['med', 'mat', 'misc'] },
  fridge: { n: 'Fridge', t: 1.4, r: 2, cats: ['food', 'water'] },
  crate: { n: 'Crate', t: 2.4, r: 3, cats: null },
  locker: { n: 'Locker', t: 2.2, r: 2, cats: ['ammo', 'weapon', 'med', 'gear', 'misc'] },
  desk: { n: 'Desk', t: 1.5, r: 1, cats: ['misc', 'med', 'mat'] },
  toolbox: { n: 'Toolbox', t: 1.8, r: 2, cats: ['mat'] },
  trunk: { n: 'Car Trunk', t: 2.2, r: 2, cats: null },
  rubble: { n: 'Rubble', t: 2.6, r: 2, cats: ['mat', 'misc', 'weapon'] },
  nets: { n: 'Fishing Nets', t: 3.0, r: 2, cats: ['food', 'water', 'mat'] },
  stash: { n: "Hunter's Stash", t: 2.0, r: 2, cats: null },
};
const CONT_KINDS = {
  supermarket: ['shelf', 'shelf', 'fridge', 'crate'], hospital: ['cabinet', 'locker', 'desk', 'cabinet'], police: ['locker', 'desk', 'cabinet'],
  gas: ['shelf', 'fridge', 'toolbox'], factory: ['toolbox', 'crate', 'locker'], farm: ['crate', 'toolbox', 'shelf'], apartments: ['cabinet', 'fridge', 'desk', 'shelf'],
  electronics: ['shelf', 'desk', 'crate'], radiotower: ['locker', 'toolbox', 'desk'], military: ['locker', 'crate', 'crate'], depot: ['toolbox', 'locker', 'crate'],
  street: ['rubble', 'crate', 'shelf'], forest: ['stash'], river: ['nets'],
  docks: ['locker', 'crate', 'toolbox', 'desk'], warehouse: ['crate', 'shelf', 'crate', 'locker'], house: ['cabinet', 'fridge', 'desk', 'shelf'], garage: ['toolbox'],
  ranger: ['locker', 'cabinet', 'desk', 'crate'], flooded: ['cabinet', 'shelf', 'fridge'], pass: ['crate', 'locker', 'cabinet'], suburbs: ['crate'],
};
const CONT_REFILL_DAYS = 6;

/* Shelter yard layout, in tiles relative to the shelter rect's top-left (x0,y0). [x, y, w, h].
   The bunker (concrete block with the hatch) sits at x 3..5, y 0..1; the hatch is the door tile at (4, 2). */
const BUILD_SLOTS = {
  bed: [0.2, 0.2, 2.5, 1.5], rain: [7, 0.2, 1, 1], tower: [9, 0, 1, 1], bench: [6.5, 2.6, 1.5, 1], forge: [0.2, 3, 1.5, 1],
  purifier: [8.6, 2.6, 1, 1], kitchen: [6.5, 4.6, 1.5, 1], woodshop: [8.4, 4.6, 1.5, 1.4], garden: [0.2, 5, 3, 2.5],
  infirmary: [3.6, 5.6, 2, 1.5], radio: [5.2, 0.3, 0.7, 0.7],
};
