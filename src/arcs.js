// Dead Embers: multi-part character arcs (each part fires once, chained by flags)
(function () {
  const FG = (ids, opts) => { fight(ids, opts); return true; };
  const later = (k, n) => G.day >= (Number(flag(k)) || 0) + n;
  const mark = (k) => { setFlag(k, true); setFlag(k + '_day', G.day); };
  const myWeapon = () => ['knife', 'pipe', 'bat', 'machete', 'axe', 'crossbow', 'pistol', 'shotgun'].find(w => has(w));

  window.ARC_ENCOUNTERS = [
    // ---------- 1. ELI ----------
    {
      id: 'eli_1', title: 'Small Footsteps', where: ['apartments'], weight: 30, once: true,
      cond: () => !flag('eli_1'),
      text: 'You set your pack down for a minute on the stairwell. When you turn back, the side pocket is open and a can is gone. A flicker of movement on the landing above, something small and fast, and a door clicking shut.',
      choices: [
        { label: 'Chase the thief', check: { attr: 'agi', diff: 5 },
          success: () => { mark('eli_1'); setFlag('eli_scared', true); xp(8); return 'You catch a glimpse through a closing door: a boy of ten, all elbows, clutching your can like a trophy. He sees your face and vanishes through a hole in the wall. You may have frightened him badly.'; },
          fail: () => { mark('eli_1'); tire(6); return 'You take the stairs three at a time and lose him in a maze of corridors. Behind a door, someone breathes fast and quiet. You let it be.'; } },
        { label: 'Let it go and watch', success: () => { mark('eli_1'); xp(6); return 'You pretend not to notice and wait. A pair of wide eyes watches you from a vent, a boy no older than ten. When you leave, you hear the vent clatter softly behind you.'; } },
        { label: 'Leave a note and a snack', req: () => has('snack'), reqText: 'Needs a snack bar',
          success: () => { take('snack', 1); mark('eli_1'); setFlag('eli_trust', true); xp(8); return 'You scrawl "I will not hurt you" on the wall and leave a snack bar on the step. When you pass by again, it is gone, and there is a drawing of a stick figure with a hat on the wall.'; } },
      ],
    },
    {
      id: 'eli_2', title: 'The Boy in the Vents', where: ['apartments'], weight: 32, once: true,
      cond: () => flag('eli_1') && !flag('eli_2') && later('eli_1_day', 1),
      text: 'The same stairwell, the same smell of old plaster. A paper cup sits on the landing with a bent spoon beside it, a crude trap for the unwary. Somewhere above, a floorboard creaks. He knows you are here.',
      choices: [
        { label: 'Leave a can of food and walk away', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'You set a can on the step, turn your back, and walk down slowly. Halfway to the street you hear the quiet click of a door, and the sound of a can being opened.'; } },
        { label: 'Corner him', check: { attr: 'agi', diff: 6 },
          success: () => { mark('eli_2'); setFlag('eli_scared', true); xp(8); return 'You catch his collar at the top of the stairs. He kicks, bites, and says nothing, not one word. When you let go, he is gone like smoke. He will not forget this.'; },
          fail: () => { mark('eli_2'); setFlag('eli_scared', true); hurt(4, 'a fall on the stairs'); return 'You slip on a rotted step and the boy laughs, a small dry sound. He is gone before you stand. The trap was a good one.'; } },
        { label: 'Sit down and wait', check: { attr: 'cha', diff: 4 },
          success: () => { mark('eli_2'); setFlag('eli_trust', true); xp(12); return 'You sit on the stair with your hands in the open and talk about nothing for an hour. At the end a small voice from the dark says one word: "Eli."'; },
          fail: () => { mark('eli_2'); passTime(1); return 'You wait an hour. Nothing answers. Eventually you stand, stiff, and go.'; } },
      ],
    },
    {
      id: 'eli_3', title: 'A Name and a Choice', where: ['apartments'], weight: 34, once: true,
      cond: () => flag('eli_2') && !flag('eli_3') && later('eli_2_day', 1),
      text: () => flag('eli_trust')
        ? 'Eli is waiting on the landing, his coat buttoned wrong, a patched backpack on his shoulder. He holds out the empty can you gave him like a ticket. "Is it warm where you live?" he asks.'
        : 'Eli stands in the stairwell at last, wary as a cat. He has packed a bag. He looks at you, and then at the door, and does not move. He does not trust you, but he cannot stay alone much longer.',
      choices: [
        { label: 'Offer your hand', req: () => !!flag('eli_trust'), reqText: 'He must trust you first',
          success: () => { mark('eli_3'); const s = recruit({ name: 'Eli', trait: 'quiet', skills: { farm: 1, scav: 4, build: 1, med: 1, combat: 1 } }); if (s) { setFlag('eli_joined', true); xp(25); addMorale(8); return 'He puts the can in your hand and takes the other one. "I know all the vents," he says. It is the most he has spoken in a year.'; } return 'He nods, but the shelter has no room. You promise to return.'; } },
        { label: 'Coax him with food and calm', req: () => !flag('eli_trust'), reqText: 'He already trusts you',
          check: { attr: 'cha', diff: 7 },
          success: () => { mark('eli_3'); const s = recruit({ name: 'Eli', trait: 'quiet', skills: { farm: 1, scav: 4, build: 1, med: 1, combat: 1 } }); if (s) { setFlag('eli_joined', true); xp(25); return 'It takes an hour and half a can of peaches. At last he shrugs his backpack higher and falls into step beside you.'; } return 'He agrees, but the shelter cannot hold him.'; },
          fail: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-5); return 'He bolts back up the stairs. You hear a door slam, then a bolt. You do not see him again today, and he will not open for you.'; } },
        { label: 'Leave him be', success: () => { mark('eli_3'); setFlag('eli_lost', true); addMorale(-3); return 'You respect his choice, or tell yourself you do. You leave a can on the step. In the dark, a small shape watches you go.'; } },
      ],
    },
    {
      id: 'eli_4', title: 'Eli\'s Secret', where: ['shelter'], weight: 35, once: true,
      cond: () => flag('eli_joined') && !flag('eli_4') && later('eli_3_day', 2),
      text: 'Eli tugs your sleeve before dawn and signals for quiet. He has a way of looking at you that says he decided something in the night. "I know something," he whispers. "I have not told anyone. I want to show you."',
      choices: [
        { label: 'Follow him to the cache', success: () => { mark('eli_4'); xp(15); return 'He leads you through a drain, across a rooftop, down a ladder into a crushed pharmacy. Behind a false panel is his hoard. You take ' + give('canned', 3) + ', ' + give('batteries', 2) + ', ' + give('bandage', 2) + ', and he beams like you have knighted him.'; } },
        { label: 'Hear his story about the Tollmen', success: () => { mark('eli_4'); setFlag('tollmen_secret', true); journal('What Eli Saw', 'Eli watched the Tollmen from the rooftops for months. They hide their tolls in a dry canal under the old bridge. They fear a man called Hale, and they leave their camp thinly guarded at dawn.'); xp(20); return 'He tells you what he saw from the roofs: where the Tollmen stash their cigarettes, when they sleep, who they fear. It is a lot for a child to carry. You put a hand on his shoulder, and he lets you.'; } },
        { label: 'Tell him to rest', success: () => { mark('eli_4'); addMorale(3); return 'You tell him it can wait. He shrugs, but there is relief in it. He will tell you when he is ready, and there is no hurry.'; } },
      ],
    },

    // ---------- 2. DR. INES OKAFOR ----------
    {
      id: 'ines_1', title: 'The Lab Behind the Barricade', where: ['hospital'], weight: 30, once: true,
      cond: () => !flag('ines_1'),
      text: 'A corridor of overturned gurneys leads to a lab with a steel door, a light under it. A voice behind it says "I have a scalpel and no patience." A woman in a stained lab coat peers through a gap in the barricade. She says she is working on a cure.',
      choices: [
        { label: 'Talk to her calmly', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_1'); setFlag('ines_open', true); xp(15); return 'You talk about nothing at first, then about the Fever. By the end she opens the door a hand wide. "Dr. Ines Okafor," she says. "I need materials. Come back."'; },
          fail: () => { mark('ines_1'); xp(5); return 'She will not open the door, but she slides a list under it: chem, components. "If you can bring them, we can talk." It is something.'; } },
        { label: 'Pass a can under the door', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('ines_1'); setFlag('ines_open', true); xp(12); return 'A hand takes the can without a word. A minute later, the door opens a crack. "Chemicals," she says. "Components. Please."'; } },
        { label: 'Leave her to her work', success: () => { mark('ines_1'); xp(3); return 'You nod to the door and leave. You hear her go back to work as you walk away.'; } },
      ],
    },
    {
      id: 'ines_2', title: 'Ines\'s List', where: ['travel', 'any'], weight: 30, once: true,
      cond: () => flag('ines_1') && !flag('ines_2') && later('ines_1_day', 1) && has('chem', 3) && has('parts', 2),
      text: 'Your pack clinks. Chemicals, spare components, everything Dr. Okafor asked for. The hospital is a short detour from here, if you want it. A cure is a heavy thing to bet on, and so is a jar of acid.',
      choices: [
        { label: 'Deliver everything', success: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); xp(15); return 'She counts each item twice, and then, unexpectedly, hugs you. "I have not touched another person in four months," she says. She puts you out and closes the door.'; } },
        { label: 'Haggle for part of it', check: { attr: 'cha', diff: 5 },
          success: () => { take('chem', 2); take('parts', 1); mark('ines_2'); passTime(2); xp(10); return 'She argues, then yields. She will make do with less, and you keep a little for yourself.'; },
          fail: () => { take('chem', 3); take('parts', 2); mark('ines_2'); passTime(2); return 'She sees through you in a heartbeat and takes the lot, then slams the door a little harder than she needed to.'; } },
        { label: 'Keep your materials', success: () => { mark('ines_2'); setFlag('ines_declined', true); return 'You decide that the chemicals are worth more as chemicals. You walk on. Whatever she was working on, she will have to finish it alone.'; } },
      ],
    },
    {
      id: 'ines_3', title: 'The Vial', where: ['hospital'], weight: 35, once: true,
      cond: () => flag('ines_2') && !flag('ines_declined') && !flag('ines_3') && later('ines_2_day', 2),
      text: 'Dr. Okafor opens the door before you knock. Her eyes are red, but she is smiling. On the bench stands a single vial of clear liquid, and a dozen empty ones. "It works," she whispers. "On the rats, on me, on a dog. It works."',
      choices: [
        { label: 'Invite her to the shelter', check: { attr: 'cha', diff: 4 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); const s = recruit({ name: 'Dr. Ines Okafor', trait: 'medic', skills: { med: 5, scav: 1 } }); xp(30); if (s) { setFlag('ines_joined', true); return 'She wraps the vial in a cloth and presses it into your hand: ' + give('serum', 1) + '. Then she packs her notebooks and says "Show me where the sick people are."'; } setFlag('ines_stays', true); return 'She hands you ' + give('serum', 1) + ' and says she would go, but the shelter has no room. She will keep working here.'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(20); return 'She presses ' + give('serum', 1) + ' into your hand but will not leave her lab. "The work is not done," she says. "If you need me, I am here."'; } },
        { label: 'Let her keep researching', success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(25); return 'You tell her to stay. She nods in relief, sliding the vial across the bench: ' + give('serum', 1) + '. "I will make more," she says. "Come back in a few days."'; } },
        { label: 'Study her notes with her', check: { attr: 'int', diff: 6 },
          success: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); journal('The Okafor Formula', 'Dr. Okafor\'s serum cures early infection, not the fully turned. The key is a protein from survivors who never fell ill. She suspects Haven has the original sample, or never did.'); xp(30); return 'You spend the night over her notes. By dawn you understand what she did and why it works. She gives you ' + give('serum', 1) + ' and the first honest laugh you have heard in weeks.'; },
          fail: () => { mark('ines_3'); setFlag('serum_found', true); setFlag('ines_stays', true); xp(15); return 'The notes are beyond you. She is kind about it, and gives you ' + give('serum', 1) + ' anyway.'; } },
      ],
    },
    {
      id: 'ines_4', title: 'The Doctor\'s Gift', where: ['hospital'], weight: 28, once: true,
      cond: () => flag('ines_stays') && !flag('ines_4') && later('ines_3_day', 3),
      text: 'Dr. Okafor looks thinner but more alive. The lab smells of vinegar and boiled cloth. A tray of tiny glass vials gleams on the bench. "Fresh batch," she says. "Not the cure. But I can make antibiotics from what you brought, if you can spare time."',
      choices: [
        { label: 'Help her work for an hour', success: () => { mark('ines_4'); tire(10); passTime(1); xp(12); return 'You hold flasks and write labels. She hands over ' + give('antibiotics', 2) + ' and ' + give('bandage', 2) + '. "Thank you for believing me," she says.'; } },
        { label: 'Offer a few spare chemicals', req: () => has('chem', 1), reqText: 'Needs a chemical',
          success: () => { take('chem', 1); mark('ines_4'); xp(10); return 'She takes the jar with reverence and returns the favor: ' + give('antibiotics', 3) + ' and ' + give('painkillers', 2) + '.'; } },
        { label: 'Take what she offers and go', success: () => { mark('ines_4'); return 'She hands you ' + give('antibiotics', 1) + ' and waves you off, already bent over her microscope.'; } },
      ],
    },

    // ---------- 3. MARCUS HALE ----------
    {
      id: 'marcus_1', title: 'A Tollman in the Culvert', where: ['travel'], weight: 30, minDay: 5, once: true,
      cond: () => !flag('marcus_1'),
      text: 'A drainage culvert, a trail of dark drops leading into it. Inside, a man in a Tollmen\'s riot jacket sits with a crude bandage on his side and a pistol resting on his knee. He does not raise it. "I am not here to hurt you," he says. "I am Marcus Hale. Lieutenant. Was."',
      choices: [
        { label: 'Hear him out', check: { attr: 'cha', diff: 4 },
          success: () => { mark('marcus_1'); xp(12); return 'He speaks quietly. He served the Warden for a year, and last week he saw something he cannot unsee. He wants out. He will not say more until he is sure of you.'; },
          fail: () => { mark('marcus_1'); xp(5); return 'He says little. The hand on his pistol never quite relaxes. "Come back when you have decided whose side you are on," he mutters.'; } },
        { label: 'Take his gun and leave him', success: () => { mark('marcus_1'); setFlag('marcus_wronged', true); addMorale(-5); return 'He does not fight. You take ' + give('ammo', 4) + ' and walk off. His gaze follows you out of the culvert, steady and tired, like he expected it.'; } },
        { label: 'Walk away', success: () => { mark('marcus_1'); setFlag('marcus_lost', true); return 'You back out. This is none of your business, and a Tollman is a Tollman.'; } },
      ],
    },
    {
      id: 'marcus_2', title: 'The Price of a Defector', where: ['travel'], weight: 30, minDay: 5, once: true,
      cond: () => flag('marcus_1') && !flag('marcus_lost') && !flag('marcus_wronged') && !flag('marcus_2') && later('marcus_1_day', 1),
      text: 'Marcus is where you left him, grey-faced, the bandage soaked through. His fever is worse. "If you are going to turn me in, do it now," he says. "The Tollmen will pay well for a deserter. Or help me, and I will make it worth your while."',
      choices: [
        { label: 'Dress his wound', req: () => has('bandage', 2), reqText: 'Needs 2 bandages',
          success: () => { take('bandage', 2); mark('marcus_2'); setFlag('marcus_helped', true); xp(15); return 'You clean the wound and bind it properly. He breathes out slowly. "That is the first kindness anyone has shown me in a year," he says.'; } },
        { label: 'Treat him with a medkit', req: () => has('medkit'), reqText: 'Needs a medkit',
          success: () => { take('medkit', 1); mark('marcus_2'); setFlag('marcus_helped', true); xp(20); return 'You stitch him up in the dying light. By morning he is sitting upright and cursing the pain, which you take for a good sign.'; } },
        { label: 'Turn him in to the Tollmen', success: () => { mark('marcus_2'); setFlag('marcus_betrayed', true); setFlag('warden_trust', true); addMorale(-8); return 'You walk him to the toll road. A pair of Tollmen take him without a word and hand you ' + give('cigs', 6) + ' and ' + give('ammo', 3) + '. He does not look at you. The silence is louder than anything he could say.'; } },
      ],
    },
    {
      id: 'marcus_3', title: 'The Warden\'s Secret', where: ['travel'], weight: 32, minDay: 5, once: true,
      cond: () => flag('marcus_helped') && !flag('marcus_3') && later('marcus_2_day', 2),
      text: 'Marcus finds you on the road, standing straighter than before. "I owe you," he says. "Here is the debt. The Warden is not who he says. There is no army, no stronghold. Just forty people and a very good story. If someone called his bluff, it would all fall down."',
      choices: [
        { label: 'Take him back to the shelter', success: () => { mark('marcus_3'); setFlag('warden_secret', true); const s = recruit({ name: 'Marcus Hale', trait: 'loyal', skills: { combat: 4, scav: 1 } }); journal('The Warden\'s Bluff', 'Marcus says the Warden has no army, only forty followers and a good story. If the Tollmen ever learn how thin they are stretched, they will break.'); xp(25); return s ? 'He accepts without ceremony. He knows the Tollmen\'s routes by heart, and a fighter\'s eye for a bad wall.' : 'He wants to come but the shelter has no room. He keeps going north on his own, with a nod.'; } },
        { label: 'Press him for details', check: { attr: 'per', diff: 5 },
          success: () => { mark('marcus_3'); setFlag('warden_secret', true); journal('The Warden\'s Bluff', 'Marcus gave names, patrol hours and where the Warden sleeps. The Tollmen are thinner than they look.'); xp(25); return 'You catch every inconsistency in his story and press until it all comes out: schedules, names, the gap in the northern wall. He leaves with a pistol and a purpose. You keep ' + give('ammo', 2) + ' he left behind.'; },
          fail: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(12); return 'He tells you the big truth but dodges the specifics. It is enough, but only just.'; } },
        { label: 'Wish him luck and part ways', success: () => { mark('marcus_3'); setFlag('warden_secret', true); xp(10); return 'He tells you the secret anyway, plainly, like putting down a heavy bag. He shakes your hand and leaves for the mountains.'; } },
      ],
    },
    {
      id: 'marcus_3b', title: 'A Messenger from the Warden', where: ['travel'], weight: 28, minDay: 6, once: true,
      cond: () => flag('marcus_betrayed') && !flag('marcus_3b') && later('marcus_2_day', 2),
      text: 'A Tollman waits at the roadside with a token on a string, a square of red cloth. "The Warden remembers who helps him," he says. "He sends this. You can walk his roads without paying. Do not make us regret it."',
      choices: [
        { label: 'Accept the token', success: () => { mark('marcus_3b'); xp(10); return 'You tie the cloth to your pack. It will make some doors open and others stay shut. The Tollman hands you ' + give('cigs', 3) + ' and leaves.'; } },
        { label: 'Ask what happened to Marcus', check: { attr: 'cha', diff: 5 },
          success: () => { mark('marcus_3b'); xp(12); addMorale(-3); return 'The Tollman will not look at you. "He talked," he says. "Then he stopped talking." He gives you the token and does not say another word.'; },
          fail: () => { mark('marcus_3b'); return 'The Tollman\'s smile is slow and cold. "Mind your own business." He drops the token and leaves.'; } },
        { label: 'Throw the token back', success: () => { mark('marcus_3b'); setFlag('warden_trust', false); addMorale(2); return 'You hurl the cloth into the dirt. The Tollman shrugs, spits, and goes. You feel a little cleaner, and a little more exposed.'; } },
      ],
    },

    // ---------- 4. THE CHOIR ----------
    {
      id: 'choir_1', title: 'Bells at Midnight', where: ['street', 'any'], weight: 28, night: true, once: true,
      cond: () => !flag('choir_1'),
      text: 'A sound across the rooftops: bells, slow and many, ringing out of rhythm. In the street below, a line of figures in grey robes walks in a slow circle with lanterns. They are singing. The dead drift to the edge of the light and stand there, swaying.',
      choices: [
        { label: 'Watch from the shadows', check: { attr: 'per', diff: 4 },
          success: () => { mark('choir_1'); xp(12); return 'They call themselves the Choir. They ring bells to "call the dead home", and the dead come, and stand, and do not attack. They are not harmless, but they are not what you feared.'; },
          fail: () => { mark('choir_1'); addNoise(1); return 'A bell chimes the wrong way and a robed figure turns toward you. You back off into the dark before they can see your face.'; } },
        { label: 'Go quietly the other way', success: () => { mark('choir_1'); return 'You choose the other street. The bells follow you for an hour, soft and slow.'; } },
        { label: 'Step forward and listen', success: () => { mark('choir_1'); xp(8); addMorale(-2); return 'A woman in grey presses a candle into your hand. "You are very tired," she says kindly. "Come to the church. We will keep you safe." Her eyes are too bright.'; } },
      ],
    },
    {
      id: 'choir_2', title: 'The Choir\'s Offer', where: ['street', 'any'], weight: 30, night: true, once: true,
      cond: () => flag('choir_1') && !flag('choir_2') && later('choir_1_day', 1),
      text: 'The bells again, closer. Two Choir members step into your path with lanterns. "You were here before," says the older one. "The Choir offers shelter and food to those who come in peace. Leave your weapons at the door."',
      choices: [
        { label: 'Surrender your weapon and enter', req: () => !!myWeapon(), reqText: 'You carry no weapon to give',
          success: () => { const w = myWeapon(); take(w, 1); mark('choir_2'); setFlag('choir_inside', true); heal(15); feed(15); addMorale(5); return 'You leave your ' + itemName(w) + ' in a basket by the door. Inside, there is hot soup, a bed, and singing. Behind a curtain, someone weeps. You do not ask who.'; } },
        { label: 'Slip in and spy on them', check: { attr: 'per', diff: 6 },
          success: () => { mark('choir_2'); setFlag('choir_spy', true); xp(18); return 'You climb the rear fire escape and look through a broken window. In the cellar, a dozen frightened people are chained to pews. The Choir does not call the dead home. It collects the living.'; },
          fail: () => { mark('choir_2'); setFlag('choir_hostile', true); addNoise(2); hurt(5, 'a Choir cudgel'); return 'A lantern swings into your face. You tumble down the fire escape with a cracked rib and a wild idea of what you saw.'; } },
        { label: 'Refuse and walk on', success: () => { mark('choir_2'); return 'They do not argue. "The door is always open," the older one says. You keep walking, and the bells fade.'; } },
      ],
    },
    {
      id: 'choir_3', title: 'What the Choir Keeps', where: ['street', 'any'], weight: 34, night: true, once: true,
      cond: () => flag('choir_2') && (flag('choir_inside') || flag('choir_spy')) && !flag('choir_3') && later('choir_2_day', 1),
      text: 'The truth is simple at last. The Choir shelters the weak, then keeps them. Chained captives sing in the cellar under the church, and the Choir uses them to keep the dead calm. A woman among them looks up and mouths a single word: "Please."',
      choices: [
        { label: 'Break them out by force', success: () => FG(['raider', 'raider'], { onWin: () => {
            const a = recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } });
            const b = recruit({ name: 'Joel', trait: 'quiet', skills: { build: 2, combat: 1 } });
            mark('choir_3'); xp(25);
            return 'The Choir\'s guards fall hard. You cut the chains and lead out those who can walk. ' + ((a || b) ? 'Two of them stay with you.' : 'The shelter cannot take them, so you point them toward the river road.');
          } }) && 'You kick open the cellar door. Two armed guards in grey robes rise from their stools.' },
        { label: 'Talk the guards into letting them go', check: { attr: 'cha', diff: 6 },
          success: () => { mark('choir_3'); const a = recruit({ name: 'Nadia', trait: 'grateful', skills: { scav: 2, farm: 1 } }); xp(22); return 'You argue about mercy and bargain about faith, and at last the old woman at the door says "go." ' + (a ? 'One of the captives follows you out.' : 'The captives scatter into the night.'); },
          fail: () => { mark('choir_3'); addNoise(2); hurt(5, 'a Choir beating'); return 'They laugh. They ring the bell and you run, bruised, with the captives\' faces in your mind.'; } },
        { label: 'Join the ceremony', success: () => { mark('choir_3'); addMorale(-12); return 'You kneel with the rest, and when the bells ring, you hum with them. They give you ' + give('canned', 3) + ', ' + give('cigs', 3) + ' and ' + give('medkit', 1) + '. You do not look at the cellar door as you leave.'; } },
      ],
    },

    // ---------- 5. THE RELAY ----------
    {
      id: 'relay_1', title: 'The Relay Logbook', where: ['radiotower'], weight: 32, once: true,
      cond: () => !!flag('radio_built') && !flag('relay_1'),
      text: 'In the tower\'s base, behind a collapsed shelf, sits a metal desk with a ledger chained to it. "HAVEN RELAY STATION 3, OPERATOR LOG," the cover reads. The last entry is dated the week the world ended, written in a steady hand.',
      choices: [
        { label: 'Read it carefully', check: { attr: 'int', diff: 5 },
          success: () => { mark('relay_1'); journal('Haven Relay Log', 'The operator wrote that Haven accepts only the healthy. Every arriving convoy is inspected, and anyone with a bite, however old, is turned away at the gate. Haven\'s food stocks, he noted, were for 400 people, not 4000.'); xp(20); return 'You read it twice. Haven exists, and it is real. But the entries about the gates are cold: no bites, no exceptions, no appeals. You write down the key lines.'; },
          fail: () => { mark('relay_1'); journal('Haven Relay Log', 'I found a logbook from a Haven relay. It mentions inspections and gates. I could not read the rest in the poor light.'); xp(8); return 'The handwriting is cramped and the pages water-stained. You make out only fragments: inspections, gates, a number.'; } },
        { label: 'Skim it and loot the desk', success: () => { mark('relay_1'); xp(6); return 'You flip through, then turn to the desk. ' + give('batteries', 2) + ' and ' + give('parts', 1) + ' are in the drawer. The log goes back on its chain.'; } },
        { label: 'Pocket the book for later', success: () => { mark('relay_1'); journal('Haven Relay Log', 'I took the operator\'s logbook from the relay station. The first pages describe a working safe zone, just where the broadcast says it is.'); xp(10); return 'You break the chain with a screwdriver and tuck the logbook into your jacket. You will read it when you are warm.'; } },
      ],
    },
    {
      id: 'relay_2', title: 'The Operator Answers', where: ['radiotower'], weight: 30, once: true,
      cond: () => !!flag('radio_built') && flag('relay_1') && !flag('relay_2') && later('relay_1_day', 1),
      text: 'With the relay\'s old dishes swiveled north, your radio crackles into life. A flat voice answers on the third try: "This is Haven Relay. State your party size and condition." You can hear a long pause behind it, like a question that was never meant to be asked.',
      choices: [
        { label: 'Ask honestly about the bitten', check: { attr: 'cha', diff: 5 },
          success: () => { mark('relay_2'); setFlag('haven_truth', true); journal('Haven Answers', 'The Haven operator confirmed what the log said: no bites, no exceptions. He added quietly that the gate guards are ordered to turn away the bitten at the road, not the wall.'); xp(25); return 'The operator is silent a long moment. "No bites," he says at last. "No exceptions. I am sorry. I did not write the rule." He hangs up.'; },
          fail: () => { mark('relay_2'); xp(8); return 'The line goes cold. "State your party size and condition," the voice repeats, and nothing more.'; } },
        { label: 'Request the route to Haven', check: { attr: 'int', diff: 6 },
          success: () => { mark('relay_2'); xp(20); return 'You recite the log\'s call signs back to him. He sighs and gives you a route: ' + give('haven_map', 1) + ' is coming over the wire, in a cipher you somehow solve.'; },
          fail: () => { mark('relay_2'); return 'He asks for a call sign you do not have, and then the line goes dead.'; } },
        { label: 'Say nothing and listen', success: () => { mark('relay_2'); xp(10); return 'You keep the mic closed. After a minute, the operator asks "Is anyone there?" in a very different voice. Then, softly: "If you are coming, do not be bitten." Click.'; } },
      ],
    },
    {
      id: 'relay_3', title: 'The Last Page', where: ['radiotower'], weight: 28, once: true,
      cond: () => !!flag('radio_built') && flag('relay_2') && !flag('relay_3') && later('relay_2_day', 1),
      text: 'You find the last page of the operator\'s log in the desk, folded small. It says the road to Haven is long, the northern pass is barely open, and that "if the gates ever close, there will be nothing left to open them for." It ends mid-sentence.',
      choices: [
        { label: 'Believe it all', success: () => { mark('relay_3'); setFlag('haven_truth', true); journal('The Last Page', 'The operator ends with a warning: the northern pass is narrow, the gates may close, and Haven is no promise. Whatever I decide, I must decide with open eyes.'); xp(25); addMorale(-4); return 'You fold the page and put it away. Haven is real and it is cruel and it may not be enough. The weight of it settles on your shoulders.'; } },
        { label: 'Doubt it', success: () => { mark('relay_3'); journal('The Last Page', 'I found one more page of the operator\'s log. He sounds scared. I will wait to judge.'); xp(10); return 'A scared man wrote that, you tell yourself. You tuck the page away and say nothing to anyone.'; } },
        { label: 'Burn it', success: () => { mark('relay_3'); addMorale(3); return 'You hold the page over a lighter until it curls. Some hope is easier to carry when it is not argued with.'; } },
      ],
    },

    // ---------- 6. TEODOR AND BISCUIT ----------
    {
      id: 'teodor_1', title: 'Man With a Shotgun and a Dog', where: ['farm'], weight: 30, minDay: 2, once: true,
      cond: () => !flag('teodor_1'),
      text: 'A shotgun barrel rises over a half-fallen fence, followed by a pair of watery eyes and a white beard. A scruffy dog stands beside him, wagging its tail in defiance of the situation. "That is as far as you go," says the old man. "This is my land. My name is Teodor. That is Biscuit. We are not leaving."',
      choices: [
        { label: 'Offer to mend his fence', req: () => has('wood', 2), reqText: 'Needs 2 wood',
          success: () => { take('wood', 2); mark('teodor_1'); setFlag('teodor_trust', true); xp(12); return 'He watches you nail boards for an hour, grunting at each one. At the end he says "that will do" and Biscuit licks your hand.'; } },
        { label: 'Argue that he should leave', check: { attr: 'cha', diff: 5 },
          success: () => { mark('teodor_1'); xp(10); return 'He does not leave, but he stops pointing the gun. "Come back if you want," he says. "I have coffee. Of a sort."'; },
          fail: () => { mark('teodor_1'); addMorale(-2); return 'He cocks the shotgun and the argument ends. "Off my land," he says. Biscuit looks apologetic.'; } },
        { label: 'Leave a can on the gatepost', req: () => has('canned'), reqText: 'Needs canned food',
          success: () => { take('canned', 1); mark('teodor_1'); setFlag('teodor_trust', true); xp(10); return 'You set it down and step back. He grunts. When you look back from the road, the can is gone and the dog is watching you.'; } },
      ],
    },
    {
      id: 'teodor_2', title: 'Smoke on the Farm', where: ['farm'], weight: 32, minDay: 3, once: true,
      cond: () => flag('teodor_1') && !flag('teodor_2') && later('teodor_1_day', 2),
      text: 'A column of smoke rises from Teodor\'s barn. Two raiders are dragging out sacks of grain while the old man crouches behind a trough, firing blindly. Biscuit is hurt, whimpering in the yard.',
      choices: [
        { label: 'Fight the raiders', success: () => FG(['raider', 'raider'], { onWin: () => { mark('teodor_2'); setFlag('teodor_helped', true); setFlag('teodor_trust', true); xp(20); return 'The raiders fall. Teodor sits down heavily in the dust, shaking. "Well," he says. "Damn it." Biscuit licks your boot.'; } }) && 'You charge across the yard before the raiders see you.' },
        { label: 'Tend to Biscuit first', req: () => has('bandage'), reqText: 'Needs a bandage',
          success: () => { take('bandage', 1); mark('teodor_2'); setFlag('teodor_helped', true); setFlag('teodor_trust', true); xp(15); return 'You bind the dog\'s leg while Teodor fights alone. The raiders run when the shotgun finds one of them. The old man weeps over the dog and does not hide it.'; } },
        { label: 'Stay back and let it play out', success: () => { mark('teodor_2'); addMorale(-4); return 'You watch from the hedge. The raiders leave with half the grain. Teodor does not see you, and he does not forgive the empty road.'; } },
      ],
    },
    {
      id: 'teodor_3', title: 'The Last Stand', where: ['farm'], weight: 36, minDay: 4, once: true,
      cond: () => flag('teodor_2') && !flag('teodor_3') && later('teodor_2_day', 2),
      text: 'Teodor is sitting on his porch with the shotgun across his knees, boots on, Biscuit at his feet. "They are coming back," he says calmly. "More of them. I counted the tracks. I am too old to run, and you are welcome to run, if you want."',
      choices: [
        { label: 'Convince him to leave with you', check: { attr: 'cha', diff: 6 },
          success: () => { mark('teodor_3'); const s = recruit({ name: 'Teodor', trait: 'grumpy', skills: { farm: 5, build: 1, combat: 1 } }); if (s) { setFlag('teodor_joined', true); xp(30); return 'He looks at the fields a long time. "They were good years," he says. He takes the shotgun, the dog, a jar of seeds, and does not look back at the farm.'; } setFlag('teodor_dead', true); return 'He would come, but there is no room at the shelter. He stays, and you leave with a heavy heart.'; },
          fail: () => { mark('teodor_3'); setFlag('teodor_dead', true); return 'He shakes his head slowly. "A man dies where he stands," he says. You cannot argue it down, and you cannot stay. You leave him on the porch.'; } },
        { label: 'Stand with him', success: () => FG(['raider', 'raider', 'raider'], { onWin: () => { mark('teodor_3'); setFlag('teodor_dead', true); setFlag('teodor_helped', true); xp(25); return 'They fall one by one, but the old man takes a bullet to the chest. He dies on his porch with Biscuit in his lap, whispering something about rain.'; } }) && 'You sit down beside him. The raiders arrive at dusk, and the yard fills with smoke.' },
        { label: 'Leave him to it', success: () => { mark('teodor_3'); setFlag('teodor_dead', true); setFlag('teodor_abandoned', true); addMorale(-8); return 'You tip your hat and walk away. Shots echo across the fields an hour later, then silence.'; } },
      ],
    },
    {
      id: 'teodor_4', title: 'The Seed Jar', where: ['farm'], weight: 28, once: true,
      cond: () => flag('teodor_dead') && !flag('teodor_4') && later('teodor_3_day', 1),
      text: () => flag('teodor_abandoned')
        ? 'The farm is quiet. Teodor lies under a blanket on the porch, Biscuit curled against him, refusing to leave. A mason jar of seeds sits on the rail with a note: "For whoever has the sense to plant them."'
        : 'The farm is quiet. A freshly dug grave sits under the apple tree. Biscuit lies across it, a mason jar of seeds beside him, a note tied to the lid: "For whoever has the sense to plant them."',
      choices: [
        { label: 'Take the seeds and bury him properly', success: () => { mark('teodor_4'); const full = !flag('teodor_abandoned'); xp(full ? 30 : 15); addMorale(full ? 5 : -2); return 'You dig and fill and say a few words you half remember. ' + give('veg', full ? 6 : 3) + ' from the garden he never stopped tending. Biscuit follows you to the gate, then stops and watches you go.'; } },
        { label: 'Share your food with Biscuit', req: () => has('canned') || has('snack'), reqText: 'Needs food',
          success: () => { if (!take('snack', 1)) take('canned', 1); mark('teodor_4'); xp(15); addMorale(5); return 'The dog eats like he has not in days. You take ' + give('veg', 3) + ' from the garden. He licks your hand, once, and returns to the grave.'; } },
        { label: 'Say a word and go', success: () => { mark('teodor_4'); addMorale(2); return 'You stand a minute with your hat in your hand. Then you take ' + give('veg', 2) + ' from the garden, because Teodor would not want it to rot.'; } },
      ],
    },
  ];
})();
