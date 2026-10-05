// Dead Embers: outdoor random encounters
// Physical things are played (`play`, text = one banner line). Real decisions keep short `choices`. See API.md §1.
(function () {
  const FG = (ids, opts) => { fight(ids, opts); return true; };
window.ENCOUNTERS = [
  {
    id: 'walker_pack', title: 'Shufflers in the Road', where: ['travel', 'street'], weight: 18,
    text: 'Three of the dead drift across the road ahead. They have not seen you yet.',
    play: { type: 'horde', foes: ['walker', 'walker', 'walker'],
      onWin: () => 'You go through their pockets. ' + give('cloth', 1) + '.',
      onLose: () => 'You leave them the road.' },
  },
  {
    id: 'lone_runner', title: 'Fast One', where: ['travel', 'street', 'depot'], weight: 12, minDay: 2,
    text: 'Bare feet slap the asphalt. A fresh one sprints out of an alley, jaw hanging wide.',
    play: { type: 'horde', foes: ['runner'],
      onWin: () => 'It twitches once and goes still. ' + give('snack', 1) + ' in its coat.',
      onLose: () => { tire(15); return 'You lose it in the alleys, lungs burning.'; } },
  },
  {
    id: 'bloater_corridor', title: 'The Swollen One', where: ['apartments', 'hospital', 'supermarket', 'factory'], weight: 10, minDay: 3,
    text: 'A swollen corpse blocks the stairwell, tight as a drum. Do not pop it up close.',
    play: { type: 'horde', foes: ['bloater'],
      onWin: () => 'The air clears slowly. ' + give('scrap', 1) + ' in the rubble.',
      onLose: () => 'You back down the stairs. It can keep the floor.' },
  },
  {
    id: 'screamer_cry', title: 'The Screaming Girl', where: ['travel', 'street', 'apartments', 'police'], weight: 10, minDay: 3,
    text: 'A thin figure in a torn dress, mouth stretching wide. Kill it before it screams.',
    play: { type: 'screamer', time: 6, extra: ['walker', 'walker', 'walker'],
      onWin: () => { xp(15); return 'The scream chokes off. Silence comes back.'; },
      onLose: () => { addNoise(3); return 'The scream tears down the street. Doors bang open.'; } },
  },
  {
    id: 'brute_block', title: 'The Wall of Meat', where: ['travel', 'street', 'depot', 'factory'], weight: 8, minDay: 4,
    text: 'A huge corpse in a hi-vis vest fills the gap between two wrecks. It turns toward you.',
    play: { type: 'horde', foes: ['brute'],
      onWin: () => 'It finally topples. ' + give('scrap', 2) + ', ' + give('parts', 1) + ' from its toolbelt.',
      onLose: () => 'You take the long way round. It does not follow.' },
  },
  {
    id: 'zdog_pack', title: 'Hounds', where: ['travel', 'street', 'farm', 'forest'], weight: 11, minDay: 2,
    text: 'Three grey dogs slip out of the hedge, eyes clouded red. They do not bark.',
    play: { type: 'horde', foes: ['zdog', 'zdog', 'zdog'],
      onWin: () => 'The last one stops twitching. ' + give('rawmeat', 1) + '. You may not want to eat it.',
      onLose: () => 'You get a wall between you and the pack.' },
  },
  {
    id: 'surrounded_survivor', title: 'Cornered', where: ['travel', 'street', 'supermarket', 'gas'], weight: 9, who: 'Stranger',
    text: 'A man with a tire iron is backed against a truck, the dead closing in. "Help me!"',
    play: { type: 'rescue', foes: ['walker', 'walker', 'walker', 'walker'], who: 'Stranger',
      onWin: () => {
        const s = recruit({ name: pick(['Daniel', 'Ruben', 'Teo', 'Hollis']), trait: 'grateful', skills: { combat: 3, scav: 2 } });
        xp(20);
        return s.name + ' drops the tire iron, gasping thanks. He follows you home.';
      },
      onLose: () => { addMorale(-8); return 'They drag him down. You carry his cries for the rest of the day.'; } },
  },
  {
    id: 'bitten_stranger', title: 'A Mercy Asked', where: ['travel', 'street', 'apartments', 'hospital'], weight: 8, who: 'Bitten woman',
    text: 'A woman sits in a doorway, her forearm bandage soaked black. "Help me, or finish it quickly."',
    choices: [
      { label: 'Give her antibiotics', req: () => has('antibiotics'), reqText: 'Needs antibiotics',
        success: () => { take('antibiotics', 1); xp(15); addMorale(5); return chance(0.25) ? 'Against all odds, her fever breaks. She presses ' + give('canned', 2) + ' into your hands.' : 'She thanks you. It does not work, but she is not afraid at the end.'; } },
      { label: 'Grant her mercy', success: () => { addMorale(-6); xp(8); return 'You do it fast. She whispers thanks. Her pack holds ' + give('bandage', 1) + ', ' + give('cigs', 2) + '.'; } },
      { label: 'Leave her be', success: () => { addMorale(-3); return 'You leave her with her water bottle. Behind you, she starts to hum.'; } },
    ],
  },
  {
    id: 'wounded_stranger', title: 'Wounded Man', where: ['travel', 'street', 'forest', 'farm'], weight: 9, who: 'Wounded man',
    text: 'A man with a gashed thigh slumps against a fence post. The dead have his scent.',
    play: { type: 'rescue', foes: ['walker', 'walker'], who: 'Wounded man',
      onWin: () => {
        const b = take('bandage', 1); xp(12);
        recruit({ trait: 'loyal', skills: { combat: 2, scav: 2 } });
        return (b ? 'You bandage his leg. ' : 'You bind his leg with his own belt. ') + 'He has nowhere to go, so he comes with you.';
      },
      onLose: () => { addMorale(-5); return 'You were too late for him.'; } },
  },
  {
    id: 'lost_kids', title: 'Two Small Faces', where: ['travel', 'street', 'apartments', 'supermarket'], weight: 6, minDay: 2,
    text: 'Two kids, maybe nine and twelve, hide behind a bus shelter. They have not eaten in days.',
    choices: [
      { label: 'Share your food', req: () => has('canned') || has('snack'), reqText: 'Needs food',
        success: () => { if (!take('snack', 1)) take('canned', 1); xp(15); addMorale(8); recruit({ name: 'Mina', trait: 'scared', skills: { scav: 1 } }); return 'They eat in silence. Mina, the older one, asks to come with you. You cannot say no.'; } },
      { label: 'Talk them into following you', check: { attr: 'cha', diff: 5 },
        success: () => { xp(10); recruit({ name: 'Jonah', trait: 'quiet', skills: { scav: 1 } }); return 'You crouch and offer your hand. After a long moment, Jonah takes it.'; },
        fail: () => 'They bolt through a gap in the fence. You do not chase them.' },
      { label: 'Leave them', success: () => { addMorale(-10); return 'You walk away. Their faces follow you all the way home.'; } },
    ],
  },
  {
    id: 'hospital_doctor', title: 'The Hidden Doctor', where: ['hospital'], weight: 10, once: true, minDay: 2, who: 'Doctor',
    text: 'A shotgun clicks behind a barricaded door. A tired woman in a stained coat: "What do you want?"',
    choices: [
      { label: 'Offer her a place at the shelter', check: { attr: 'cha', diff: 5 },
        success: () => { xp(25); recruit({ name: 'Dr. Imara Voss', trait: 'steady', skills: { med: 5, scav: 1 } }); return 'She picks up a worn medical bag. Your shelter just got a doctor.'; },
        fail: () => '"I have seen what people do." The bolts slide shut.' },
      { label: 'Trade 2 cans for medicine', req: () => has('canned', 2), reqText: 'Needs 2 Canned Food',
        success: () => { take('canned', 2); xp(8); return 'She passes out ' + give('medkit', 1) + ', ' + give('antibiotics', 1) + '. She takes the cans without a smile.'; } },
      { label: 'Apologize and leave', success: () => 'You back out of the ward. Her door stays shut.' },
    ],
  },
  {
    id: 'raider_ambush', title: 'Ambush', where: ['travel', 'street', 'depot', 'factory', 'tollcamp'], weight: 12, minDay: 2, who: 'Raider',
    text: 'Cans rattle on a trip wire. Three men in riot gear step out, grinning. "Everything you got."',
    choices: [
      { label: 'Refuse. Make them take it.',
        success: () => FG(['raider', 'raider', 'raider'], { onWin: () => 'Their packs hold ' + give('ammo', 3) + ', ' + give('canned', 1) + ', ' + give('cigs', 3) + '.' }) && '"Wrong answer." They spread out.' },
      { label: 'Drop the Warden\'s name', check: { attr: 'cha', diff: 6 },
        success: () => { xp(15); return 'You hint at a deal with the Warden. They trade looks and step aside.'; },
        fail: () => { const c = has('cigs', 2) ? (take('cigs', 2), '2 Cigarettes') : 'your pocket change'; hurt(8, 'a beating'); return 'They do not care. They take ' + c + ' and leave you bruised in the dirt.'; } },
      { label: 'Run for it', check: { attr: 'agi', diff: 6 },
        success: () => { tire(10); return 'You cut down a side street. Their shouts fade behind you.'; },
        fail: () => { hurt(10, 'raider gunfire'); return 'A shot clips your leg. You limp away alive, mostly.'; } },
    ],
  },
  {
    id: 'toll_collector', title: 'The Toll', where: ['travel', 'street', 'tollcamp'], weight: 12, who: 'Tollman',
    text: 'A rope across the road, a sign that says TOLL. "Warden says everyone pays to walk his roads."',
    choices: [
      { label: 'Pay the toll', success: () => { if (take('cigs', 3)) return 'Three cigarettes. They wave you through with mock courtesy.'; if (take('canned', 1)) return 'No cigarettes, so a can of food. They wave you through, sneering.'; hurt(5, 'a tollman beating'); return 'You have nothing worth taking, so they take some skin instead.'; } },
      { label: 'Talk down the price', check: { attr: 'cha', diff: 5 },
        success: () => { xp(12); return 'A tired smile and the Warden\'s own words. They wave you through for free.'; },
        fail: () => { take('cigs', 3); return 'They laugh. The price just went up, and they take your cigarettes.'; } },
      { label: 'Refuse to pay',
        success: () => FG(['tollman', 'tollman'], { onWin: () => 'Their toll box holds ' + give('cigs', 4) + ', ' + give('ammo', 2) + '.' }) && 'The bat comes up. "Wrong answer."' },
    ],
  },
  {
    id: 'wandering_trader', title: 'Peddler on the Road', where: ['travel', 'street', 'farm'], weight: 9, night: false, who: 'Peddler',
    text: 'A man with a hand cart and a shotgun on his knees raises one palm. "Trade? No tricks."',
    play: { type: 'barter',
      onWin: () => { xp(5); return 'He packs up and tells you which blocks are crawling.'; },
      onLose: () => '' },
  },
  {
    id: 'radio_hermit', title: 'The Hermit with the Dials', where: ['radiotower', 'electronics', 'travel'], weight: 8, once: true, who: 'The Hermit',
    cond: () => !flag('got_coil'),
    text: 'A thin man in a headset sits among dials. "Haven\'s broadcast never changes. Not one word. Is that a person?"',
    choices: [
      { label: 'Ask him about the broadcast', check: { attr: 'int', diff: 5 },
        success: () => { journal('The Hermit\'s Theory', 'The hermit says Haven\'s broadcast loops every 41 minutes with identical pauses. He thinks it is a recording left by someone who is no longer there. He was kind enough to give me a radio coil to tune my own set.'); setFlag('got_coil', true); xp(20); return 'You trade theories for an hour. Then he hands you a part. ' + give('radio_coil', 1) + '.'; },
        fail: () => { journal('The Hermit\'s Theory', 'The hermit talks about Haven\'s signal without end. I follow little of it, but he insists the broadcast is not what it seems.'); return 'He talks until your head hurts. The broadcast loops, and he does not trust it.'; } },
      { label: 'Trade food for batteries', req: () => has('snack') || has('canned'), reqText: 'Needs food',
        success: () => { if (!take('snack', 1)) take('canned', 1); return 'He swaps you a dusty pair. ' + give('batteries', 2) + '.'; } },
      { label: 'Move on', success: () => 'You leave him to his dials. The static follows you.' },
    ],
  },
  {
    id: 'hidden_stash', title: 'Loose Brick', where: ['any'], weight: 12,
    text: 'A brick sits out of line in the alley wall, scratched around the edges. Pry it loose.',
    play: { type: 'lock', mode: 'pry', diff: 3,
      onWin: () => { xp(10); return 'A coffee tin: ' + give('canned', 1) + ', ' + give('ammo', 3) + ', ' + give('cigs', 2) + '.'; },
      onLose: () => { addNoise(2); return 'The wall crumbles loudly. Just ' + give('cloth', 1) + ' and dust.'; } },
  },
  {
    id: 'collapsing_floor', title: 'Rotten Boards', where: ['apartments', 'factory', 'supermarket', 'depot'], weight: 9,
    text: 'Crates of dry goods on a rotten walkway. The boards sag. Watch where they give way.',
    play: { type: 'dodge', waves: 4, dmg: [6, 12],
      onWin: () => { xp(10); return 'You reach the crates. ' + give('canned', 2) + ', ' + give('parts', 1) + ', ' + give('wood', 2) + '.'; },
      onLose: () => { addNoise(2); return 'The floor gives way. You claw out with nothing.'; } },
  },
  {
    id: 'locked_safe', title: 'The Safe', where: ['police', 'apartments', 'supermarket', 'electronics', 'gas'], weight: 8,
    text: 'A steel safe in the back office, keypad cracked. Someone thought this mattered.',
    play: { type: 'lock', mode: 'pick', diff: 6,
      onWin: () => { xp(20); return 'The door clicks open. ' + give('ammo', 5) + ', ' + give('cigs', 4) + ', ' + give('batteries', 2) + '.'; },
      onLose: () => { addNoise(3); return 'The keypad locks and shrieks. Time to go.'; } },
  },
  {
    id: 'abandoned_car', title: 'Abandoned Sedan', where: ['travel', 'street', 'gas', 'depot'], weight: 14,
    text: 'A sedan on the curb, hood ajar. The engine still has parts worth tearing out.',
    play: { type: 'lock', mode: 'pry', diff: 5,
      onWin: () => { addNoise(1); xp(8); return 'You wrench the engine apart. ' + give('engine_parts', 1) + ', ' + give('parts', 2) + '.'; },
      onLose: () => { hurt(5, 'a scraped knuckle'); return 'A bolt will not turn. The trunk gives up ' + give('cloth', 1) + '.'; } },
  },
  {
    id: 'acid_rain', title: 'Ash Rain', where: ['travel', 'street', 'farm', 'forest', 'river'], weight: 9,
    text: 'Ash falls, then a rain that stings. Stay out of the worst of it until you reach cover.',
    play: { type: 'dodge', waves: 3, dmg: [4, 8],
      onWin: () => { xp(8); return 'You reach clear air, skin stinging.'; },
      onLose: () => { setStatus('sick', 4); return 'The rain gets in your eyes and lungs. You find cover, shaking.'; } },
  },
  {
    id: 'supply_drop', title: 'Fallen Crate', where: ['military'], weight: 10, minDay: 3,
    text: 'An army crate on a dead parachute, seal intact. Get it open before the dead close in.',
    play: { type: 'race', time: 40, foes: ['walker', 'walker', 'runner'],
      onWin: () => { xp(20); return 'You cut the trip wire and lift the lid. ' + give('ammo', 6) + ', ' + give('medkit', 1) + ', ' + give('canned', 3) + '.'; },
      onLose: () => { addNoise(2); return 'Too slow. The yard is crawling now. You back off.'; } },
  },
  {
    id: 'gas_siphon', title: 'The Last Pump', where: ['gas'], weight: 12,
    text: 'A rusty hand pump might still reach the tanks. Work it before the walkers notice.',
    play: { type: 'race', time: 30, foes: ['walker', 'walker'],
      onWin: () => { addNoise(1); xp(8); return 'Fuel gurgles up. ' + give('fuel', 3) + '.'; },
      onLose: () => 'You get ' + give('fuel', 1) + ' before you have to run.' },
  },
  {
    id: 'river_fishing', title: 'Slow Water', where: ['river'], weight: 12, night: false,
    text: 'The river runs slow and brown. Fat silver shapes flicker in the shallows.',
    choices: [
      { label: 'Fish with a line for a while', check: { attr: 'per', diff: 4 },
        success: () => { xp(8); return 'The line jerks. ' + give('meal', 1) + ' once cooked, and ' + give('rawmeat', 1) + '.'; },
        fail: () => 'Three hours, not one bite. The fish are smarter than you.' },
      { label: 'Wade in and grab one', check: { attr: 'agi', diff: 6 },
        success: () => { xp(12); return 'You snatch one bare-handed. ' + give('rawmeat', 2) + '.'; },
        fail: () => { setStatus('sick', 3); return 'You slip and swallow river. You crawl out gagging.'; } },
      { label: 'Just fill your bottles', success: () => 'Boil it before you drink it. ' + give('dirtywater', 2) + '.' },
    ],
  },
  {
    id: 'forest_snare', title: 'Tracks in the Mud', where: ['forest', 'farm'], weight: 12, night: false,
    text: 'Fresh deer tracks in the mud. Follow them and take it before it bolts.',
    play: { type: 'race', time: 35,
      onWin: () => { xp(12); return 'One clean blow. ' + give('rawmeat', 3) + '.'; },
      onLose: () => 'The deer is gone. You dig up ' + give('veg', 1) + ' instead.' },
  },
  {
    id: 'pharmacy_shelf', title: 'Back of the Pharmacy', where: ['apartments'], weight: 8,
    text: 'Behind the picked-clean counter, a roll shutter hides the stockroom. Pry it up.',
    play: { type: 'lock', mode: 'pry', diff: 4,
      onWin: () => { xp(10); return 'Untouched shelves. ' + give('painkillers', 2) + ', ' + give('bandage', 2) + ', ' + give('antibiotics', 1) + '.'; },
      onLose: () => { addNoise(2); return 'The shutter shrieks and holds. A drawer gives up ' + give('bandage', 1) + '.'; } },
  },
  {
    id: 'corpse_pile', title: 'The Pile', where: ['travel', 'street', 'hospital', 'depot'], weight: 9,
    text: 'A heap of bodies behind a fence. Flies hum. Two of them are not done moving.',
    play: { type: 'horde', foes: ['walker', 'walker'],
      onWin: () => { xp(8); return 'Now the pile is still. ' + give('cigs', 2) + ', ' + give('cloth', 1) + ', ' + give('bandage', 1) + '.'; },
      onLose: () => 'You cross the road and do not look back.' },
  },
  {
    id: 'church_bell', title: 'The Bell', where: ['travel', 'street', 'apartments'], weight: 7, minDay: 2,
    text: 'Food on a church altar, the bell rope tied off too neatly. Grab it before the bell rings.',
    play: { type: 'race', time: 20,
      onWin: () => { xp(15); return 'You cut the rope and clear the altar. ' + give('canned', 3) + ', ' + give('cigs', 2) + '.'; },
      onLose: () => { addNoise(3); fight(['walker', 'walker', 'walker']); return 'The bell clangs. Every dead thing nearby turns your way.'; } },
  },
  {
    id: 'mirror_message', title: 'Writing on the Mirror', where: ['apartments', 'hospital', 'police', 'electronics'], weight: 6, once: true,
    text: 'Lipstick on a bathroom mirror: HAVEN IS A LIE? Whoever wrote it left in a hurry.',
    choices: [
      { label: 'Search the room for clues', check: { attr: 'int', diff: 5 },
        success: () => { journal('A Message in Lipstick', 'In an empty bathroom someone wrote HAVEN IS A LIE? on the mirror. In the cabinet I found a torn note: "No convoys came back from the north pass." I do not know what to believe.'); xp(18); return 'A torn note behind the cabinet, and ' + give('canned', 1) + '. The note is not good news.'; },
        fail: () => { journal('A Message in Lipstick', 'In an empty bathroom someone wrote HAVEN IS A LIE? on the mirror. I found nothing else.'); return 'You tear the room apart. Only the mirror, and the question.'; } },
      { label: 'Wipe it away', success: () => { addMorale(1); return 'Some doubts are better not fed. You wipe it with your sleeve.'; } },
      { label: 'Write your own reply', success: () => { xp(5); journal('A Message in Lipstick', 'I saw a message on a mirror asking if Haven is a lie. I wrote YES under it, just in case someone else comes looking.'); return 'You write YES beneath it. Comforting or terrifying, depending who reads it.'; } },
    ],
  },
  {
    id: 'horde_edge', title: 'The Edge of a Horde', where: ['travel', 'street'], weight: 6, minDay: 6, night: true,
    text: 'A river of the dead flows down the street in the dark. Stragglers break off toward you.',
    play: { type: 'horde', foes: ['walker', 'walker', 'walker', 'runner'],
      onWin: () => { xp(20); return 'The stragglers are down. The column moves on without you.'; },
      onLose: () => { addNoise(2); return 'You run until the murmur fades behind you.'; } },
  },
  {
    id: 'night_stalkers', title: 'Eyes in the Dark', where: ['travel', 'street', 'farm', 'forest'], weight: 9, night: true,
    text: 'Shapes drift at the edge of your light, too deliberate to be wind. One turns its head.',
    play: { type: 'horde', foes: ['walker', 'walker', 'runner'],
      onWin: () => 'They lie still in the dirt. ' + give('cloth', 1) + '.',
      onLose: () => { tire(8); return 'You backtrack in the dark, hands out. They do not follow.'; } },
  },
  {
    id: 'farm_scarecrows', title: 'Field of Scarecrows', where: ['farm'], weight: 7,
    text: 'Scarecrows in a rotten field. The barn behind them smells of food, and something shuffles inside.',
    play: { type: 'horde', foes: ['walker', 'walker'],
      onWin: () => { xp(10); return 'The barn is yours. ' + give('veg', 2) + ', ' + give('canned', 1) + ', ' + give('wood', 2) + '.'; },
      onLose: () => 'You stay out of the rows. Not everything in a field is a scarecrow.' },
  },
];
})();
