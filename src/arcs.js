// Dead Embers: multi-part character arcs (each part fires once, chained by flags).
// Short lines with a speaker; physical steps are played (`play`), moral calls stay `choices`.
(function () {
  const FG = (ids, opts) => { fight(ids, opts); return true; };
  const later = (k, n) => G.day >= (Number(flag(k)) || 0) + n;
  const mark = (k) => { setFlag(k, true); setFlag(k + '_day', G.day); };
  const myWeapon = () => ['knife', 'pipe', 'bat', 'machete', 'axe', 'crossbow', 'pistol', 'shotgun'].find(w => has(w));
  const sore = (n, cause) => hurt(Math.max(0, Math.min(n, G.p.hp - 10)), cause);
  const list = (...xs) => xs.filter(Boolean).join(', ');

  window.ARC_ENCOUNTERS = [
    // ---------- 1. ELI ----------
    {
      id: 'eli_1', title: 'Small Footsteps', where: ['apartments'], weight: 30, once: true,
      cond: () => !flag('eli_1'),
      text: 'You set your pack down for a minute. A can is gone. Something small and fast clatters up the stairwell.',
      choices: [
        { label: 'Chase the thief', check: { attr: 'agi', diff: 5 },
          success: () => { mark('eli_1'); setFlag('eli_scared', true); xp(8); return 'A boy of ten, all elbows, clutching your can. He sees your face and vanishes into the wall.'; },
          fail: () => { mark('eli_1'); tire(6); return 'You lose him in the corridors. Behind a door, someone breathes fast and quiet.'; } },
        { label: 'Let it go and watch', success: () => { mark('eli_1'); xp(6); return 'Wide eyes in a vent. A boy, no older than ten. The vent clatters shut as you leave.'; } },
        { label: 'Leave a snack and a note', req: () => has('snack'), reqText: 'Needs a snack bar',
          success: () => { take('snack', 1); mark('eli_1'); setFlag('eli_trust', true); xp(8); return '"I won\'t hurt you." Later the snack is gone. In its place, a chalk stick figure in a hat.'; } },
      ],
    },
    {
      id: 'eli_2', title: 'The Boy in the Vents', where: ['apartments'], weight: 32, once: true,
      cond: () => flag('eli_1') && !flag('eli_2') && later('eli_1_day', 1),
      text: 'A paper cup and a bent spoon on the landing: a tiny trap. A floorboard creaks above. He knows you\'re here.',
      choices: [
        { label: 'Leave a can, walk away', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'Halfway down you hear a door click, then a can being opened.'; } },
        { label: 'Corner him', check: { attr: 'agi', diff: 6 },
          success: () => { mark('eli_2'); setFlag('eli_scared', true); xp(8); return 'You catch his collar. He kicks, bites, says nothing. Then he\'s smoke. He won\'t forget.'; },
          fail: () => { mark('eli_2'); setFlag('eli_scared', true); sore(4, 'a fall on the stairs'); return 'A rotten step gives. A small dry laugh from above. The trap was a good one.'; } },
        { label: 'Sit down and wait', check: { attr: 'cha', diff: 4 },
          success: () => { mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'An hour of talking about nothing. Then a small voice from the dark: "Eli."'; },
          fail: () => { mark('eli_2'); passTime(1); return 'An hour. Nothing answers. You stand, stiff, and go.'; } },
      ],
    },
    {
      id: 'eli_3', title: 'A Name and a Choice', where: ['apartments'], weight: 34, once: true,
      cond: () => flag('eli_2') && !flag('eli_3') && later('eli_2_day', 1),
      who: 'Eli',
      text: () => flag('eli_trust')
        ? '"Is it warm where you live?" He holds out the empty can like a ticket. His coat is buttoned wrong.'
        : '"I packed a bag. Doesn\'t mean I trust you." He looks at you, then at the door.',
      choices: [
        { label: 'Offer your hand', req: () => !!flag('eli_trust'), reqText: 'He must trust you first',
          success: () => { mark('eli_3'); recruit({ name: 'Eli', trait: 'quiet', skills: { farm: 1, scav: 4, build: 1, med: 1, combat: 1 } }); setFlag('eli_joined', true); xp(25); addMorale(8); return '"I know all the vents," he says. The most he\'s said in a year.'; } },
        { label: 'Coax him with food', req: () => !flag('eli_trust'), reqText: 'He already trusts you',
          check: { attr: 'cha', diff: 7 },
          success: () => { mark('eli_3'); recruit({ name: 'Eli', trait: 'quiet', skills: { farm: 1, scav: 4, build: 1, med: 1, combat: 1 } }); setFlag('eli_joined', true); xp(25); return 'An hour and half a can of peaches. He shrugs his bag higher and falls into step.'; },
          fail: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-5); return 'He bolts upstairs. A door slams, a bolt slides. He won\'t open for you again.'; } },
        { label: 'Leave him be', success: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-3); return 'You leave a can on the step. In the dark, a small shape watches you go.'; } },
      ],
    },
    {
      id: 'eli_4', title: 'Eli\'s Secret', where: ['shelter'], weight: 35, once: true,
      cond: () => flag('eli_joined') && !flag('eli_4') && later('eli_3_day', 2),
      who: 'Eli',
      text: '"I know something. Haven\'t told anyone." He tugs your sleeve. "Want to see?"',
      choices: [
        { label: 'Follow him to his cache', success: () => { mark('eli_4'); xp(15); return 'Drain, rooftop, ladder, a false panel. His hoard: ' + list(give('canned', 3), give('batteries', 2), give('bandage', 2)) + '. He beams.'; } },
        { label: 'Ask what he saw', success: () => { mark('eli_4'); setFlag('tollmen_secret', true); journal('What Eli Saw', 'Eli watched the Tollmen from the rooftops for months. They hide their tolls in a dry canal under the old bridge. They fear a man called Hale, and they leave their camp thinly guarded at dawn.'); xp(20); return '"They stash the tolls under the old bridge. They\'re scared of a man called Hale."'; } },
        { label: 'Tell him to rest', success: () => { mark('eli_4'); addMorale(3); return 'He shrugs, but there\'s relief in it. He\'ll tell you when he\'s ready.'; } },
      ],
    },

    // ---------- 2. DR. INES OKAFOR ----------
    {
      id: 'ines_1', title: 'The Lab Behind the Barricade', where: ['hospital'], weight: 30, once: true,
      cond: () => !flag('ines_1'),
      who: 'Dr. Okafor',
      text: '"I have a scalpel and no patience." Behind the barricade, a lab, a light, and a woman who says she has a cure.',
      choices: [
        { label: 'Talk to her calmly', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_1'); setFlag('ines_open', true); xp(15); return 'The door opens a hand wide. "Dr. Ines Okafor. I need materials. Come back."'; },
          fail: () => { mark('ines_1'); xp(5); return 'A list slides under the door: 3 chem, 2 components. "Bring them. Then we talk."'; } },
        { label: 'Pass a can under the door', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('ines_1'); setFlag('ines_open', true); xp(12); return 'A hand takes it. The door cracks. "Chemicals. Components. Please."'; } },
        { label: 'Leave her to it', success: () => { mark('ines_1'); xp(3); return 'You nod at the door and go. Behind it, glass clinks back to work.'; } },
      ],
    },
    {
      id: 'ines_2', title: 'Ines\'s List', where: ['travel', 'any'], weight: 30, once: true,
      cond: () => flag('ines_1') && !flag('ines_2') && later('ines_1_day', 1) && has('chem', 3) && has('parts', 2),
      text: 'Your pack clinks with everything Dr. Okafor asked for. The hospital is a short detour. A cure is a big bet.',
      choices: [
        { label: 'Deliver everything', success: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); xp(15); return 'She counts twice, then hugs you. "Four months since I touched another person."'; } },
        { label: 'Haggle, keep some back', check: { attr: 'cha', diff: 5 },
          success: () => { take('chem', 2); take('parts', 1); mark('ines_2'); passTime(2); xp(10); return 'She argues, then yields. She\'ll make do with less.'; },
          fail: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); return 'She sees through you, takes the lot, and shuts the door harder than needed.'; } },
        { label: 'Keep your materials', success: () => { mark('ines_2'); setFlag('ines_declined', true); return 'Chemicals are worth more as chemicals. Whatever she\'s making, she makes alone.'; } },
      ],
    },
    {
      id: 'ines_3', title: 'The Vial', where: ['hospital'], weight: 35, once: true,
      cond: () => flag('ines_2') && !flag('ines_declined') && !flag('ines_3') && later('ines_2_day', 2),
      who: 'Dr. Okafor',
      text: '"It works. On the rats, on a dog, on me. It works." One vial of clear liquid on the bench.',
      choices: [
        { label: 'Invite her to the shelter', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); recruit({ name: 'Dr. Ines Okafor', trait: 'medic', skills: { med: 5, scav: 1 } }); setFlag('ines_joined', true); xp(30); return 'She presses ' + give('serum', 1) + ' into your hand. "Show me where the sick people are."'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(20); return '"The work isn\'t done." She gives you ' + give('serum', 1) + ' and stays.'; } },
        { label: 'Let her keep working', success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(25); return '"I\'ll make more. Come back in a few days." ' + give('serum', 1) + '.'; } },
        { label: 'Study her notes', check: { attr: 'int', diff: 6 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); journal('The Okafor Formula', 'Dr. Okafor\'s serum cures early infection, not the fully turned. The key is a protein from survivors who never fell ill. She suspects Haven has the original sample, or never did.'); xp(30); return 'By dawn you understand why it works. She laughs, honestly. ' + give('serum', 1) + '.'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(15); return 'The notes are beyond you. She\'s kind about it. ' + give('serum', 1) + '.'; } },
      ],
    },
    {
      id: 'ines_4', title: 'The Doctor\'s Gift', where: ['hospital'], weight: 28, once: true,
      cond: () => flag('ines_stays') && !flag('ines_4') && later('ines_3_day', 3),
      who: 'Dr. Okafor',
      text: '"The basement drug cage. Open it and I can make antibiotics. I\'ve no hands for crowbars."',
      play: { type: 'lock', mode: 'pry', diff: 5,
        onWin: () => { mark('ines_4'); xp(12); return '"Thank you for believing me." ' + list(give('antibiotics', 2), give('bandage', 2), give('painkillers', 1)) + '.'; },
        onLose: () => { mark('ines_4'); addNoise(2); return '"Never mind. Take these and go." ' + give('antibiotics', 1) + '.'; } },
    },

    // ---------- 3. MARCUS HALE ----------
    {
      id: 'marcus_1', title: 'A Tollman in the Culvert', where: ['travel'], weight: 30, minDay: 5, once: true,
      cond: () => !flag('marcus_1'),
      who: 'Marcus Hale',
      text: '"Not here to hurt you. Marcus Hale. Tollmen lieutenant. Was." He\'s bleeding into a culvert, pistol on his knee.',
      choices: [
        { label: 'Hear him out', check: { attr: 'cha', diff: 4 },
          success: () => { mark('marcus_1'); xp(12); return '"I saw something last week I can\'t unsee. I want out." That\'s all, for now.'; },
          fail: () => { mark('marcus_1'); xp(5); return '"Come back when you know whose side you\'re on." His hand never leaves the gun.'; } },
        { label: 'Take his ammo and go', success: () => { mark('marcus_1'); setFlag('marcus_wronged', true); addMorale(-5); return 'He doesn\'t fight. ' + give('ammo', 4) + '. His eyes follow you out, tired, like he expected it.'; } },
        { label: 'Walk away', success: () => { mark('marcus_1'); setFlag('marcus_lost', true); return 'A Tollman is a Tollman. You back out of the culvert.'; } },
      ],
    },
    {
      id: 'marcus_2', title: 'The Price of a Defector', where: ['travel'], weight: 30, minDay: 5, once: true,
      cond: () => flag('marcus_1') && !flag('marcus_lost') && !flag('marcus_wronged') && !flag('marcus_2') && later('marcus_1_day', 1),
      who: 'Marcus Hale',
      text: '"Turn me in, the Tollmen pay well. Or help me, and I\'ll make it worth your while." His fever is worse.',
      choices: [
        { label: 'Dress his wound', req: () => has('bandage', 2), reqText: 'Needs 2 bandages',
          success: () => { take('bandage', 2); mark('marcus_2'); setFlag('marcus_helped', true); xp(15); return '"First kindness anyone\'s shown me in a year."'; } },
        { label: 'Treat him with a medkit', req: () => has('medkit'), reqText: 'Needs a medkit',
          success: () => { take('medkit', 1); mark('marcus_2'); setFlag('marcus_helped', true); xp(20); return 'By morning he\'s upright and cursing the pain. A good sign.'; } },
        { label: 'Turn him in', success: () => { mark('marcus_2'); setFlag('marcus_betrayed', true); setFlag('warden_trust', true); addMorale(-8); return 'The Tollmen take him without a word. ' + list(give('cigs', 6), give('ammo', 3)) + '. He doesn\'t look at you.'; } },
      ],
    },
    {
      id: 'marcus_3', title: 'The Warden\'s Secret', where: ['travel'], weight: 32, minDay: 5, once: true,
      cond: () => flag('marcus_helped') && !flag('marcus_3') && later('marcus_2_day', 2),
      who: 'Marcus Hale',
      text: '"The Warden has no army. Forty people and a very good story. Call his bluff and it all falls down."',
      choices: [
        { label: 'Bring him to the shelter', success: () => { mark('marcus_3'); setFlag('warden_secret', true); recruit({ name: 'Marcus Hale', trait: 'loyal', skills: { combat: 4, scav: 1 } }); journal('The Warden\'s Bluff', 'Marcus says the Warden has no army, only forty followers and a good story. If the Tollmen ever learn how thin they are stretched, they will break.'); xp(25); return 'He accepts without ceremony. He knows every Tollmen route by heart.'; } },
        { label: 'Press him for details', check: { attr: 'per', diff: 5 },
          success: () => { mark('marcus_3'); setFlag('warden_secret', true); journal('The Warden\'s Bluff', 'Marcus gave names, patrol hours and where the Warden sleeps. The Tollmen are thinner than they look.'); xp(25); return 'Names, patrol hours, the gap in the north wall. He leaves you ' + give('ammo', 2) + ' and heads north.'; },
          fail: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(12); return 'He gives you the big truth and dodges the rest. It\'s enough. Just.'; } },
        { label: 'Wish him luck', success: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(10); return 'He shakes your hand and leaves for the mountains.'; } },
      ],
    },
    {
      id: 'marcus_3b', title: 'A Messenger from the Warden', where: ['travel'], weight: 28, minDay: 6, once: true,
      cond: () => flag('marcus_betrayed') && !flag('marcus_3b') && later('marcus_2_day', 2),
      who: 'Tollman',
      text: '"The Warden remembers who helps him." He holds out a square of red cloth. "Walk his roads free."',
      choices: [
        { label: 'Take the token', success: () => { mark('marcus_3b'); xp(10); return 'You tie it to your pack. Some doors open, some close. ' + give('cigs', 3) + '.'; } },
        { label: 'Ask what happened to Marcus', check: { attr: 'cha', diff: 5 },
          success: () => { mark('marcus_3b'); xp(12); addMorale(-3); return '"He talked. Then he stopped talking." He won\'t meet your eyes.'; },
          fail: () => { mark('marcus_3b'); return '"Mind your own business." He drops the token in the dirt and goes.'; } },
        { label: 'Throw it back', success: () => { mark('marcus_3b'); setFlag('warden_trust', false); addMorale(2); return 'He shrugs, spits, goes. You feel cleaner. And more exposed.'; } },
      ],
    },

    // ---------- 4. THE CHOIR ----------
    {
      id: 'choir_1', title: 'Bells at Midnight', where: ['street', 'any'], weight: 28, night: true, once: true,
      cond: () => !flag('choir_1'),
      text: 'Bells, out of rhythm. Robed figures circle with lanterns, singing. The dead stand at the edge of the light, swaying.',
      choices: [
        { label: 'Watch from the shadows', check: { attr: 'per', diff: 4 },
          success: () => { mark('choir_1'); xp(12); return 'The Choir. They ring the dead home, and the dead come, and stand, and don\'t bite. Not harmless.'; },
          fail: () => { mark('choir_1'); addNoise(1); return 'A robed head turns your way. You melt back into the dark.'; } },
        { label: 'Take another street', success: () => { mark('choir_1'); return 'The bells follow you for an hour, soft and slow.'; } },
        { label: 'Step in and listen', success: () => { mark('choir_1'); xp(8); addMorale(-2); return '"You\'re so tired," a woman says, giving you a candle. "Come to the church." Her eyes are too bright.'; } },
      ],
    },
    {
      id: 'choir_2', title: 'The Choir\'s Offer', where: ['street', 'any'], weight: 30, night: true, once: true,
      cond: () => flag('choir_1') && !flag('choir_2') && later('choir_1_day', 1),
      who: 'Choir elder',
      text: '"Food and a bed for all who come in peace. Weapons stay at the door."',
      choices: [
        { label: 'Hand over your weapon', req: () => !!myWeapon(), reqText: 'You carry no weapon to give',
          success: () => { const w = myWeapon(); take(w, 1); mark('choir_2'); setFlag('choir_inside', true); heal(15); feed(15); addMorale(5); return 'Your ' + itemName(w) + ' goes in a basket. Inside: soup, a bed, singing. Behind a curtain, someone weeps.'; } },
        { label: 'Sneak round and spy', check: { attr: 'per', diff: 6 },
          success: () => { mark('choir_2'); setFlag('choir_spy', true); xp(18); return 'Through a cellar window: a dozen people chained to pews. The Choir collects the living.'; },
          fail: () => { mark('choir_2'); setFlag('choir_hostile', true); addNoise(2); sore(5, 'a Choir cudgel'); return 'A lantern to the face. You tumble off the fire escape, ribs cracked, mind racing.'; } },
        { label: 'Refuse and walk on', success: () => { mark('choir_2'); return '"The door is always open." The bells fade behind you.'; } },
      ],
    },
    {
      id: 'choir_3', title: 'What the Choir Keeps', where: ['street', 'any'], weight: 34, night: true, once: true,
      cond: () => flag('choir_2') && (flag('choir_inside') || flag('choir_spy')) && !flag('choir_3') && later('choir_2_day', 1),
      text: 'Under the church, captives in chains sing to keep the dead calm. A woman looks up and mouths: "Please."',
      choices: [
        { label: 'Break them out', success: () => { mark('choir_3'); return FG(['raider', 'raider'], { onWin: () => {
            recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } });
            recruit({ name: 'Joel', trait: 'quiet', skills: { build: 2, combat: 1 } });
            xp(25); setFlag('choir_freed', true);
            return 'You cut the chains. Nadia and Joel walk out with you.';
          }, onFlee: () => 'You run. The bells ring behind you all night.' }) && 'You kick the cellar door in. Two robed guards rise from their stools.'; } },
        { label: 'Talk the guards down', check: { attr: 'cha', diff: 6 },
          success: () => { mark('choir_3'); setFlag('choir_freed', true); recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } }); xp(22); return 'Mercy, faith, a bargain. The old woman at the door says "go." Nadia follows you out.'; },
          fail: () => { mark('choir_3'); addNoise(2); sore(5, 'a Choir beating'); return 'They laugh and ring the bell. You run, bruised, their faces in your head.'; } },
        { label: 'Join the ceremony', success: () => { mark('choir_3'); addMorale(-12); return 'You hum with them. They give you ' + list(give('canned', 3), give('cigs', 3), give('medkit', 1)) + '. You don\'t look at the cellar door.'; } },
      ],
    },

    // ---------- 5. THE RELAY ----------
    {
      id: 'relay_1', title: 'The Relay Logbook', where: ['radiotower'], weight: 32, once: true,
      cond: () => !!flag('radio_built') && !flag('relay_1'),
      text: 'Behind a fallen shelf, a desk and a chained ledger: HAVEN RELAY STATION 3, OPERATOR LOG.',
      choices: [
        { label: 'Read it carefully', check: { attr: 'int', diff: 5 },
          success: () => { mark('relay_1'); journal('Haven Relay Log', 'The operator wrote that Haven accepts only the healthy. Every arriving convoy is inspected, and anyone with a bite, however old, is turned away at the gate. Haven\'s food stocks, he noted, were for 400 people, not 4000.'); xp(20); return 'Haven is real. Its gate rules are cold: no bites, no exceptions, no appeals.'; },
          fail: () => { mark('relay_1'); journal('Haven Relay Log', 'I found a logbook from a Haven relay. It mentions inspections and gates. I could not read the rest in the poor light.'); xp(8); return 'Water stains and cramped hands. Inspections. Gates. A number.'; } },
        { label: 'Skim it, loot the desk', success: () => { mark('relay_1'); xp(6); return 'The drawer: ' + list(give('batteries', 2), give('parts', 1)) + '. The log stays on its chain.'; } },
        { label: 'Take the book', success: () => { mark('relay_1'); journal('Haven Relay Log', 'I took the operator\'s logbook from the relay station. The first pages describe a working safe zone, just where the broadcast says it is.'); xp(10); return 'You snap the chain and tuck it in your jacket. Reading for a warm night.'; } },
      ],
    },
    {
      id: 'relay_2', title: 'The Operator Answers', where: ['radiotower'], weight: 30, once: true,
      cond: () => !!flag('radio_built') && flag('relay_1') && !flag('relay_2') && later('relay_1_day', 1),
      who: 'Haven Relay',
      text: '"This is Haven Relay. State your party size and condition."',
      choices: [
        { label: 'Ask about the bitten', check: { attr: 'cha', diff: 5 },
          success: () => { mark('relay_2'); setFlag('haven_truth', true); journal('Haven Answers', 'The Haven operator confirmed what the log said: no bites, no exceptions. He added quietly that the gate guards are ordered to turn away the bitten at the road, not the wall.'); xp(25); return '"No bites. No exceptions. I\'m sorry. I didn\'t write the rule." Click.'; },
          fail: () => { mark('relay_2'); xp(8); return '"State your party size and condition." Nothing more.'; } },
        { label: 'Request the route north', check: { attr: 'int', diff: 6 },
          success: () => { mark('relay_2'); xp(20); return 'You read his own call signs back to him. He sighs. A route comes over the wire: ' + give('haven_map', 1) + '.'; },
          fail: () => { mark('relay_2'); return 'He asks for a call sign you don\'t have. The line goes dead.'; } },
        { label: 'Say nothing. Listen.', success: () => { mark('relay_2'); xp(10); return 'A minute of silence. Then, softer: "If you\'re coming, don\'t be bitten." Click.'; } },
      ],
    },
    {
      id: 'relay_3', title: 'The Last Page', where: ['radiotower'], weight: 28, once: true,
      cond: () => !!flag('radio_built') && flag('relay_2') && !flag('relay_3') && later('relay_2_day', 1),
      text: 'The log\'s last page, folded small: the pass is barely open, and if the gates close, "there will be nothing left to..."',
      choices: [
        { label: 'Believe it', success: () => { mark('relay_3'); setFlag('haven_truth', true); journal('The Last Page', 'The operator ends with a warning: the northern pass is narrow, the gates may close, and Haven is no promise. Whatever I decide, I must decide with open eyes.'); xp(25); addMorale(-4); return 'Haven is real, and cruel, and maybe not enough. The weight settles on you.'; } },
        { label: 'Doubt it', success: () => { mark('relay_3'); journal('The Last Page', 'I found one more page of the operator\'s log. He sounds scared. I will wait to judge.'); xp(10); return 'A scared man wrote that. You fold it away and tell no one.'; } },
        { label: 'Burn it', success: () => { mark('relay_3'); addMorale(3); return 'It curls over the lighter. Some hope is easier carried unargued.'; } },
      ],
    },

    // ---------- 6. TEODOR AND BISCUIT ----------
    {
      id: 'teodor_1', title: 'Man With a Shotgun and a Dog', where: ['farm'], weight: 30, minDay: 2, once: true,
      cond: () => !flag('teodor_1'),
      who: 'Teodor',
      text: '"That\'s far enough. My land. I\'m Teodor, that\'s Biscuit. We\'re not leaving." The dog wags anyway.',
      choices: [
        { label: 'Mend his fence (2 wood)', req: () => has('wood', 2), reqText: 'Needs 2 wood',
          success: () => { take('wood', 2); mark('teodor_1'); setFlag('teodor_trust', true); xp(12); return 'An hour of hammering and grunts. "That\'ll do." Biscuit licks your hand.'; } },
        { label: 'Argue he should leave', check: { attr: 'cha', diff: 5 },
          success: () => { mark('teodor_1'); xp(10); return 'The barrel drops. "Come back if you want. I have coffee. Of a sort."'; },
          fail: () => { mark('teodor_1'); addMorale(-2); return 'Click-clack. "Off my land." Biscuit looks apologetic.'; } },
        { label: 'Leave a can on the post', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('teodor_1'); setFlag('teodor_trust', true); xp(10); return 'He grunts. From the road you look back: the can is gone, the dog is watching.'; } },
      ],
    },
    {
      id: 'teodor_2', title: 'Smoke on the Farm', where: ['farm'], weight: 32, minDay: 3, once: true,
      cond: () => flag('teodor_1') && !flag('teodor_2') && later('teodor_1_day', 2),
      text: 'Smoke over Teodor\'s barn. Two raiders hauling grain, the old man pinned behind a trough, Biscuit hurt.',
      play: { type: 'rescue', foes: ['raider', 'raider'], who: 'Teodor',
        onWin: () => { mark('teodor_2'); setFlag('teodor_helped', true); setFlag('teodor_trust', true); xp(20); return '"Well," Teodor says, sitting down hard in the dust. "Damn it." Biscuit licks your boot.'; },
        onLose: () => { mark('teodor_2'); addMorale(-4); return 'Teodor goes down behind the trough. The raiders take the grain. He lives. He won\'t forget.'; } },
    },
    {
      id: 'teodor_3', title: 'The Last Stand', where: ['farm'], weight: 36, minDay: 4, once: true,
      cond: () => flag('teodor_2') && !flag('teodor_3') && later('teodor_2_day', 2),
      who: 'Teodor',
      text: '"They\'re coming back. More of them. I\'m too old to run. You\'re welcome to."',
      choices: [
        { label: 'Convince him to come', check: { attr: 'cha', diff: 6 },
          success: () => { mark('teodor_3'); recruit({ name: 'Teodor', trait: 'grumpy', skills: { farm: 5, build: 1, combat: 1 } }); setFlag('teodor_joined', true); xp(30); return '"They were good years." He takes the shotgun, the dog and a jar of seeds, and doesn\'t look back.'; },
          fail: () => { mark('teodor_3'); setFlag('teodor_dead', true); return '"A man dies where he stands." You can\'t argue it down. You leave him on the porch.'; } },
        { label: 'Stand with him', success: () => { mark('teodor_3'); setFlag('teodor_dead', true); return FG(['raider', 'raider', 'raider'], { onWin: () => { setFlag('teodor_helped', true); xp(25); return 'They fall one by one. So does Teodor, Biscuit in his lap, whispering about rain.'; } }) && 'You sit down beside him. At dusk the yard fills with smoke.'; } },
        { label: 'Leave him to it', success: () => { mark('teodor_3'); setFlag('teodor_dead', true); setFlag('teodor_abandoned', true); addMorale(-8); return 'An hour later, shots echo across the fields. Then nothing.'; } },
      ],
    },
    {
      id: 'teodor_4', title: 'The Seed Jar', where: ['farm'], weight: 28, once: true,
      cond: () => flag('teodor_dead') && !flag('teodor_4') && later('teodor_3_day', 1),
      text: () => flag('teodor_abandoned')
        ? 'Teodor lies under a blanket on the porch. Biscuit won\'t leave him. A jar of seeds on the rail: "For whoever has the sense."'
        : 'A fresh grave under the apple tree. Biscuit lies across it, by a jar of seeds: "For whoever has the sense."',
      choices: [
        { label: 'Bury him. Take the seeds.', success: () => { mark('teodor_4'); const full = !flag('teodor_abandoned'); xp(full ? 30 : 15); addMorale(full ? 5 : -2); return 'A few half-remembered words. ' + give('veg', full ? 6 : 3) + ' from his garden. Biscuit stops at the gate.'; } },
        { label: 'Share food with Biscuit', req: () => has('canned') || has('snack'), reqText: 'Needs food',
          success: () => { if (!take('snack', 1)) take('canned', 1); mark('teodor_4'); xp(15); addMorale(5); return 'He eats like he hasn\'t in days, licks your hand once, and goes back to the grave. ' + give('veg', 3) + '.'; } },
        { label: 'Say a word and go', success: () => { mark('teodor_4'); addMorale(2); return 'Hat in hand, a minute. Then ' + give('veg', 2) + ', because he\'d hate it to rot.'; } },
      ],
    },
  ];
})();
