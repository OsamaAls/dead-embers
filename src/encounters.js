// Dead Embers: outdoor random encounters.
// Physical things are PLAYED (`play`: horde, rescue, screamer, dodge, lock, race, barter). Real decisions keep `choices`.
(function () {
  const FG = (ids, opts) => { fight(ids, opts); return true; };
  // Hurts, but never kills: encounter fallout should sting, not end the run.
  const sore = (n, cause) => hurt(Math.max(0, Math.min(n, G.p.hp - 10)), cause);
  const list = (...xs) => xs.filter(Boolean).join(', ');

window.ENCOUNTERS = [
  // ---------- horde: just fight ----------
  {
    id: 'walker_pack', title: 'Shufflers in the Road', where: ['travel', 'street'], weight: 18,
    text: 'Three of the dead drift across the road, heads lolling. The wind is in your favour. For now.',
    play: { type: 'horde', foes: ['walker', 'walker', 'walker'],
      onWin: () => 'You go through their pockets. ' + give('cloth', 1) + '.',
      onLose: () => { addNoise(1); return 'You break off. They follow your scent for a block.'; } },
  },
  {
    id: 'lone_runner', title: 'Fast One', where: ['travel', 'street', 'depot'], weight: 12, minDay: 2,
    text: 'Bare feet slap the asphalt. A fresh one bolts out of an alley, jaw wide. You won\'t outrun it.',
    play: { type: 'horde', foes: ['runner'],
      onWin: () => 'It twitches once and stops. ' + give('snack', 1) + ' in its coat.',
      onLose: () => { tire(15); return 'You lose it over a wall, lungs burning.'; } },
  },
  {
    id: 'bloater_corridor', title: 'The Swollen One', where: ['apartments', 'hospital', 'supermarket', 'factory'], weight: 10, minDay: 3,
    text: 'A swollen corpse is wedged in the stairwell door, sloshing as it breathes. Don\'t pop it up close.',
    play: { type: 'horde', foes: ['bloater'],
      onWin: () => 'The air clears, eventually. ' + give('scrap', 1) + ' in the rubble behind it.',
      onLose: () => 'You back down the stairs. Whatever was up there stays there.' },
  },
  {
    id: 'brute_block', title: 'The Wall of Meat', where: ['travel', 'street', 'depot', 'factory'], weight: 8, minDay: 4,
    text: 'A hulk in a hi-vis vest blocks the gap between two wrecks. Arms like bridge cables. It sniffs the air.',
    play: { type: 'horde', foes: ['brute'],
      onWin: () => 'It finally topples. Its toolbelt: ' + list(give('scrap', 2), give('parts', 1)) + '.',
      onLose: () => { tire(12); passTime(1); return 'You take the long way round. It costs an hour and most of your breath.'; } },
  },
  {
    id: 'zdog_pack', title: 'Hounds', where: ['travel', 'street', 'farm', 'forest'], weight: 11, minDay: 2,
    text: 'Three grey dogs slide out of the hedge, eyes clouded red. They circle without barking, which is worse.',
    play: { type: 'horde', foes: ['zdog', 'zdog', 'zdog'],
      onWin: () => 'The last one stops twitching. ' + give('rawmeat', 1) + '. You\'ll think about it.',
      onLose: () => { sore(5, 'a dog bite'); return 'You make a fence and go over it. One of them got a taste first.'; } },
  },
  {
    id: 'corpse_pile', title: 'The Pile', where: ['travel', 'street', 'hospital', 'depot'], weight: 9,
    text: 'A heap of bodies behind a fence. Flies. Something in the pile twitches. Not the wind.',
    play: { type: 'horde', foes: ['walker', 'walker'],
      onWin: () => 'Now the pile stays still. Pockets: ' + list(give('cigs', 2), give('cloth', 1), give('bandage', 1)) + '.',
      onLose: () => { setStatus('sick', 4); return 'You retch and stumble off, empty-handed.'; } },
  },
  {
    id: 'night_stalkers', title: 'Eyes in the Dark', where: ['travel', 'street', 'farm', 'forest'], weight: 9, night: true,
    text: 'Two shapes at the edge of your light, too still to be alive. One of them turns its head.',
    play: { type: 'horde', foes: ['walker', 'walker', 'runner'],
      onWin: () => 'Three lie still in the dirt. ' + give('cloth', 1) + '.',
      onLose: () => { tire(8); passTime(1); return 'You backtrack an hour in the dark, hands out in front of you.'; } },
  },
  {
    id: 'farm_scarecrows', title: 'Field of Scarecrows', where: ['farm'], weight: 7,
    text: 'Scarecrows in a rotted field. One wears a recent jacket and is missing a hand. It turns.',
    play: { type: 'horde', foes: ['walker', 'walker'],
      onWin: () => 'The barn behind them hides a farmer\'s reserve: ' + list(give('veg', 2), give('canned', 1), give('cigs', 1)) + '.',
      onLose: () => 'You leave the field to the scarecrows. All of them.' },
  },

  // ---------- rescue: clear the dead around someone ----------
  {
    id: 'surrounded_survivor', title: 'Cornered', where: ['travel', 'street', 'supermarket', 'gas'], weight: 9,
    who: 'Trapped man',
    text: '"Over here! Please!" He\'s backed against a truck, swinging a tire iron. Four of them close in.',
    play: { type: 'rescue', foes: ['walker', 'walker', 'walker', 'walker'], who: 'Trapped man',
      onWin: () => { recruit({ name: pick(['Daniel', 'Hollis', 'Teo', 'Bram']), trait: 'grateful', skills: { combat: 3, scav: 2 } }); xp(20); return '"I owe you." He drops the tire iron and follows you home.'; },
      onLose: () => { addMorale(-8); return 'He goes down under them. You hear it for the rest of the day.'; } },
  },
  {
    id: 'rooftop_kid', title: 'Girl on the Car', where: ['travel', 'street', 'supermarket'], weight: 7, minDay: 2,
    who: 'Girl on the car',
    text: '"Up here! Up HERE!" A girl on a car roof, kicking at grey hands. The roof is denting.',
    play: { type: 'rescue', foes: ['walker', 'walker', 'walker'], who: 'Girl on the car',
      onWin: () => { recruit({ name: pick(['Rosa', 'Kit', 'Ada', 'Lumi']), trait: 'scared', skills: { scav: 3 } }); xp(18); return 'She slides down, shaking. "Got room for one more?" You do.'; },
      onLose: () => { addMorale(-8); return 'The roof gives. You don\'t look back, and you don\'t forget.'; } },
  },
  {
    id: 'pinned_scav', title: 'Pinned', where: ['depot', 'factory', 'gas'], weight: 7, minDay: 3,
    who: 'Pinned scavenger',
    text: '"Leg\'s stuck! They\'re coming!" A scavenger under a fallen shelf. The groaning gets closer.',
    play: { type: 'rescue', foes: ['walker', 'runner'], who: 'Pinned scavenger',
      onWin: () => { xp(15); return '"Owe you." He splits his haul: ' + list(give('parts', 2), give('fuel', 1)) + '.'; },
      onLose: () => { addMorale(-6); return 'The shelf wins. So do they.'; } },
  },

  // ---------- screamer: silence it in time ----------
  {
    id: 'screamer_cry', title: 'The Screaming Girl', where: ['travel', 'street', 'apartments', 'police'], weight: 10, minDay: 3,
    text: 'A thin figure in a torn dress, mouth stretched too wide. The scream is building. Shut it up.',
    play: { type: 'screamer', time: 6, extra: ['walker', 'walker', 'walker'],
      onWin: () => { xp(15); return 'It chokes off into a wet whisper. Silence returns.'; },
      onLose: () => 'The scream tears down the street. Doors bang open.' },
  },
  {
    id: 'mall_screamer', title: 'Something in the Aisles', where: ['supermarket', 'hospital', 'electronics'], weight: 8, minDay: 3,
    text: 'Somewhere in the aisles, a long wet breath being drawn in. A screamer, winding up. Find it. Fast.',
    play: { type: 'screamer', time: 6, extra: ['walker', 'walker', 'runner'],
      onWin: () => { xp(15); return 'It drops mid-breath. Apron pocket: ' + give('snack', 1) + '.'; },
      onLose: () => 'The shriek rolls down every aisle. Everything here is awake now.' },
  },
  {
    id: 'bridge_screamer', title: 'Siren on the Bridge', where: ['river', 'travel'], weight: 7, minDay: 4,
    text: 'A screamer stands on the bridge rail like a figurehead, chest heaving. Both banks will hear it.',
    play: { type: 'screamer', time: 7, extra: ['walker', 'walker', 'zdog'],
      onWin: () => { xp(15); return 'It goes over the rail and into the brown water. Quiet.'; },
      onLose: () => 'It howls. Both banks answer.' },
  },

  // ---------- dodge: telegraphed collapses ----------
  {
    id: 'collapsing_floor', title: 'Rotten Boards', where: ['apartments', 'factory', 'supermarket', 'depot'], weight: 9,
    text: 'Crates of dry goods on the upper walkway. The boards under them are soft and dark. Then they start to give.',
    play: { type: 'dodge', waves: 4, dmg: [6, 12],
      onWin: () => { xp(10); return 'You hug the wall to the crates. ' + list(give('canned', 2), give('parts', 1), give('wood', 2)) + '.'; },
      onLose: () => { addNoise(2); return 'You drop through to the basement. The crates stay up there.'; } },
  },
  {
    id: 'stair_collapse', title: 'The Stairwell Goes', where: ['apartments', 'hospital', 'police'], weight: 7, minDay: 2,
    text: 'The stairwell groans. Dust sifts down, then chunks of it. Move.',
    play: { type: 'dodge', waves: 3, dmg: [5, 10],
      onWin: () => { xp(10); return 'You make the landing as the flight behind you drops. ' + give('scrap', 1) + ' in the debris.'; },
      onLose: () => { addNoise(2); return 'You come down with the stairs. Bruised, filthy, alive.'; } },
  },
  {
    id: 'catwalk', title: 'Rust Catwalk', where: ['factory', 'depot'], weight: 7, minDay: 2,
    text: 'A rusted catwalk over the factory floor, a toolbox at the far end. Bolts start popping as you step on.',
    play: { type: 'dodge', waves: 4, dmg: [6, 12],
      onWin: () => { xp(12); return 'The toolbox was worth it: ' + list(give('parts', 2), give('scrap', 1)) + '.'; },
      onLose: () => { addNoise(2); return 'The catwalk folds. The toolbox lands somewhere you can\'t reach.'; } },
  },
  {
    id: 'ceiling_fall', title: 'Soft Ceiling', where: ['supermarket', 'electronics', 'gas'], weight: 7,
    text: 'Ceiling tiles bulge with old rainwater. One drops. Then the whole grid starts to go.',
    play: { type: 'dodge', waves: 3, dmg: [4, 9],
      onWin: () => { xp(8); return 'Under the soggy tiles, a stockroom shelf: ' + list(give('canned', 1), give('water', 1)) + '.'; },
      onLose: () => { tire(10); return 'A tile to the head, a lungful of wet plaster. Nothing else.'; } },
  },

  // ---------- lock: pick or pry ----------
  {
    id: 'hidden_stash', title: 'Loose Brick', where: ['any'], weight: 12,
    text: 'A brick in the alley wall sits out of line, scratch marks round it. Someone hid something and never came back.',
    play: { type: 'lock', mode: 'pry', diff: 3,
      onWin: () => { xp(10); return 'A coffee tin: ' + list(give('canned', 1), give('ammo', 3), give('cigs', 2)) + '.'; },
      onLose: () => { addNoise(2); return 'The brick cracks loud. Behind it: dust and an old bus ticket.'; } },
  },
  {
    id: 'locked_safe', title: 'The Safe', where: ['police', 'apartments', 'supermarket', 'electronics', 'gas'], weight: 8,
    text: 'A squat steel safe in the back office, keypad cracked. Whoever locked it thought it mattered.',
    play: { type: 'lock', mode: 'pick', diff: 6,
      onWin: () => { xp(20); return 'Click. Inside: ' + list(give('ammo', 5), give('cigs', 4), give('batteries', 2)) + '.'; },
      onLose: () => { addNoise(2); return 'The lock jams with a clank that carries. The safe keeps its secrets.'; } },
  },
  {
    id: 'abandoned_car', title: 'Abandoned Sedan', where: ['travel', 'street', 'gas', 'depot'], weight: 14,
    text: 'A sedan half on the curb, driver door open, seats stained brown. The trunk is shut.',
    play: { type: 'lock', mode: 'pry', diff: 3,
      onWin: () => { xp(6); return 'Spare tyre, a jack, and ' + list(give('parts', 1), give('cloth', 1), chance(0.4) && give('fuel', 1)) + '.'; },
      onLose: () => { sore(4, 'a slipped crowbar'); return 'The bar slips and splits your knuckles. The trunk wins.'; } },
  },
  {
    id: 'pharmacy_shelf', title: 'Back of the Pharmacy', where: ['apartments'], weight: 8,
    text: 'Behind the pharmacy counter, a roll shutter hides the stockroom. A slice of dark beneath it.',
    play: { type: 'lock', mode: 'pry', diff: 4,
      onWin: () => { xp(10); return 'Untouched shelves: ' + list(give('painkillers', 2), give('bandage', 2), give('antibiotics', 1)) + '.'; },
      onLose: () => { addNoise(2); fight(['walker', 'walker']); return 'The shutter shrieks and jams. Something heard that.'; } },
  },
  {
    id: 'gas_siphon', title: 'The Last Pump', where: ['gas'], weight: 12,
    text: 'A rusted hand pump chained to the forecourt wall. The tanks might still hold. It will be loud.',
    play: { type: 'lock', mode: 'pry', diff: 4,
      onWin: () => { addNoise(1); xp(8); return 'The pump screams, then fuel gurgles up. ' + give('fuel', 3) + '.'; },
      onLose: () => { addNoise(2); fight(['walker', 'walker']); return 'The handle shrieks and seizes. Two of the dead turn your way.'; } },
  },
  {
    id: 'gun_locker', title: 'Gun Locker', where: ['police', 'military'], weight: 6, minDay: 3,
    text: 'A gun locker, still bolted. The dial is scratched where someone gave up.',
    play: { type: 'lock', mode: 'pick', diff: 7,
      onWin: () => { xp(20); return 'It swings open. ' + list(give('ammo', 4), chance(0.3) ? give('shotgun', 1) : give('shells', 3)) + '.'; },
      onLose: () => { addNoise(2); return 'The dial jams with a crack. Whatever is in there stays there.'; } },
  },
  {
    id: 'hospital_cage', title: 'The Drug Cage', where: ['hospital'], weight: 7,
    text: 'A pharmacy cage in the basement, padlocked. The shelves inside are not empty.',
    play: { type: 'lock', mode: 'pick', diff: 5,
      onWin: () => { xp(12); return 'The padlock drops. ' + list(give('antibiotics', 1), give('painkillers', 2), give('bandage', 2)) + '.'; },
      onLose: () => { addNoise(2); fight(['walker', 'walker']); return 'The pick snaps in the lock. Footsteps in the corridor.'; } },
  },

  // ---------- race: get there before time / the dead ----------
  {
    id: 'acid_rain', title: 'Ash Rain', where: ['travel', 'street', 'farm', 'forest', 'river'], weight: 9,
    text: 'The sky bruises. Ash, then a thin rain that stings. Get under cover. Now.',
    play: { type: 'race', time: 30, foes: [],
      onWin: () => { xp(8); return 'You make the bus shelter as the street starts to hiss.'; },
      onLose: () => { sore(8, 'acid rain'); setStatus('sick', 4); return 'It eats at your skin and eyes. You find cover, blistered and shaking.'; } },
  },
  {
    id: 'supply_drop', title: 'Fallen Crate', where: ['military'], weight: 10, minDay: 3,
    text: 'A garrison crate on a dead parachute, seal intact. The dead have noticed it too.',
    play: { type: 'race', time: 40, foes: ['walker', 'walker', 'runner'],
      onWin: () => { xp(20); return 'You crack the seal first: ' + list(give('ammo', 6), give('medkit', 1), give('canned', 3)) + '.'; },
      onLose: () => 'They swarm the crate. You grab ' + give('canned', 1) + ' and go.' },
  },
  {
    id: 'church_bell', title: 'The Bell', where: ['travel', 'street', 'apartments'], weight: 7, minDay: 2,
    text: 'Tins on a church altar, the bell rope tied to the pile. A trap. The bell is already swinging. Grab and go.',
    play: { type: 'race', time: 30, foes: ['walker', 'walker', 'walker'],
      onWin: () => { xp(12); return 'You clear the altar: ' + list(give('canned', 3), give('cigs', 2)) + '.'; },
      onLose: () => { addNoise(2); return 'The bell tolls on. You leave with nothing but company.'; } },
  },
  {
    id: 'horde_edge', title: 'The Edge of a Horde', where: ['travel', 'street'], weight: 6, minDay: 6, night: true,
    text: 'A sound like surf. Forty of the dead flowing down the street, and you\'re upwind. Reach the side street.',
    play: { type: 'race', time: 35, foes: ['walker', 'walker', 'walker', 'runner'],
      onWin: () => { xp(20); return 'Walls between you and them. You let yourself breathe.'; },
      onLose: () => { addNoise(3); return 'A straggler groans. The column turns.'; } },
  },
  {
    id: 'red_flare', title: 'Red Flare', where: ['travel', 'street', 'farm'], weight: 6, minDay: 3,
    text: 'A red flare arcs over the roofs and lands two blocks over. Whoever fired it has gone quiet. Their pack hasn\'t.',
    play: { type: 'race', time: 35, foes: ['walker', 'walker', 'runner'],
      onWin: () => { xp(14); return 'A dead man\'s pack by the flare: ' + list(give('canned', 2), give('water', 1), give('bandage', 1)) + '.'; },
      onLose: () => 'The dead got there first. The flare gutters out under them.' },
  },
  {
    id: 'closing_gate', title: 'Closing Shutter', where: ['military'], weight: 7,
    text: 'The checkpoint armoury shutter still runs on solar, and it is grinding shut. Get under it.',
    play: { type: 'race', time: 25, foes: [],
      onWin: () => { xp(12); return 'You roll under as it seals. Inside: ' + list(give('ammo', 4), give('medkit', 1)) + '.'; },
      onLose: () => 'The shutter seals with a clang. Maybe it opens again tomorrow.' },
  },

  // ---------- barter: trade screens ----------
  {
    id: 'wandering_trader', title: 'Peddler on the Road', where: ['travel', 'street', 'farm'], weight: 9, night: false,
    who: 'Peddler',
    text: '"Trade? No tricks." A hand cart, a shotgun across his knees, and a lot of rattling tins.',
    play: { type: 'barter', onWin: () => 'He tips his hat. The cart rattles off.' },
  },
  {
    id: 'kids_stall', title: 'Trolley Traders', where: ['street', 'apartments', 'supermarket'], weight: 6, minDay: 2, night: false,
    who: 'Kid with a trolley',
    text: '"Best prices in the Vale! No refunds!" Two kids and a shopping trolley full of loot.',
    play: { type: 'barter', stock: { snack: 3, water: 2, batteries: 2, cloth: 2, bandage: 1 },
      onWin: () => '"Pleasure doing business." They wheel off, arguing about the split.' },
  },
  {
    id: 'pharmacist', title: 'The Pharmacist', where: ['hospital', 'apartments'], weight: 6, minDay: 3, night: false,
    who: 'Old pharmacist',
    text: '"Pills for goods. Tins, batteries, ammo. Not promises."',
    play: { type: 'barter', stock: { antibiotics: 2, painkillers: 3, bandage: 3, medkit: 1 },
      onWin: () => 'He locks his case and is gone before you turn around.' },
  },
  {
    id: 'tollmen_sutler', title: 'The Warden\'s Market', where: ['tollcamp'], weight: 8, night: false,
    who: 'Tollmen sutler',
    text: '"Warden\'s market. Prices are fixed. Complaints are also fixed."',
    play: { type: 'barter', stock: { ammo: 6, shells: 3, cigs: 5, fuel: 2, canned: 3 },
      onWin: () => 'He writes your name in a little book. Of course he does.' },
  },

  // ---------- decisions: people, deals, mercy ----------
  {
    id: 'bitten_stranger', title: 'A Mercy Asked', where: ['travel', 'street', 'apartments', 'hospital'], weight: 8,
    who: 'Bitten woman',
    text: '"Bitten this morning. Help me, or finish it quick. I\'m not fussy."',
    choices: [
      { label: 'Give her antibiotics', req: () => has('antibiotics'), reqText: 'Needs antibiotics',
        success: () => { take('antibiotics', 1); xp(15); addMorale(5); return chance(0.25) ? 'By morning the fever breaks. Against all odds. She presses ' + give('canned', 2) + ' on you.' : 'It doesn\'t work. But she isn\'t afraid at the end.'; } },
      { label: 'Grant her mercy', success: () => { addMorale(-6); xp(8); return 'You do it fast. She whispers thanks. Her pack: ' + list(give('bandage', 1), give('cigs', 2)) + '.'; } },
      { label: 'Leave her be', success: () => { addMorale(-3); return 'You leave her in the doorway. Behind you, she starts to hum.'; } },
    ],
  },
  {
    id: 'wounded_stranger', title: 'Wounded Man', where: ['travel', 'street', 'forest', 'farm'], weight: 9,
    who: 'Wounded man',
    text: '"Wrap the leg and I can walk." A deep gash, a pistol he can\'t lift. He doesn\'t look like a raider. Nobody does.',
    choices: [
      { label: 'Bandage him', req: () => has('bandage'), reqText: 'Needs a bandage',
        success: () => { take('bandage', 1); xp(12); recruit({ trait: 'loyal', skills: { combat: 2, scav: 2 } }); return 'He grips your hand. "Nowhere else to go." He comes with you.'; } },
      { label: 'Search him first', check: { attr: 'per', diff: 4 },
        success: () => 'Nothing hostile on him. You take ' + give('ammo', 3) + ' and leave him water.',
        fail: () => { sore(6, 'a hidden knife'); return 'His knife bites your side. He crawls off into the weeds.'; } },
      { label: 'Walk on', success: () => 'You nod and keep moving. Hard calls are the only calls here.' },
    ],
  },
  {
    id: 'lost_kids', title: 'Two Small Faces', where: ['travel', 'street', 'apartments', 'supermarket'], weight: 6, minDay: 2,
    text: 'Two kids behind a bus shelter, nine and twelve maybe. Empty backpack. They haven\'t eaten in days.',
    choices: [
      { label: 'Share your food', req: () => has('canned') || has('snack'), reqText: 'Needs food',
        success: () => { if (!take('snack', 1)) take('canned', 1); xp(15); addMorale(8); recruit({ name: 'Mina', trait: 'scared', skills: { scav: 1 } }); return 'They eat in silence. "Can we come with you?" You can\'t say no.'; } },
      { label: 'Coax them to follow', check: { attr: 'cha', diff: 5 },
        success: () => { xp(10); recruit({ name: 'Jonah', trait: 'quiet', skills: { scav: 1 } }); return 'You crouch and hold out a hand. After a long moment, the older one takes it.'; },
        fail: () => 'They bolt through a gap in the fence. You don\'t chase them.' },
      { label: 'Leave them', success: () => { addMorale(-10); return 'You walk away. Their faces follow you home.'; } },
    ],
  },
  {
    id: 'hospital_doctor', title: 'The Hidden Doctor', where: ['hospital'], weight: 10, once: true, minDay: 2,
    who: 'Woman in a white coat',
    text: '"Shotgun\'s loaded. What do you want?" She has been alone behind this door for months.',
    choices: [
      { label: 'Offer her a place', check: { attr: 'cha', diff: 5 },
        success: () => { xp(25); recruit({ name: 'Dr. Imara Voss', trait: 'steady', skills: { med: 5, scav: 1 } }); return 'A long look. Then she picks up a worn medical bag. Your shelter has a doctor.'; },
        fail: () => '"I\'ve seen what people do." The bolts slide home.' },
      { label: 'Trade 2 cans for medicine', req: () => has('canned', 2), reqText: 'Needs 2 Canned Food',
        success: () => { take('canned', 2); xp(8); return 'A bundle through the crack: ' + list(give('medkit', 1), give('antibiotics', 1)) + '.'; } },
      { label: 'Back away', success: () => 'You lower your weapon and leave. Her door stays shut.' },
    ],
  },
  {
    id: 'raider_ambush', title: 'Ambush', where: ['travel', 'street', 'depot', 'factory', 'tollcamp'], weight: 12, minDay: 2,
    who: 'Raider',
    text: '"Everything you got." A trip wire, clattering cans, three men in stolen riot gear.',
    choices: [
      { label: 'Draw on them', success: () => FG(['raider', 'raider', 'raider'], { onWin: () => 'Their packs: ' + list(give('ammo', 3), give('canned', 1), give('cigs', 3)) + '.' }) && 'You go for the tallest one first.' },
      { label: 'Drop the Warden\'s name', check: { attr: 'cha', diff: 6 },
        success: () => { xp(15); return 'You mention a deal with the Warden. They trade looks and step aside.'; },
        fail: () => FG(['raider', 'raider', 'raider'], { onWin: () => 'Their packs: ' + list(give('ammo', 3), give('cigs', 3)) + '.' }) && '"Never heard of him." They draw.' },
      { label: 'Pay them off', req: () => has('cigs', 2) || has('canned'), reqText: 'Needs 2 cigarettes or a can',
        success: () => { if (!take('cigs', 2)) take('canned', 1); return 'They pocket it and wave you on, grinning.'; } },
    ],
  },
  {
    id: 'toll_collector', title: 'The Toll', where: ['travel', 'street', 'tollcamp'], weight: 12,
    who: 'Tollman',
    text: '"Warden says everyone pays to walk his roads." He taps a bat against his palm.',
    choices: [
      { label: 'Pay the toll', success: () => { if (take('cigs', 3)) return 'Three cigarettes. They wave you through with mock courtesy.'; if (take('canned', 1)) return 'No smokes, so a can. They wave you through, sneering.'; sore(5, 'a Tollman beating'); return 'Nothing worth taking, so they take it out of you.'; } },
      { label: 'Talk the price down', check: { attr: 'cha', diff: 5 },
        success: () => { xp(12); return 'A tired smile and the Warden\'s own rules. They let you through free.'; },
        fail: () => { take('cigs', 3); return 'They laugh. The price just went up.'; } },
      { label: 'Refuse to pay', success: () => FG(['tollman', 'tollman'], { onWin: () => 'Their toll box: ' + list(give('cigs', 4), give('ammo', 2)) + '.' }) && 'You step over the rope. The bat comes up.' },
    ],
  },
  {
    id: 'radio_hermit', title: 'The Hermit with the Dials', where: ['radiotower', 'electronics', 'travel'], weight: 8, once: true,
    cond: () => !flag('got_coil'),
    who: 'The Hermit',
    text: '"Haven\'s broadcast never changes. Not one word. Does that sound like a person to you?"',
    choices: [
      { label: 'Ask about the broadcast', check: { attr: 'int', diff: 5 },
        success: () => { journal('The Hermit\'s Theory', 'The hermit says Haven\'s broadcast loops every 41 minutes with identical pauses. He thinks it is a recording left by someone who is no longer there. He gave me a radio coil to tune my own set.'); setFlag('got_coil', true); xp(20); return 'An hour of theories. Then he hands you a wire-wound part. ' + give('radio_coil', 1) + '.'; },
        fail: () => { journal('The Hermit\'s Theory', 'The hermit talks about Haven\'s signal without end. He insists the broadcast is not what it seems.'); return 'He talks until your head hurts. The broadcast loops. He doesn\'t trust it.'; } },
      { label: 'Trade food for batteries', req: () => has('snack') || has('canned'), reqText: 'Needs food',
        success: () => { if (!take('snack', 1)) take('canned', 1); return 'A dusty swap. ' + give('batteries', 2) + '.'; } },
      { label: 'Move on', success: () => 'You leave him to his dials. The static follows you.' },
    ],
  },
  {
    id: 'mirror_message', title: 'Writing on the Mirror', where: ['apartments', 'hospital', 'police', 'electronics'], weight: 6, once: true,
    text: 'Lipstick on a bathroom mirror: HAVEN IS A LIE? A mug of tea on the sink, long dried.',
    choices: [
      { label: 'Search the room', check: { attr: 'int', diff: 5 },
        success: () => { journal('A Message in Lipstick', 'Someone wrote HAVEN IS A LIE? on a mirror. Behind the cabinet, a torn note in the same hand: "No convoys came back from the north pass."'); xp(18); return 'A torn note behind the cabinet: no convoys came back from the pass. And ' + give('canned', 1) + '.'; },
        fail: () => { journal('A Message in Lipstick', 'Someone wrote HAVEN IS A LIE? on a mirror. I found nothing else.'); return 'Just the mirror. And the question.'; } },
      { label: 'Wipe it away', success: () => { addMorale(1); return 'You wipe it with your sleeve. Some doubts are better not fed.'; } },
      { label: 'Write YES under it', success: () => { xp(5); journal('A Message in Lipstick', 'Someone asked on a mirror if Haven is a lie. I wrote YES under it.'); return 'You scrawl YES beneath it. Comforting or terrifying, depending on the reader.'; } },
    ],
  },
  {
    id: 'river_fishing', title: 'Slow Water', where: ['river'], weight: 12, night: false,
    text: 'Brown, slow water. Silver shapes flicker in the reeds. Nobody has fished here in a year.',
    choices: [
      { label: 'Fish with a line', check: { attr: 'per', diff: 4 },
        success: () => { xp(8); passTime(1); return 'The line jerks. Three fat fish. ' + list(give('meal', 1), give('rawmeat', 1)) + '.'; },
        fail: () => { passTime(2); return 'Two hours, not one bite. The fish are smarter than they look.'; } },
      { label: 'Wade in and grab', check: { attr: 'agi', diff: 6 },
        success: () => { xp(12); return 'Bare hands, one quick snatch. ' + give('rawmeat', 2) + '.'; },
        fail: () => { setStatus('sick', 3); return 'You slip and swallow a mouthful of river.'; } },
      { label: 'Fill your bottles', success: () => 'Boil it before you drink it. ' + give('dirtywater', 2) + '.' },
    ],
  },
  {
    id: 'forest_snare', title: 'Tracks in the Mud', where: ['forest', 'farm'], weight: 12, night: false,
    text: 'Fresh tracks in the mud, funnelled between two fallen trunks. A perfect place for a snare.',
    choices: [
      { label: 'Set a snare', req: () => has('cloth') || has('scrap'), reqText: 'Needs cloth or scrap',
        success: () => { if (!take('cloth', 1)) take('scrap', 1); passTime(2); xp(6); return chance(0.7) ? 'Two hours later the line is tight. ' + give('rawmeat', 2) + '.' : 'Two hours. The snare stays empty.'; } },
      { label: 'Stalk the tracks', check: { attr: 'per', diff: 5 },
        success: () => { xp(12); return 'A deer, still as stone. One clean blow. ' + give('rawmeat', 3) + '.'; },
        fail: () => { tire(10); return 'The trail doubles back. You lose an hour and the light.'; } },
      { label: 'Forage for roots', success: () => 'Dirty fingers, small reward. ' + give('veg', 1) + '.' },
    ],
  },

  // ---------- story encounters: people of the Vale ----------
  {
    id: 'ruin_wedding', title: 'A Wedding in the Ruins', where: ['street', 'apartments', 'travel'], weight: 7, minDay: 4, night: false, once: true,
    who: 'Groom in a borrowed suit',
    text: 'A dozen guests under a bent bus shelter, a bride in curtain lace. "We need a witness. You\'ll do."',
    choices: [
      { label: 'Stand as witness', success: () => { setFlag('wedding_witness', true); addMorale(8); xp(10); return 'You sign a cereal box. They kiss. Someone cries. Someone else keeps watching the street.'; } },
      { label: 'Give them a can as a gift', req: () => has('canned'), reqText: 'Needs canned food',
        success: () => { take('canned', 1); setFlag('wedding_witness', true); setFlag('wedding_gift', true); addMorale(10); xp(12); return 'A can of peaches with a bootlace bow. The bride holds it up like a trophy.'; } },
      { label: 'Keep walking', success: () => { addMorale(-2); return 'Behind you, a ragged cheer. You don\'t turn round.'; } },
    ],
  },
  {
    id: 'pirate_dj', title: 'Static Sam', where: ['street', 'electronics', 'radiotower', 'travel'], weight: 7, minDay: 3, once: true,
    who: 'Static Sam',
    text: '"Static Sam, live and undead-free!" A van with a speaker on the roof, blaring soul. The dead are coming to dance.',
    play: { type: 'horde', foes: ['walker', 'walker', 'runner'],
      onWin: () => { setFlag('dj_saved', true); xp(15); return '"This one goes out to my bodyguard!" Sam tosses you ' + give('batteries', 3) + ' from the window.'; },
      onLose: () => { setFlag('dj_silenced', true); addNoise(1); return 'They rock the van till the speaker dies. Sam drives off on the rims, still talking.'; } },
  },
  {
    id: 'map_girl', title: 'The Mapmaker', where: ['street', 'apartments', 'supermarket', 'travel'], weight: 7, minDay: 3, night: false, once: true,
    who: 'Girl with a satchel',
    text: '"Maps! Hand-drawn, mostly correct! Three smokes or a can." Crayon roads, with skulls where the dead are.',
    choices: [
      { label: 'Buy one for 3 cigarettes', req: () => has('cigs', 3), reqText: 'Needs 3 cigarettes',
        success: () => { take('cigs', 3); setFlag('mapkid_paid', true); xp(10); return 'Her skulls are accurate. She\'s marked a stash too: ' + list(give('canned', 1), give('bandage', 1)) + '.'; } },
      { label: 'Buy one for a can', req: () => has('canned'), reqText: 'Needs canned food',
        success: () => { take('canned', 1); setFlag('mapkid_paid', true); xp(10); return 'A cross marks a dead man\'s locker. She was right: ' + list(give('batteries', 2), give('cigs', 2)) + '.'; } },
      { label: 'Ask who taught her', check: { attr: 'cha', diff: 4 },
        success: () => { xp(8); addMorale(-2); return '"My dad. Surveyor. He\'s the skull by the river." She says it like the weather.'; },
        fail: () => '"Trade secret." She rolls up her maps and is gone.' },
    ],
  },
  {
    id: 'guard_dog', title: 'The Guard Dog', where: ['street', 'apartments', 'farm', 'travel'], weight: 7, minDay: 4, once: true,
    text: 'A shepherd dog lies across a body in a doorway. It growls, weak but steady. It hasn\'t eaten in days.',
    choices: [
      { label: 'Feed it', req: () => has('rawmeat') || has('canned'), reqText: 'Needs meat or canned food',
        success: () => { if (!take('rawmeat', 1)) take('canned', 1); const had = !!G.dog; adoptDog('Shep'); addMorale(8); xp(10); return 'It eats, noses the body one last time, then falls in at your heel.' + (had ? ' It trots off toward the bunker to meet the others.' : ' You call it Shep.'); } },
      { label: 'Ease the pack off the body', check: { attr: 'agi', diff: 5 },
        success: () => { addMorale(-3); return 'You slide it free while the dog watches. ' + list(give('ammo', 3), give('bandage', 1)) + '. It never stops watching.'; },
        fail: () => { sore(5, 'a dog bite'); return 'It\'s faster than it looks. You leave with a torn hand and nothing else.'; } },
      { label: 'Leave it on guard', success: () => { addMorale(1); return 'Some posts are worth keeping. You leave it to its watch.'; } },
    ],
  },
  /* Stray at the Pump: feed the same stray on three different days, then it is yours and you name it */
  {
    id: 'stray_pump', title: 'Stray at the Pump', where: ['gas', 'street', 'suburbs', 'park', 'travel'], weight: 9, minDay: 2,
    cond: () => !G.dog && (G.flags.stray_fed || 0) < 3 && G.flags.stray_day !== G.day,
    text: () => (G.flags.stray_fed || 0) === 0 ? 'A thin brown dog watches you from under a dead fuel pump. It does not run. It does not come closer either.'
      : (G.flags.stray_fed || 0) === 1 ? 'The brown stray again. It stands up when it sees you, tail low, waiting.' : 'The stray trots out to meet you this time. It sits. It has decided something.',
    choices: [
      { label: 'Share some food', req: () => has('canned') || has('snack') || has('rawmeat'), reqText: 'Needs food',
        success: () => { if (!take('rawmeat', 1) && !take('snack', 1)) take('canned', 1); const n = (G.flags.stray_fed || 0) + 1; setFlag('stray_fed', n); setFlag('stray_day', G.day); addMorale(2);
          return n >= 3 ? 'It eats, then walks beside you for a block before it stops. Tomorrow, maybe, it will not stop.' : n === 2 ? 'It eats from your hand this time. Its ribs are less sharp.' : 'You leave the food and back off. It waits until you are gone to eat.'; } },
      { label: 'Leave it be', success: () => 'Not today. It watches you go.' },
    ],
  },
  {
    id: 'stray_name', title: 'The Stray Follows', where: ['any', 'travel'], weight: 40, once: true,
    cond: () => !G.dog && (G.flags.stray_fed || 0) >= 3 && G.day > (G.flags.stray_day || 0),
    text: 'Paws on the road behind you. The brown stray has followed your scent across the city. It sits at your feet and waits for a name.',
    choices: [
      { label: 'Call her Ember', success: () => { adoptDog('Ember'); xp(10); return 'Ember sneezes, which you decide means yes.'; } },
      { label: 'Call him Rust', success: () => { adoptDog('Rust'); xp(10); return 'Rust leans his whole weight against your leg.'; } },
      { label: 'Call it Patch', success: () => { adoptDog('Patch'); xp(10); return 'Patch wags so hard it nearly falls over.'; } },
      { label: 'Send it away', success: () => { setFlag('stray_fed', 0); addMorale(-3); return 'You stamp and shout. It goes. You feel worse than it does.'; } },
    ],
  },
  {
    id: 'pharmacy_note', title: 'Note on the Counter', where: ['apartments', 'hospital', 'street'], weight: 7, minDay: 3, once: true,
    text: 'A stripped pharmacy. One box left on the counter, and a note: "For whoever needs it more than me. R."',
    choices: [
      { label: 'Take it', success: () => 'You take it. It sits in your pack like a debt. ' + give('antibiotics', 1) + '.' },
      { label: 'Take it, leave a can', req: () => has('canned'), reqText: 'Needs canned food',
        success: () => { take('canned', 1); setFlag('pharmacy_paid', true); addMorale(5); return 'You leave the can and a note: "Thanks, R. Passing it on." ' + give('antibiotics', 1) + '.'; } },
      { label: 'Leave it for someone else', success: () => { setFlag('pharmacy_left', true); addMorale(4); xp(8); return 'You write one line under hers: "Not yet." The box stays where it is.'; } },
    ],
  },
  {
    id: 'carrying_mother', title: 'The Long Walk', where: ['travel', 'street', 'forest'], weight: 7, minDay: 5, once: true,
    who: 'Man carrying his mother',
    text: 'A man with an old woman on his back, slow as a walker. Real walkers close in. "I won\'t put her down!"',
    play: { type: 'rescue', who: 'Man carrying his mother', foes: ['walker', 'walker', 'runner'],
      onWin: () => { setFlag('mother_helped', true); recruit({ name: 'Anton', trait: 'hardworker', skills: { build: 3, combat: 2 } }); recruit({ name: 'Petra', trait: 'cheerful', skills: { med: 2, farm: 2 } }); xp(18); return 'Anton and his mother Petra come home with you. She says you need a haircut.'; },
      onLose: () => { setFlag('mother_north', true); addMorale(-5); return 'He gets clear, still carrying her, and doesn\'t stop. You never learn their names.'; } },
  },
  {
    id: 'brothers_car', title: 'Two Brothers, One Car', where: ['street', 'gas', 'depot', 'travel'], weight: 7, minDay: 4, once: true,
    text: 'Two brothers shouting over a running hatchback. One wants to go north; one won\'t leave their mother\'s grave.',
    choices: [
      { label: 'Side with going north', check: { attr: 'cha', diff: 5 },
        success: () => { setFlag('brothers_north', true); xp(10); return 'The younger one cries, then gets in. They leave you ' + give('fuel', 1) + ' for your trouble.'; },
        fail: () => { setFlag('brothers_north', true); return 'They both turn on you, agreeing for once. Then they drive off together, still shouting.'; } },
      { label: 'Side with staying', success: () => { setFlag('brothers_stay', true); xp(8); return 'The engine dies. Quiet. The older one hands you ' + give('fuel', 2) + '. "Won\'t need it now."'; } },
      { label: 'Siphon the tank', success: () => { setFlag('brothers_robbed', true); addMorale(-4); return FG(['raider', 'raider'], { onWin: () => 'Two brothers in the dirt. The fuel is yours. It doesn\'t feel like winning.', onFlee: () => 'You run with the fuel. Their shouting follows you for a block.' }) && 'While they argue, you drain it. ' + give('fuel', 3) + '. The engine coughs out. They notice.'; } },
    ],
  },
  {
    id: 'wind_chimes', title: 'Chimes on the Balcony', where: ['apartments', 'street'], weight: 7, minDay: 3, once: true,
    text: 'Dozens of wind chimes on a third-floor balcony, ringing in the breeze. The dead below stand still, listening.',
    choices: [
      { label: 'Climb up and look', check: { attr: 'agi', diff: 5 },
        success: () => { journal('The Chime House', 'An old man hung chimes on his balcony and died in his chair beneath them. The dead stand below and do not move. Sound can hold them, for a while. The Choir knows it too.'); xp(12); return 'An old man in a chair, long gone, a chime in his lap. ' + list(give('canned', 2), give('cloth', 2)) + '.'; },
        fail: () => { sore(5, 'a fall'); addNoise(2); return 'A railing gives. You land hard. The dead don\'t even look round.'; } },
      { label: 'Take some chimes home', success: () => { setFlag('chimes_home', true); addMorale(6); return 'You unhook three. At the bunker they ring all night. Everyone sleeps better.'; } },
      { label: 'Stand and listen', success: () => { addMorale(3); rest(10); return 'You stand among the dead and listen. Nobody bites anyone. For a minute.'; } },
    ],
  },

  // ---------- the districts: each biome has its own trouble ----------
  /* where = the biome's LOCS type plus its buildings (container searches pass the building type, walking passes the biome type).
     No minDay or cond: the story gates already keep the docks (day 8 / marcus_3), the woods (the radio) and the pass (the bus quest) shut. */

  // the Docks: stacked containers, cranes, tides
  {
    id: 'dock_stacks', title: 'The Leaning Stack', where: ['docks'], weight: 22,
    text: 'A crane dropped its load on the stacks. Containers lean over the quay, groaning. One starts to slide.',
    play: { type: 'dodge', waves: 4, dmg: [6, 12],
      onWin: () => { xp(12); return 'You squeeze out between two boxes. One split open: ' + list(give('canned', 2), give('cloth', 2)) + '.'; },
      onLose: () => { addNoise(2); return 'A container hits the quay like a bomb. Every dead thing on the docks heard it.'; } },
  },
  {
    id: 'dock_crane', title: 'Man in the Crane', where: ['docks'], weight: 20,
    who: 'Crane driver',
    text: 'A man waves from a crane cab forty feet up. The dead crowd the ladder below, clawing at the rungs.',
    play: { type: 'rescue', foes: ['walker', 'walker', 'bloater'], who: 'Crane driver',
      onWin: () => { recruit({ name: pick(['Ossie', 'Dev', 'Tamsin', 'Goran']), trait: 'steady', skills: { build: 3, scav: 2 } }); xp(18); return 'He climbs down on rubber legs. "Four days up there. Is that water?" He comes home.'; },
      onLose: () => { addMorale(-7); return 'One of them makes the ladder. He has nowhere left to go but down.'; } },
  },
  {
    id: 'dock_tide', title: 'The Tide Comes In', where: ['warehouse', 'docks'], weight: 22,
    text: 'Water slaps in at a warehouse door. The tide is turning and the floor is going under. Get high.',
    play: { type: 'race', time: 32, foes: ['bloater', 'walker'],
      onWin: () => { xp(14); return 'You reach the mezzanine, wet to the knee. A dry pallet up here: ' + list(give('water', 2), give('canned', 1)) + '.'; },
      onLose: () => { setStatus('sick', 3); return 'You wade out chest-deep, swallowing harbour. Something brushed your leg.'; } },
  },
  {
    id: 'dock_angler', title: 'The Angler', where: ['docks'], weight: 18, night: false,
    who: 'Old angler',
    text: 'An old man fishes off the pier, a rifle across his knees. "Dead don\'t swim. Sit, if you\'re quiet."',
    choices: [
      { label: 'Fish with him', success: () => { passTime(2); rest(10); addMorale(4); return 'Two hours, three mackerel, not one word. ' + give('rawmeat', 2) + '. The best afternoon in months.'; } },
      { label: 'Ask about the boats', check: { attr: 'cha', diff: 5 },
        success: () => { xp(12); journal('The Angler', 'An old man fishing off the pier says the last boats left for the coast in spring, and none came back for the rest. He stays because the fish still bite.'); return '"Left in spring. None came back." He nods at a hull with fuel aboard: ' + give('fuel', 2) + '.'; },
        fail: () => '"Ask the fish." He does not look up again.' },
      { label: 'Leave him be', success: () => 'You leave him to the gulls and the slow black water.' },
    ],
  },

  // the Flooded Quarter: rooftops over water, plank walkways, boats
  {
    id: 'flood_roof', title: 'Roof Island', where: ['flooded'], weight: 22,
    who: 'Woman on the roof',
    text: 'A woman stands on a sunken roof, swinging an oar at grey hands. "They come up the gutters!"',
    play: { type: 'rescue', foes: ['walker', 'walker', 'bloater'], who: 'Woman on the roof',
      onWin: () => { recruit({ name: pick(['Nell', 'Bea', 'Ottilie', 'Hester']), trait: 'brave', skills: { scav: 3, combat: 2 } }); xp(18); return 'She wades down, oar on her shoulder. "Lead on. I\'m done with roofs."'; },
      onLose: () => { addMorale(-8); return 'The oar snaps. The brown water closes over the slates.'; } },
  },
  {
    id: 'flood_boat', title: 'The Rowing Boat', where: ['flooded'], weight: 20, night: false,
    text: 'A rowing boat knocks at a bedroom window. Across the flood, a chemist\'s sign clears the water.',
    play: { type: 'race', time: 40, foes: ['walker', 'bloater'],
      onWin: () => { xp(14); return 'You row hard and tie up at the sign. Upstairs, dry shelves: ' + list(give('bandage', 2), give('painkillers', 1), chance(0.3) && give('antibiotics', 1)) + '.'; },
      onLose: () => { setStatus('sick', 2); return 'Hands grab the oars. You go over the side and wade back, retching.'; } },
  },
  {
    id: 'flood_planks', title: 'Plank Walkway', where: ['flooded'], weight: 20,
    text: 'The plank walkway between the sunken houses sags under you. Nails pop. The water below is moving.',
    play: { type: 'dodge', waves: 3, dmg: [4, 9],
      onWin: () => { xp(10); return 'You make the far porch. A drowned man\'s bag hangs on the rail: ' + list(give('cloth', 2), give('canned', 1)) + '.'; },
      onLose: () => { setStatus('sick', 3); return 'You go in to the waist. It tastes of drains, and worse.'; } },
  },
  {
    id: 'flood_raft', title: 'The Raft', where: ['flooded'], weight: 18,
    who: 'Man on a raft',
    text: 'A man poles a raft of doors past, his daughter bailing with a saucepan. "Dry ground? Where?"',
    choices: [
      { label: 'Send them to the bunker', success: () => { recruit({ name: pick(['Hal', 'Ivo', 'Cormac']), trait: 'hardworker', skills: { farm: 3, build: 2 } }); recruit({ name: 'Dot', trait: 'cheerful', skills: { scav: 1 } }); addMorale(5); xp(10); return 'By dusk they are at your hatch, soaked. She has kept the saucepan.'; } },
      { label: 'Point them north', success: () => { xp(5); return '"Haven?" He says it like a prayer and poles away into the mist.'; } },
      { label: 'Trade for his catch', req: () => has('cigs', 2) || has('snack'), reqText: 'Needs 2 cigarettes or a snack',
        success: () => { if (!take('cigs', 2)) take('snack', 1); return 'He hands over a string of eels without haggling. ' + give('rawmeat', 2) + '.'; } },
    ],
  },

  // Elm Row: family homes, garages, the dogs people left behind
  {
    id: 'elm_garage', title: 'The Shut Garage', where: ['garage', 'suburbs'], weight: 24,
    text: 'A garage at the end of a drive, door rusted shut. Through the gap, a car under a dust sheet.',
    play: { type: 'lock', mode: 'pry', diff: 4,
      onWin: () => { xp(10); return 'The door shrieks up. The tank was nearly full: ' + list(give('fuel', 3), chance(0.4) && give('hose', 1)) + '.'; },
      onLose: () => 'The door jams halfway with a bang that rolls the length of Elm Row.' },
  },
  {
    id: 'elm_kids_room', title: 'Glow Stars', where: ['house', 'suburbs'], weight: 22, once: true,
    text: 'Glow stars on a child\'s ceiling, a rabbit on the pillow. A note: "Gone to Gran\'s. Love, Mum."',
    choices: [
      { label: 'Take the bedside torch', success: () => 'The torch is dead, but the drawer is not empty. ' + give('batteries', 2) + '.' },
      { label: 'Take the rabbit home', success: () => { setFlag('rabbit_home', true); addMorale(6); return 'A threadbare rabbit for the bunker. Somebody there will need it more than you.'; } },
      { label: 'Close the door', success: () => { addMorale(2); return 'You pull the door to, gently. Some rooms should stay as they were left.'; } },
    ],
  },
  {
    id: 'elm_pack', title: 'Family Dogs', where: ['suburbs'], weight: 18, minDay: 2,
    text: 'Dogs pour over a garden fence, collars on, tags jingling. One still trails its lead. None of them bark.',
    play: { type: 'horde', foes: ['zdog', 'zdog', 'zdog'],
      onWin: () => { addMorale(-2); return 'The last tag reads BUSTER. You don\'t read the others. ' + give('rawmeat', 1) + '.'; },
      onLose: () => { sore(5, 'a dog bite'); return 'You go over a shed roof. One of them gets your ankle first.'; } },
  },
  {
    id: 'elm_boarded', title: 'Number Fourteen', where: ['suburbs', 'house'], weight: 22, minDay: 2, once: true,
    who: 'Voice behind the boards',
    text: 'Every window of number 14 is boarded. A crossbow bolt thuds into the gatepost. "Far enough."',
    choices: [
      { label: 'Offer a trade', req: () => has('canned') || has('bandage'), reqText: 'Needs food or a bandage',
        success: () => { if (!take('bandage', 1)) take('canned', 1); xp(8); return 'A bucket comes down on a rope. You fill it. It comes back with ' + list(give('bolts', 4), give('veg', 2)) + '.'; } },
      { label: 'Ask how many inside', check: { attr: 'cha', diff: 6 },
        success: () => { setFlag('elm_fourteen', true); xp(12); addMorale(3); return '"Four. Two are kids." A pause. "Bring news of Haven and we\'ll talk."'; },
        fail: () => 'The next bolt lands closer. You take the hint.' },
      { label: 'Back away', success: () => 'You raise your hands and back off. The boards watch you all the way down the road.' },
    ],
  },

  // Kessler Woods: snares, the packs, the old campsite, the ranger's stores
  {
    id: 'woods_snare', title: 'Caught in a Snare', where: ['forest', 'ranger'], weight: 22,
    who: 'Trapper',
    text: 'A trapper hangs by one ankle from his own snare. The dead are coming up the bank towards him.',
    play: { type: 'rescue', foes: ['walker', 'zdog', 'walker'], who: 'Trapper',
      onWin: () => { recruit({ name: pick(['Aldous', 'Wren', 'Sully']), trait: 'scavenger', skills: { scav: 4, farm: 2 } }); xp(18); return 'You cut him down. "Thirty years setting those. First time I\'ve caught me." He comes home.'; },
      onLose: () => { addMorale(-7); return 'The line holds. He doesn\'t.'; } },
  },
  {
    id: 'woods_pack', title: 'Grey Shapes', where: ['forest', 'ranger'], weight: 22, night: true,
    text: 'Low shapes flow between the pines, quick and silent. Not wolves. Dogs, once, hunting as a pack now.',
    play: { type: 'horde', foes: ['zdog', 'zdog', 'zdog', 'zdog'],
      onWin: () => { xp(16); return 'Four still shapes on the needles. ' + give('rawmeat', 2) + ', if you are hungry enough.'; },
      onLose: () => { sore(6, 'a dog bite'); tire(10); return 'You put a stream between you and them. They keep pace along the bank.'; } },
  },
  {
    id: 'woods_campfire', title: 'Still Warm', where: ['forest'], weight: 22,
    text: 'A campfire in a clearing, still warm. Two tins on a flat stone. Boot prints heading north.',
    choices: [
      { label: 'Wait by the fire', success: () => { passTime(1); rest(15); if (chance(0.5)) { recruit({ trait: 'quiet', skills: { scav: 3 } }); return 'A woman comes back for her tins and finds you warming your hands. She stays.'; } return 'An hour of warmth. Nobody comes back. You take the tins: ' + give('canned', 2) + '.'; } },
      { label: 'Take the tins', success: () => { addMorale(-2); return 'You pocket ' + give('canned', 2) + ' and kick dirt on the fire. Someone goes hungry tonight.'; } },
      { label: 'Leave a tin of yours', req: () => has('canned'), reqText: 'Needs canned food',
        success: () => { take('canned', 1); setFlag('camp_gift', true); addMorale(5); xp(8); return 'Three tins on the stone now. You walk on lighter.'; } },
    ],
  },
  {
    id: 'ranger_cabinet', title: 'The Ranger\'s Cabinet', where: ['ranger', 'forest'], weight: 22, once: true,
    text: 'A ranger\'s gun cabinet, chained and hidden under the pines. Someone meant to come back for it.',
    play: { type: 'lock', mode: 'pick', diff: 6,
      onWin: () => { xp(20); return 'The padlock drops into the needles. Inside: ' + list(give('bolts', 6), chance(0.35) ? give('crossbow', 1) : give('ammo', 4), give('bandage', 1)) + '.'; },
      onLose: () => 'The pick snaps in the rust. The cabinet keeps whatever the ranger left.' },
  },

  // the Northern Pass: snow, the cold, the wrecked convoy
  {
    id: 'pass_avalanche', title: 'The Slope Lets Go', where: ['pass'], weight: 22,
    text: 'A crack like a rifle shot up the slope. The snow above the road breaks into slabs and starts to slide.',
    play: { type: 'dodge', waves: 4, dmg: [6, 12],
      onWin: () => { xp(14); return 'The roar stops. It has torn open a buried truck cab: ' + list(give('canned', 2), give('fuel', 1)) + '.'; },
      onLose: () => { tire(15); passTime(1); return 'You dig yourself out with hands you can\'t feel. It takes an hour.'; } },
  },
  {
    id: 'pass_tailgate', title: 'Frozen Tailgate', where: ['pass'], weight: 22,
    text: 'An army truck in the wrecked convoy, tailgate frozen shut. Crates inside: RATIONS. MEDICAL.',
    play: { type: 'lock', mode: 'pry', diff: 5,
      onWin: () => { xp(18); return 'The ice cracks and the tailgate drops. ' + list(give('medkit', 1), give('canned', 2), give('ammo', 4)) + '.'; },
      onLose: () => 'The bar skids off the ice. The clang rings down the whole valley.' },
  },
  {
    id: 'pass_left_behind', title: 'Left Behind', where: ['pass'], weight: 22, once: true,
    who: 'Man in the snow',
    text: 'A man sits against a dead truck, no coat, lips blue. "Convoy left me. Said I\'d slow them down."',
    choices: [
      { label: 'Give him your coat', req: () => has('coat'), reqText: 'Needs a Winter Coat',
        success: () => { take('coat', 1); recruit({ name: 'Piet', trait: 'loyal', skills: { combat: 3, build: 2 } }); addMorale(6); xp(15); return 'He shrugs it on and stands. "I\'ll carry my weight." Your teeth start to chatter.'; } },
      { label: 'Light him a fire', req: () => has('wood', 2), reqText: 'Needs 2 Wood',
        success: () => { take('wood', 2); passTime(1); recruit({ name: 'Piet', trait: 'loyal', skills: { combat: 3, build: 2 } }); xp(12); return 'An hour over a spitting fire. He gets up slowly, but he gets up.'; } },
      { label: 'Take his boots', success: () => { addMorale(-8); return 'He doesn\'t argue. He hasn\'t the strength. ' + give('boots', 1) + '.'; } },
      { label: 'Walk on', success: () => { addMorale(-3); return 'When you look back, the snow has already started on him.'; } },
    ],
  },
  {
    id: 'pass_whiteout', title: 'Whiteout', where: ['pass'], weight: 18,
    text: 'Snow blows sideways and the road is gone. A huge shape walks out of the white, two quick ones behind.',
    play: { type: 'horde', foes: ['brute', 'runner', 'runner'],
      onWin: () => { xp(20); return 'They go down in the drifts. The big one wore an army greatcoat: ' + list(give('ammo', 3), chance(0.3) && give('coat', 1)) + '.'; },
      onLose: () => { tire(15); return 'You lose them in the white. You nearly lose yourself as well.'; } },
  },
];
})();
