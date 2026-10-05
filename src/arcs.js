// Dead Embers: multi-part character arcs (each part fires once, chained by flags)
// mark(k) sets flag k and k_day; later(k_day, n) gates the next part by n days. Every outcome of a part must mark it,
// or the chain stalls (parts are `once`). Physical parts are played; their flags are set in play.onWin AND play.onLose.
(function () {
  const FG = (ids, opts) => { fight(ids, opts); return true; };
  const later = (k, n) => G.day >= (Number(flag(k)) || 0) + n;
  const mark = (k) => { setFlag(k, true); setFlag(k + '_day', G.day); };
  const myWeapon = () => ['knife', 'pipe', 'bat', 'machete', 'axe', 'crossbow', 'pistol', 'shotgun'].find(w => has(w));
  const ELI = { name: 'Eli', trait: 'quiet', skills: { farm: 1, scav: 4, build: 1, med: 1, combat: 1 } };

  window.ARC_ENCOUNTERS = [
    // ---------- 1. ELI ----------
    {
      id: 'eli_1', title: 'Small Footsteps', where: ['apartments'], weight: 30, once: true,
      cond: () => !flag('eli_1'),
      text: 'Your pack is open and a can is gone. Something small darts up the stairwell.',
      choices: [
        { label: 'Chase the thief', check: { attr: 'agi', diff: 5 },
          success: () => { mark('eli_1'); setFlag('eli_scared', true); xp(8); return 'A boy of ten, clutching your can. He sees your face and vanishes through a hole in the wall.'; },
          fail: () => { mark('eli_1'); tire(6); return 'You lose him in the corridors. Behind a door, someone breathes fast. You let it be.'; } },
        { label: 'Let it go and watch', success: () => { mark('eli_1'); xp(6); return 'Wide eyes watch you from a vent. A boy, no older than ten.'; } },
        { label: 'Leave a note and a snack', req: () => has('snack'), reqText: 'Needs a snack bar',
          success: () => { take('snack', 1); mark('eli_1'); setFlag('eli_trust', true); xp(8); return 'You write "I will not hurt you" and leave a snack. Later it is gone, and a stick figure is drawn on the wall.'; } },
      ],
    },
    {
      id: 'eli_2', title: 'The Boy in the Vents', where: ['apartments'], weight: 32, once: true,
      cond: () => flag('eli_1') && !flag('eli_2') && later('eli_1_day', 1),
      text: 'A paper cup and a bent spoon on the landing: a crude trap. Above you, a floorboard creaks.',
      choices: [
        { label: 'Leave a can and walk away', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'Halfway down the stairs you hear a door click, then a can being opened.'; } },
        { label: 'Corner him', check: { attr: 'agi', diff: 6 },
          success: () => { mark('eli_2'); setFlag('eli_scared', true); xp(8); return 'You catch his collar. He kicks and bites and says nothing, then he is gone. He will not forget this.'; },
          fail: () => { mark('eli_2'); setFlag('eli_scared', true); hurt(4, 'a fall on the stairs'); return 'A rotten step gives under you. The boy laughs, a small dry sound, and is gone.'; } },
        { label: 'Sit down and wait', check: { attr: 'cha', diff: 4 },
          success: () => { mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'You talk about nothing for an hour. Then a small voice from the dark: "Eli."'; },
          fail: () => { mark('eli_2'); passTime(1); return 'An hour. Nothing answers. You stand, stiff, and go.'; } },
      ],
    },
    {
      id: 'eli_3', title: 'A Name and a Choice', where: ['apartments'], weight: 34, once: true, who: 'Eli',
      cond: () => flag('eli_2') && !flag('eli_3') && later('eli_2_day', 1),
      text: () => flag('eli_trust')
        ? 'Eli waits on the landing, coat buttoned wrong, holding out your empty can. "Is it warm where you live?"'
        : 'Eli stands in the stairwell with a packed bag, wary as a cat. He cannot stay alone much longer.',
      choices: [
        { label: 'Offer your hand', req: () => !!flag('eli_trust'), reqText: 'He must trust you first',
          success: () => { mark('eli_3'); recruit(ELI); setFlag('eli_joined', true); xp(25); addMorale(8); return 'He takes your hand. "I know all the vents," he says. It is the most he has said in a year.'; } },
        { label: 'Coax him with food and calm', req: () => !flag('eli_trust'), reqText: 'He already trusts you',
          check: { attr: 'cha', diff: 7 },
          success: () => { mark('eli_3'); recruit(ELI); setFlag('eli_joined', true); xp(25); return 'An hour and half a can of peaches later, he falls into step beside you.'; },
          fail: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-5); return 'He bolts upstairs. A door slams, then a bolt. He will not open for you.'; } },
        { label: 'Leave him be', success: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-3); return 'You leave a can on the step. In the dark, a small shape watches you go.'; } },
      ],
    },
    {
      id: 'eli_4', title: 'Eli\'s Secret', where: ['shelter'], weight: 35, once: true, who: 'Eli',
      cond: () => flag('eli_joined') && !flag('eli_4') && later('eli_3_day', 2),
      text: 'Eli tugs your sleeve before dawn. "I know something. I have not told anyone. I want to show you."',
      choices: [
        { label: 'Follow him to his cache', success: () => { mark('eli_4'); xp(15); return 'Through a drain, over a roof, into a crushed pharmacy. His hoard: ' + give('canned', 3) + ', ' + give('batteries', 2) + ', ' + give('bandage', 2) + '.'; } },
        { label: 'Ask what he saw of the Tollmen', success: () => { mark('eli_4'); setFlag('tollmen_secret', true); journal('What Eli Saw', 'Eli watched the Tollmen from the rooftops for months. They hide their tolls in a dry canal under the old bridge. They fear a man called Hale, and they leave their camp thinly guarded at dawn.'); xp(20); return 'Where they stash the toll, when they sleep, who they fear. A lot for a child to carry.'; } },
        { label: 'Tell him to rest', success: () => { mark('eli_4'); addMorale(3); return 'It can wait. He shrugs, but there is relief in it.'; } },
      ],
    },

    // ---------- 2. DR. INES OKAFOR ----------
    {
      id: 'ines_1', title: 'The Lab Behind the Barricade', where: ['hospital'], weight: 30, once: true, who: 'Voice behind the door',
      cond: () => !flag('ines_1'),
      text: 'Light under a lab door. "I have a scalpel and no patience. I am working on a cure."',
      choices: [
        { label: 'Talk to her calmly', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_1'); setFlag('ines_open', true); xp(15); return 'The door opens a hand wide. "Dr. Ines Okafor. Bring me 3 chemicals and 2 components."'; },
          fail: () => { mark('ines_1'); xp(5); return 'A list slides under the door: 3 chemicals, 2 components. "Bring them. Then we talk."'; } },
        { label: 'Pass a can under the door', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('ines_1'); setFlag('ines_open', true); xp(12); return 'A hand takes it. The door opens a crack. "3 chemicals. 2 components. Please."'; } },
        { label: 'Leave her to her work', success: () => { mark('ines_1'); xp(3); return 'You nod at the door and go. Behind it, she gets back to work.'; } },
      ],
    },
    {
      id: 'ines_2', title: 'Ines\'s List', where: ['travel', 'any'], weight: 30, once: true,
      cond: () => flag('ines_1') && !flag('ines_2') && later('ines_1_day', 1) && has('chem', 3) && has('parts', 2),
      text: 'Your pack clinks with everything Dr. Okafor asked for. The hospital is a short detour.',
      choices: [
        { label: 'Deliver everything', success: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); xp(15); return 'She counts it twice, then hugs you. "I have not touched anyone in four months."'; } },
        { label: 'Haggle for part of it', check: { attr: 'cha', diff: 5 },
          success: () => { take('chem', 2); take('parts', 1); mark('ines_2'); passTime(2); xp(10); return 'She argues, then gives in. You keep a little back.'; },
          fail: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); return 'She sees through you, takes the lot and shuts the door hard.'; } },
        { label: 'Keep your materials', success: () => { mark('ines_2'); setFlag('ines_declined', true); return 'Chemicals are worth more as chemicals. She will finish alone.'; } },
      ],
    },
    {
      id: 'ines_3', title: 'The Vial', where: ['hospital'], weight: 35, once: true, who: 'Dr. Ines Okafor',
      cond: () => flag('ines_2') && !flag('ines_declined') && !flag('ines_3') && later('ines_2_day', 2),
      text: 'Dr. Okafor opens the door red-eyed and smiling. One vial of clear liquid. "It works. On rats, on a dog, on me."',
      choices: [
        { label: 'Invite her to the shelter', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); recruit({ name: 'Dr. Ines Okafor', trait: 'medic', skills: { med: 5, scav: 1 } }); xp(30); setFlag('ines_joined', true); return 'She presses ' + give('serum', 1) + ' into your hand and packs her notebooks. "Show me the sick."'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(20); return '"The work is not done." She gives you ' + give('serum', 1) + ' and stays.'; } },
        { label: 'Let her keep researching', success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(25); return '"I will make more. Come back in a few days." She slides you ' + give('serum', 1) + '.'; } },
        { label: 'Study her notes with her', check: { attr: 'int', diff: 6 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); journal('The Okafor Formula', 'Dr. Okafor\'s serum cures early infection, not the fully turned. The key is a protein from survivors who never fell ill. She suspects Haven has the original sample, or never did.'); xp(30); return 'By dawn you understand it. She gives you ' + give('serum', 1) + ' and her first real laugh in weeks.'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(15); return 'The notes are beyond you. She gives you ' + give('serum', 1) + ' anyway.'; } },
      ],
    },
    {
      id: 'ines_4', title: 'The Doctor\'s Gift', where: ['hospital'], weight: 28, once: true, who: 'Dr. Ines Okafor',
      cond: () => flag('ines_stays') && !flag('ines_4') && later('ines_3_day', 3),
      text: 'The lab smells of vinegar and boiled cloth. "Not the cure. But I can make antibiotics, if you help."',
      choices: [
        { label: 'Help her for an hour', success: () => { mark('ines_4'); tire(10); passTime(1); xp(12); return '"Thank you for believing me." ' + give('antibiotics', 2) + ', ' + give('bandage', 2) + '.'; } },
        { label: 'Give her a spare chemical', req: () => has('chem', 1), reqText: 'Needs a chemical',
          success: () => { take('chem', 1); mark('ines_4'); xp(10); return 'She takes the jar like a relic. ' + give('antibiotics', 3) + ', ' + give('painkillers', 2) + '.'; } },
        { label: 'Take what she offers and go', success: () => { mark('ines_4'); return 'She hands you ' + give('antibiotics', 1) + ', already bent over her microscope.'; } },
      ],
    },

    // ---------- 3. MARCUS HALE ----------
    {
      id: 'marcus_1', title: 'A Tollman in the Culvert', where: ['travel'], weight: 30, minDay: 5, once: true, who: 'Marcus Hale',
      cond: () => !flag('marcus_1'),
      text: 'A wounded Tollman sits in a culvert, pistol on his knee. "I am not here to hurt you. Marcus Hale. Lieutenant. Was."',
      choices: [
        { label: 'Hear him out', check: { attr: 'cha', diff: 4 },
          success: () => { mark('marcus_1'); xp(12); return 'He served the Warden a year, then saw something he cannot unsee. He wants out.'; },
          fail: () => { mark('marcus_1'); xp(5); return 'His hand never leaves the pistol. "Come back when you know whose side you are on."'; } },
        { label: 'Take his gun and leave him', success: () => { mark('marcus_1'); setFlag('marcus_wronged', true); addMorale(-5); return 'He does not fight. You take ' + give('ammo', 4) + '. He watches you go like he expected it.'; } },
        { label: 'Walk away', success: () => { mark('marcus_1'); setFlag('marcus_lost', true); return 'A Tollman is a Tollman. You back out of the culvert.'; } },
      ],
    },
    {
      id: 'marcus_2', title: 'The Price of a Defector', where: ['travel'], weight: 30, minDay: 5, once: true, who: 'Marcus Hale',
      cond: () => flag('marcus_1') && !flag('marcus_lost') && !flag('marcus_wronged') && !flag('marcus_2') && later('marcus_1_day', 1),
      text: 'Marcus is grey, his bandage soaked through. "Turn me in, or help me. The Tollmen pay well for deserters."',
      choices: [
        { label: 'Dress his wound (2 bandages)', req: () => has('bandage', 2), reqText: 'Needs 2 bandages',
          success: () => { take('bandage', 2); mark('marcus_2'); setFlag('marcus_helped', true); xp(15); return '"That is the first kindness anyone has shown me in a year."'; } },
        { label: 'Treat him with a medkit', req: () => has('medkit'), reqText: 'Needs a medkit',
          success: () => { take('medkit', 1); mark('marcus_2'); setFlag('marcus_helped', true); xp(20); return 'You stitch him up. By morning he is cursing the pain, which is a good sign.'; } },
        { label: 'Turn him in to the Tollmen', success: () => { mark('marcus_2'); setFlag('marcus_betrayed', true); setFlag('warden_trust', true); addMorale(-8); return 'They take him and pay you ' + give('cigs', 6) + ', ' + give('ammo', 3) + '. He does not look at you.'; } },
      ],
    },
    {
      id: 'marcus_3', title: 'The Warden\'s Secret', where: ['travel'], weight: 32, minDay: 5, once: true, who: 'Marcus Hale',
      cond: () => flag('marcus_helped') && !flag('marcus_3') && later('marcus_2_day', 2),
      text: '"I owe you. The Warden has no army. Forty people and a good story. Call his bluff and it all falls."',
      choices: [
        { label: 'Take him back to the shelter', success: () => { mark('marcus_3'); setFlag('warden_secret', true); recruit({ name: 'Marcus Hale', trait: 'loyal', skills: { combat: 4, scav: 1 } }); journal('The Warden\'s Bluff', 'Marcus says the Warden has no army, only forty followers and a good story. If the Tollmen ever learn how thin they are stretched, they will break.'); xp(25); return 'He knows every Tollmen route by heart. A good man to have on a wall.'; } },
        { label: 'Press him for details', check: { attr: 'per', diff: 5 },
          success: () => { mark('marcus_3'); setFlag('warden_secret', true); journal('The Warden\'s Bluff', 'Marcus gave names, patrol hours and where the Warden sleeps. The Tollmen are thinner than they look.'); xp(25); return 'Names, patrol hours, a gap in the north wall. He leaves you ' + give('ammo', 2) + '.'; },
          fail: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(12); return 'He gives you the big truth but dodges the details. It is enough, just.'; } },
        { label: 'Wish him luck and part ways', success: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(10); return 'He tells you anyway, like putting down a heavy bag. Then he heads for the mountains.'; } },
      ],
    },
    {
      id: 'marcus_3b', title: 'A Messenger from the Warden', where: ['travel'], weight: 28, minDay: 6, once: true, who: 'Tollman',
      cond: () => flag('marcus_betrayed') && !flag('marcus_3b') && later('marcus_2_day', 2),
      text: 'A Tollman holds out a square of red cloth. "The Warden remembers who helps him. Walk his roads free."',
      choices: [
        { label: 'Accept the token', success: () => { mark('marcus_3b'); xp(10); return 'You tie it to your pack. He adds ' + give('cigs', 3) + ' and leaves.'; } },
        { label: 'Ask what happened to Marcus', check: { attr: 'cha', diff: 5 },
          success: () => { mark('marcus_3b'); xp(12); addMorale(-3); return '"He talked. Then he stopped talking." He will not meet your eyes.'; },
          fail: () => { mark('marcus_3b'); return '"Mind your own business." He drops the token and goes.'; } },
        { label: 'Throw the token back', success: () => { mark('marcus_3b'); setFlag('warden_trust', false); addMorale(2); return 'It lands in the dirt. He spits and goes. You feel cleaner, and more exposed.'; } },
      ],
    },

    // ---------- 4. THE CHOIR ----------
    {
      id: 'choir_1', title: 'Bells at Midnight', where: ['street', 'any'], weight: 28, night: true, once: true,
      cond: () => !flag('choir_1'),
      text: 'Robed figures circle with lanterns, ringing bells. The dead stand at the edge of the light, swaying.',
      choices: [
        { label: 'Watch from the shadows', check: { attr: 'per', diff: 4 },
          success: () => { mark('choir_1'); xp(12); return 'They call themselves the Choir. They "call the dead home", and the dead come, and do not bite.'; },
          fail: () => { mark('choir_1'); addNoise(1); return 'A robed figure turns your way. You back off into the dark.'; } },
        { label: 'Go quietly the other way', success: () => { mark('choir_1'); return 'You take another street. The bells follow you for an hour.'; } },
        { label: 'Step forward and listen', success: () => { mark('choir_1'); xp(8); addMorale(-2); return 'A woman presses a candle into your hand. "Come to the church. We keep you safe." Her eyes are too bright.'; } },
      ],
    },
    {
      id: 'choir_2', title: 'The Choir\'s Offer', where: ['street', 'any'], weight: 30, night: true, once: true, who: 'Choir elder',
      cond: () => flag('choir_1') && !flag('choir_2') && later('choir_1_day', 1),
      text: '"The Choir offers food and shelter to those who come in peace. Leave your weapons at the door."',
      choices: [
        { label: 'Hand over your weapon and go in', req: () => !!myWeapon(), reqText: 'You carry no weapon to give',
          success: () => { const w = myWeapon(); take(w, 1); mark('choir_2'); setFlag('choir_inside', true); heal(15); feed(15); addMorale(5); return 'Your ' + itemName(w) + ' goes in a basket. Inside: soup, a bed, singing. Behind a curtain, someone weeps.'; } },
        { label: 'Slip in and spy on them', check: { attr: 'per', diff: 6 },
          success: () => { mark('choir_2'); setFlag('choir_spy', true); xp(18); return 'Through a cellar window: a dozen people chained to pews. The Choir does not save the living. It keeps them.'; },
          fail: () => { mark('choir_2'); setFlag('choir_hostile', true); addNoise(2); hurt(5, 'a Choir cudgel'); return 'A lantern swings into your face. You fall down the fire escape with a cracked rib.'; } },
        { label: 'Refuse and walk on', success: () => { mark('choir_2'); return '"The door is always open." The bells fade behind you.'; } },
      ],
    },
    {
      id: 'choir_3', title: 'What the Choir Keeps', where: ['street', 'any'], weight: 34, night: true, once: true,
      cond: () => flag('choir_2') && (flag('choir_inside') || flag('choir_spy')) && !flag('choir_3') && later('choir_2_day', 1),
      text: 'Under the church, chained captives sing to keep the dead calm. A woman looks up and mouths: "Please."',
      choices: [
        { label: 'Break them out by force',
          success: () => {
            mark('choir_3');
            return FG(['raider', 'raider'], {
              onWin: () => {
                recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } });
                recruit({ name: 'Joel', trait: 'quiet', skills: { build: 2, combat: 1 } });
                xp(25);
                return 'You cut the chains. Nadia and Joel come home with you.';
              },
              onFlee: () => { addMorale(-5); return 'You run. The cellar door slams behind you.'; },
            }) && 'You kick in the cellar door. Two armed guards in grey rise from their stools.';
          } },
        { label: 'Talk the guards into letting them go', check: { attr: 'cha', diff: 6 },
          success: () => { mark('choir_3'); recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } }); xp(22); return 'At last the old woman at the door says "Go." Nadia follows you out.'; },
          fail: () => { mark('choir_3'); addNoise(2); hurt(5, 'a Choir beating'); return 'They laugh and ring the bell. You run, bruised, with their faces in your head.'; } },
        { label: 'Join the ceremony', success: () => { mark('choir_3'); addMorale(-12); return 'You hum with the bells. They give you ' + give('canned', 3) + ', ' + give('cigs', 3) + ', ' + give('medkit', 1) + '. You do not look at the cellar door.'; } },
      ],
    },

    // ---------- 5. THE RELAY ----------
    {
      id: 'relay_1', title: 'The Relay Logbook', where: ['radiotower'], weight: 32, once: true,
      cond: () => !!flag('radio_built') && !flag('relay_1'),
      text: 'A ledger chained to a desk: HAVEN RELAY STATION 3, OPERATOR LOG. The last entry is from the week it all ended.',
      choices: [
        { label: 'Read it carefully', check: { attr: 'int', diff: 5 },
          success: () => { mark('relay_1'); journal('Haven Relay Log', 'The operator wrote that Haven accepts only the healthy. Every arriving convoy is inspected, and anyone with a bite, however old, is turned away at the gate. Haven\'s food stocks, he noted, were for 400 people, not 4000.'); xp(20); return 'Haven is real. But the gate rules are cold: no bites, no exceptions.'; },
          fail: () => { mark('relay_1'); journal('Haven Relay Log', 'I found a logbook from a Haven relay. It mentions inspections and gates. I could not read the rest in the poor light.'); xp(8); return 'Water-stained pages. You make out fragments: inspections, gates, a number.'; } },
        { label: 'Skim it and loot the desk', success: () => { mark('relay_1'); xp(6); return 'The drawer holds ' + give('batteries', 2) + ', ' + give('parts', 1) + '. The log stays on its chain.'; } },
        { label: 'Take the book for later', success: () => { mark('relay_1'); journal('Haven Relay Log', 'I took the operator\'s logbook from the relay station. The first pages describe a working safe zone, just where the broadcast says it is.'); xp(10); return 'You break the chain and tuck the log into your jacket.'; } },
      ],
    },
    {
      id: 'relay_2', title: 'The Operator Answers', where: ['radiotower'], weight: 30, once: true, who: 'Haven Relay',
      cond: () => !!flag('radio_built') && flag('relay_1') && !flag('relay_2') && later('relay_1_day', 1),
      text: 'Your radio crackles. A flat voice: "This is Haven Relay. State your party size and condition."',
      choices: [
        { label: 'Ask honestly about the bitten', check: { attr: 'cha', diff: 5 },
          success: () => { mark('relay_2'); setFlag('haven_truth', true); journal('Haven Answers', 'The Haven operator confirmed what the log said: no bites, no exceptions. He added quietly that the gate guards are ordered to turn away the bitten at the road, not the wall.'); xp(25); return '"No bites. No exceptions. I am sorry. I did not write the rule." Click.'; },
          fail: () => { mark('relay_2'); xp(8); return '"State your party size and condition," the voice repeats. Nothing more.'; } },
        { label: 'Request the route to Haven', check: { attr: 'int', diff: 6 },
          success: () => { mark('relay_2'); xp(20); return 'You read back the log\'s call signs. A route comes over the wire: ' + give('haven_map', 1) + '.'; },
          fail: () => { mark('relay_2'); return 'He asks for a call sign you do not have. The line dies.'; } },
        { label: 'Say nothing and listen', success: () => { mark('relay_2'); xp(10); return '"Is anyone there?" Then, softly: "If you are coming, do not be bitten." Click.'; } },
      ],
    },
    {
      id: 'relay_3', title: 'The Last Page', where: ['radiotower'], weight: 28, once: true,
      cond: () => !!flag('radio_built') && flag('relay_2') && !flag('relay_3') && later('relay_2_day', 1),
      text: 'The log\'s last page, folded small: the pass is barely open, and the gates may close. It ends mid-sentence.',
      choices: [
        { label: 'Believe it all', success: () => { mark('relay_3'); setFlag('haven_truth', true); journal('The Last Page', 'The operator ends with a warning: the northern pass is narrow, the gates may close, and Haven is no promise. Whatever I decide, I must decide with open eyes.'); xp(25); addMorale(-4); return 'Haven is real, and cruel, and maybe not enough. The weight settles on you.'; } },
        { label: 'Doubt it', success: () => { mark('relay_3'); journal('The Last Page', 'I found one more page of the operator\'s log. He sounds scared. I will wait to judge.'); xp(10); return 'A scared man wrote that. You put the page away and tell no one.'; } },
        { label: 'Burn it', success: () => { mark('relay_3'); addMorale(3); return 'The page curls over a lighter. Some hope is easier to carry unargued.'; } },
      ],
    },

    // ---------- 6. TEODOR AND BISCUIT ----------
    {
      id: 'teodor_1', title: 'Man With a Shotgun and a Dog', where: ['farm'], weight: 30, minDay: 2, once: true, who: 'Teodor',
      cond: () => !flag('teodor_1'),
      text: 'A shotgun rises over a fence, then a white beard. "My land. I am Teodor, that is Biscuit. We are not leaving."',
      choices: [
        { label: 'Offer to mend his fence (2 wood)', req: () => has('wood', 2), reqText: 'Needs 2 wood',
          success: () => { take('wood', 2); mark('teodor_1'); setFlag('teodor_trust', true); xp(12); return 'He grunts at every board. After an hour: "That will do." Biscuit licks your hand.'; } },
        { label: 'Argue that he should leave', check: { attr: 'cha', diff: 5 },
          success: () => { mark('teodor_1'); xp(10); return 'He lowers the gun. "Come back if you want. I have coffee. Of a sort."'; },
          fail: () => { mark('teodor_1'); addMorale(-2); return 'He cocks the shotgun. "Off my land." Biscuit looks sorry about it.'; } },
        { label: 'Leave a can on the gatepost', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('teodor_1'); setFlag('teodor_trust', true); xp(10); return 'When you look back from the road, the can is gone and the dog is watching you.'; } },
      ],
    },
    {
      id: 'teodor_2', title: 'Smoke on the Farm', where: ['farm'], weight: 32, minDay: 3, once: true,
      cond: () => flag('teodor_1') && !flag('teodor_2') && later('teodor_1_day', 2),
      text: 'Smoke over Teodor\'s barn. Raiders drag out his grain while he fires blind from behind a trough.',
      play: { type: 'rescue', foes: ['raider', 'raider'], who: 'Teodor',
        onWin: () => { mark('teodor_2'); setFlag('teodor_helped', true); setFlag('teodor_trust', true); xp(20); return 'Teodor sits down hard in the dust. "Well. Damn it." Biscuit licks your boot.'; },
        onLose: () => { mark('teodor_2'); addMorale(-4); return 'The raiders get away with half the grain. Teodor will not forget the empty road.'; } },
    },
    {
      id: 'teodor_3', title: 'The Last Stand', where: ['farm'], weight: 36, minDay: 4, once: true, who: 'Teodor',
      cond: () => flag('teodor_2') && !flag('teodor_3') && later('teodor_2_day', 2),
      text: 'Teodor sits on his porch, shotgun across his knees. "They are coming back, more of them. I am too old to run."',
      choices: [
        { label: 'Convince him to leave with you', check: { attr: 'cha', diff: 6 },
          success: () => { mark('teodor_3'); recruit({ name: 'Teodor', trait: 'grumpy', skills: { farm: 5, build: 1, combat: 1 } }); setFlag('teodor_joined', true); xp(30); return '"They were good years." He takes the shotgun, the dog and a jar of seeds, and does not look back.'; },
          fail: () => { mark('teodor_3'); setFlag('teodor_dead', true); return '"A man dies where he stands." You cannot stay. You leave him on the porch.'; } },
        { label: 'Stand with him',
          success: () => {
            mark('teodor_3');
            return FG(['raider', 'raider', 'raider'], {
              onWin: () => { setFlag('teodor_dead', true); setFlag('teodor_helped', true); xp(25); return 'They fall, but so does Teodor. He dies with Biscuit in his lap, whispering about rain.'; },
              onFlee: () => { setFlag('teodor_dead', true); setFlag('teodor_abandoned', true); addMorale(-8); return 'You run. Behind you, the shooting stops.'; },
            }) && 'You sit down beside him. The raiders come at dusk.';
          } },
        { label: 'Leave him to it', success: () => { mark('teodor_3'); setFlag('teodor_dead', true); setFlag('teodor_abandoned', true); addMorale(-8); return 'You walk away. Shots echo over the fields an hour later. Then silence.'; } },
      ],
    },
    {
      id: 'teodor_4', title: 'The Seed Jar', where: ['farm'], weight: 28, once: true,
      cond: () => flag('teodor_dead') && !flag('teodor_4') && later('teodor_3_day', 1),
      text: () => flag('teodor_abandoned')
        ? 'Teodor lies under a blanket on the porch, Biscuit curled against him. A jar of seeds: "For whoever has the sense to plant them."'
        : 'A fresh grave under the apple tree, Biscuit lying across it. A jar of seeds: "For whoever has the sense to plant them."',
      choices: [
        { label: 'Take the seeds, bury him properly', success: () => { mark('teodor_4'); const full = !flag('teodor_abandoned'); xp(full ? 30 : 15); addMorale(full ? 5 : -2); return 'You dig and say a few half-remembered words. ' + give('veg', full ? 6 : 3) + ' from his garden. Biscuit watches you go.'; } },
        { label: 'Share your food with Biscuit', req: () => has('canned') || has('snack'), reqText: 'Needs food',
          success: () => { if (!take('snack', 1)) take('canned', 1); mark('teodor_4'); xp(15); addMorale(5); return 'The dog eats like he has not in days. You take ' + give('veg', 3) + '. He goes back to the grave.'; } },
        { label: 'Say a word and go', success: () => { mark('teodor_4'); addMorale(2); return 'A minute, hat in hand. You take ' + give('veg', 2) + '. Teodor would hate to see it rot.'; } },
      ],
    },
  ];
})();
