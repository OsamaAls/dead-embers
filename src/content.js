/* Dead Embers - narrative content.
   story[id].beats: 1-4 short lines shown in play ({who, line}; who '' = narration). story[id].paras: the long version for the journal.
   lore[i].short: one line for an in-world popup/toast; lore[i].text: the full note for the journal.
   radio: one short line per day (shown in the morning summary once the radio is built). */
(function () {
  var story = {
    intro: {
      title: "The Bunker",
      beats: [
        { who: '', line: "Fourteen months since the Grey Fever. The bunker is quiet, {name}. Your throat is dry." },
        { who: '', line: "Find water and food up top." }
      ],
      paras: [
        "You wake on a steel cot in a metro maintenance bunker, with a taste like old pennies in your mouth. The ceiling has cracked since you last looked. Dust sifts down in the light of one dying lamp.",
        "It has been fourteen months since the Grey Fever reached Ardent Vale. You remember the sirens, then the silence, then the first time you saw a neighbour walk the wrong way down the street. Nobody has come down these stairs in a long time.",
        "Above you, the dead shuffle through the city. Down here you have a locked door, a handful of tools and nobody to talk to, {name}.",
        "Your throat is dry and your stomach is a fist. Find water and food before you do anything else."
      ]
    },
    first_night: {
      title: "First Night",
      beats: [
        { who: '', line: "Something drags across the concrete overhead. Stops. Drags again." },
        { who: 'Radio', line: "\"...north of the mountains. Haven is... repeat, Haven is...\"" },
        { who: '', line: "Static. You say the word once, quietly. Haven." }
      ],
      paras: [
        "The dark down here is total once the lamp is off. Above you something drags across the concrete, stops, and drags again. You hold your breath until your ears ring.",
        "Around midnight a sound comes from the shelf by the door, a hiss like a kettle. The old radio is awake, or something inside it is.",
        "Through the static you catch half a sentence in a woman's voice. '...north of the mountains. Haven is... repeat, Haven is...' Then it cuts out and the hiss is all that is left.",
        "You lie awake and say the word once, quietly. Haven."
      ]
    },
    radio_found: {
      title: "The Dead Radio",
      beats: [
        { who: '', line: "The old shortwave is army surplus. Three parts are dead: coil, antenna, power cell." },
        { who: '', line: "Coil: Tower Blocks or Volt & Co. Antenna: KVAL Radio Tower. Cell: Precinct 9 or Volt & Co." },
        { who: '', line: "Find them. Build the radio. Find out who's talking." }
      ],
      paras: [
        "You pull the radio into the lamplight and unscrew the back. The casing is military surplus, heavy and well built. Inside, three things are wrong with it.",
        "The tuning coil is burnt through. The antenna lead ends in a stub of wire. The power cell has swollen like a dead toad.",
        "You need a coil from the Tower Blocks or Volt & Co., a long antenna from the KVAL Radio Tower, and a power cell, which Precinct 9 or Volt & Co. might still have. Find the parts and build the Radio."
      ]
    },
    radio_fixed: {
      title: "A Voice Answers",
      beats: [
        { who: '', line: "You seat the cell, turn the dial and say your name into the static." },
        { who: 'Mara Voss', line: "\"This is Haven. Mara Voss, radio operator. I hear you. Stay on the line.\"" },
        { who: 'Mara Voss', line: "\"Show me a community: four people with you, and walls worth the name. Then I send the road.\"" }
      ],
      paras: [
        "You solder the last joint, seat the cell and turn the dial with a hand that will not stay still. The speaker crackles. You say your name into the microphone, {name}, and ask if anyone is there.",
        "A pause long enough to hurt. Then a woman, dry and tired and real. 'This is Haven. Mara Voss, radio operator. I hear you. Stay on the line.'",
        "Haven exists. It sits beyond the northern mountains, behind walls and a working generator. Mara will send coordinates, but only to a group that can prove it is organised: four survivors besides you, and barricades worth the name.",
        "'We have been burned by people who walk in alone and desperate,' she says. 'Show me you are a community and I will show you the road.'"
      ]
    },
    tollmen_demand: {
      title: "The Tollmen Call",
      beats: [
        { who: '', line: "A man in a stitched leather coat at your gate, hands open. Four behind him, hands not open." },
        { who: 'Tollman', line: "\"The Warden runs the east side. Everyone inside his lines pays the toll.\"" },
        { who: 'Tollman', line: "\"Your name's already in the ledger. He likes to be paid on time.\"" }
      ],
      paras: [
        "A man in a stitched leather coat stands at your gate with his hands open. Four others wait behind him with their hands very much not open. He calls himself a messenger and says it politely.",
        "The Warden runs the east side of the city. Before the Fever he was a prison guard, and he still believes in rules, schedules and a ledger. Every shelter that breathes inside his territory owes a toll.",
        "The messenger taps a page in a small book. Your name is already written there. 'He likes to be paid on time,' he says. 'He is much less pleasant when he has to come and collect.'"
      ]
    },
    haven_coords: {
      title: "The Road North",
      beats: [
        { who: 'Mara Voss', line: "\"A horde is coming south. Tens of thousands. Through the Vale in about twelve days.\"" },
        { who: 'Mara Voss', line: "\"There's a school bus at the depot. It needs engine parts and six cans of fuel.\"" },
        { who: 'Mara Voss', line: "\"The route map through the pass is at Checkpoint Echo. Hide, hold, or be gone.\"" }
      ],
      paras: [
        "Mara Voss reads the coordinates twice, slowly, and you write them on the wall in grease pencil. Then her voice changes. 'There is something you need to know. A horde is moving south, tens of thousands, a river of them. Our scouts say it will pass through Ardent Vale in about twelve days.'",
        "You ask if it can be turned. She does not answer right away. 'No. You can hide from it, hold against it, or be somewhere else.'",
        "There is an old school bus at the Bus Depot, she says, one of the few vehicles left whole. It needs engine parts and six cans of fuel. The army left a route map through the pass at Checkpoint Echo, if nobody has burned it for warmth.",
        "Twelve days. You write that on the wall too, under the coordinates."
      ]
    },
    horde_warning: {
      title: "The Horizon Moves",
      beats: [
        { who: 'Lookout', line: "\"Look north.\" The skyline is the wrong colour. And it's moving." },
        { who: '', line: "Not smoke. Not weather. The dead. A few days, maybe less." }
      ],
      paras: [
        "The lookout comes down the ladder without speaking and just points. You climb up and look north. The skyline is the wrong colour, a brown haze that shifts as you watch.",
        "It is not smoke or dust or weather. It is the dead, so many that the distance itself seems to crawl.",
        "You count the days on your fingers and then count again. There is less time than you thought."
      ]
    },
    bus_ready: {
      title: "The Bus Runs",
      beats: [
        { who: '', line: "The engine catches on the fourth try. Someone laughs. Then everyone does." },
        { who: '', line: "Forty seats, a full tank, and the road north open. For now." }
      ],
      paras: [
        "The engine catches on the fourth try and shakes the whole depot. Someone laughs, a short cracked sound, and then everyone is laughing. It is the first engine you have heard in more than a year.",
        "You fill the tank and check the tyres. There are forty seats and a roof rack, and the road north is open, for now.",
        "The bus is ready. The choice that comes with it is the hard part."
      ]
    },
    final_choice: {
      title: "The Night Before",
      beats: [
        { who: '', line: "Nobody sleeps. The horde hums through the concrete like a train that never arrives." },
        { who: '', line: "Run for Haven. Hold the bunker. Or ask the Warden to stand with you." },
        { who: '', line: "Your people are looking at you, {name}." }
      ],
      paras: [
        "Nobody sleeps. You can feel the horde through the floor, a low shiver in the concrete like a train that never arrives. The lamp swings a little on its cord.",
        "You can load the bus and drive for Haven before dawn, leaving the city and everything you built in it. You can stay behind your walls and fight with everything you have. Or you can walk across the dead ground to the Warden, a man you hate, and ask him to stand beside you.",
        "Your people look at you, {name}. Whatever you say now, they will do."
      ]
    },
    end_haven: {
      title: "Haven",
      beats: [
        { who: '', line: "The bus crests the pass at dusk. Below: a valley with lights in it. Real lights, in rows." },
        { who: 'Mara Voss', line: "\"Welcome to Haven.\" She counts heads, and doesn't make you say the missing names." },
        { who: '', line: "You made it, {name}. Tonight, nobody keeps watch." }
      ],
      paras: [
        "The convoy climbs through the pass at dusk with the horde a smear of brown in the mirrors behind it. The bus coughs, holds, and crests the ridge. Below you is a valley with lights in it, real lights, in rows.",
        "Mara Voss meets you at the gate in a patched coat, smaller than her voice. She counts heads as you step down. Not everyone you started with is on the bus, and she does not make you say their names, though you say them anyway.",
        "Haven is not paradise. There are queues for water, arguments about work shifts and a wall that needs mending. But the children sleep without anyone keeping watch, and you stand in the cold air and listen to nothing at all.",
        "You made it, {name}. The weight does not leave you, but it begins to shift."
      ]
    },
    end_stand: {
      title: "Dawn on the Wall",
      beats: [
        { who: '', line: "The horde breaks on your walls all night. At first light, it flows past." },
        { who: '', line: "Your people sit along the parapet, grey-faced and alive." },
        { who: '', line: "You didn't run, {name}. You built something that lasts." }
      ],
      paras: [
        "The horde breaks against the walls all night. You hold the line with spears, bolts, and the last of the shells, and every hour someone hands you water without being asked.",
        "At first light the sound thins. The dead keep moving, but they are moving past you now, drawn on toward whatever lies south. The street outside is a field of ruin and the walls are still standing.",
        "You climb up and look over it. Your people sit along the parapet grey-faced and alive.",
        "You did not run, {name}. You built something that lasts, and the city will have to learn to live around it."
      ]
    },
    end_stand_fail: {
      title: "The Walls Break",
      beats: [
        { who: '', line: "The north gate groans, splits, and the dead pour through shoulder to shoulder." },
        { who: '', line: "Someone you know calls your name, {name}. Then the lamp goes out." }
      ],
      paras: [
        "It starts with a groan from the north gate, then a split of timber, then the sound you have been dreading for fourteen months. The dead pour through the gap shoulder to shoulder.",
        "You fight from the stairwell, then the bunker door, then the dark between. There are too many, and they do not tire.",
        "Somewhere in the noise you hear someone you know call your name, {name}. Then the lamp goes out."
      ]
    },
    end_alliance: {
      title: "The Ledger and the Wall",
      beats: [
        { who: 'The Warden', line: "\"One night. Then we renegotiate.\" He strikes a line through your debts." },
        { who: '', line: "Tollmen and your people hold the east bridge together. Dawn finds both standing." },
        { who: '', line: "Not the world you wanted, {name}. But a world, and part of it is yours." }
      ],
      paras: [
        "The Warden listens to your proposal without blinking, then opens his ledger and strikes a line through a column of debts. 'One night,' he says. 'Then we renegotiate.'",
        "His Tollmen and your people hold the east bridge together. When the horde breaks, you fight shoulder to shoulder with men who robbed you last month. Dawn finds both groups standing, bloody and exhausted and still wary.",
        "The peace that follows is uneasy. The Warden's rules remain, and so does your say in them. You have a council, a ledger, and a city to hold.",
        "It is not the world you wanted, {name}. But it is a world, and you are in charge of a piece of it."
      ]
    },
    end_alliance_fail: {
      title: "A Matter of Accounts",
      beats: [
        { who: 'The Warden', line: "\"You're a good manager. I'll keep your things in order.\"" },
        { who: '', line: "The gate shuts behind you. The alliance was a loan, {name}. He called it in early." }
      ],
      paras: [
        "The Warden lets you in through the gate himself and smiles like a man who has had the same thought all week. The Tollmen close in without a word. Your people are behind you, and so are the dead, and he has chosen which of you to deal with first.",
        "'You are a good manager,' he says, almost kindly. 'I will keep your things in order.'",
        "You understand too late that an alliance with a man like him was only ever a loan. He called it in early, {name}."
      ]
    },
    death: {
      title: "The Embers Go Out",
      beats: [
        { who: '', line: "The street is cold under your cheek. Somewhere a radio hisses. No one answers." },
        { who: '', line: "Fourteen months, {name}. The dead didn't need a fifteenth." }
      ],
      paras: [
        "The world narrows to the sound of your own breathing and then not even that. The street is cold under your cheek.",
        "Somewhere a radio hisses. No one answers it.",
        "Fourteen months, {name}, and the dead did not need a fifteenth."
      ]
    },
    abandoned: {
      title: "Empty Rooms",
      beats: [
        { who: '', line: "The cots are made. The cups are washed. Nobody is left to use them." },
        { who: '', line: "You lasted longer than most, {name}. There was no one to share it with." }
      ],
      paras: [
        "The bunker is quiet. The cots are made and the cups are washed, and there is no one left to use any of them.",
        "You lasted longer than most. In the end that did not matter, because there was no one to share it with."
      ]
    }
  };

  var lore = [
    { title: "Diary of a Nurse, Day 3", short: "\"The ones who got up again did not look at us the way sick people do.\"", text: "They told us it was a flu. By noon the ward was full and by evening half of them had stopped answering. The ones who got up again did not look at us the way sick people do. I am writing this in the supply closet with the door held shut." },
    { title: "CDC Memo 114-A", short: "Grey Fever: bites and scratches. Hours to two days. Containment has failed.", text: "The Grey Fever is spread by contact with infected fluids, including bites and scratches. Incubation ranges from several hours to two days. Once core temperature drops below thirty degrees, cognitive function is not recoverable. Containment protocols have failed in all major districts." },
    { title: "The Last Log of Sergeant Okafor", short: "\"Tell my wife I walked home. I did not, but tell her anyway.\"", text: "We held the bridge for nine hours. The lieutenant is gone, the radio is gone, and I am down to six rounds. If anyone finds this, tell my wife I walked home. I did not, but tell her anyway." },
    { title: "A Child's Drawing", short: "Crayon stick figures under a yellow sun: MOM DAD ME BEN. NO MONSTERS.", text: "Crayon on the back of a pharmacy flyer. Four stick figures hold hands under a yellow sun, and one has a bigger scribble for hair. Across the bottom, in wobbly letters, it says 'MOM DAD ME BEN. NO MONSTERS.' The paper is soft from being folded." },
    { title: "Tollmen Ledger, Page 12", short: "Neat rows of tolls paid and owed. At the bottom: 'The Warden is always right.'", text: "Row after row of neat handwriting. 'Apt block on Fenner, 5 cigs, paid. Bakery cellar, 8 canned, short 2, visited. Bridge crossing, 4 cigs, paid.' At the bottom someone has written, in a different hand, 'The Warden is always right.'" },
    { title: "Field Note on Bloaters", short: "Bloaters: never pop one in a closed room. The gas will floor you.", text: "Some infected swell with gas as the fever advances. They look slow and harmless. Do not kill them in a closed space. Their burst releases a cloud that will make anyone nearby violently ill." },
    { title: "Field Note on Screamers", short: "Screamers: their cry carries for blocks. Kill them before they finish.", text: "A small number of infected cry out when they spot the living. The sound carries for blocks and the dead come to it. If you hear one, go quiet, go low, and do not light a fire." },
    { title: "Scrawled on a Wall in Red Paint", short: "HAVEN IS REAL. NORTH OF THE MOUNTAINS. Underneath: 'It was real when I wrote this.'", text: "HAVEN IS REAL. NORTH OF THE MOUNTAINS. WALLS, POWER, FOOD. FOLLOW THE RAILWAY TO THE PASS. Beneath it someone has added in black marker, 'It was real when I wrote this.'" },
    { title: "Pharmacist's Note", short: "\"Antibiotics won't cure a bite. Taken early, they buy time. Share them.\"", text: "Taped to a shuttered counter. 'If you are bitten, antibiotics will not cure you. But a full course early may slow the infection enough for someone to act. Do not hoard them. If you find any, share them.'" },
    { title: "Supermarket Manager's Memo", short: "\"Do not unlock the doors for anyone. This includes family.\"", text: "Staff are to lock the doors at closing and not unlock them for anyone. This includes family. Perishables in the walk-in are to be left alone. I mean it. Some of that stock has been turning for three days and I do not want to know how." },
    { title: "Radio Operator's Log", short: "\"Forty days broadcasting. No reply. Spare antenna in the tower shed.\"", text: "I have been broadcasting on this frequency for forty days. No one has replied, but the batteries still hold. If someone hears this, the tower has a spare antenna in the maintenance shed. Take it and go." },
    { title: "Bus Depot Work Order", short: "Bus 14: engine overhaul, parts on order. The inspection was never signed.", text: "Bus 14 is down for engine overhaul. Parts are on order. Fuel is in the underground tank, key with the foreman. Do not release the vehicle until the inspection is signed. The inspection never was." },
    { title: "Letter to a Daughter", short: "\"The key is under the geranium. I went to find you. I will keep looking.\"", text: "I am leaving this on your bed in case you come back. The key is under the geranium. There is water in the tub and tins in the cupboard. I went to find you and I will keep looking." },
    { title: "Rooftop Gardener's Note", short: "\"If you're hungry, take half and leave half. The roots will recover.\"", text: "Tomatoes are coming in. Beans are slow. The crows keep trying for the seedlings. If you are reading this and you are hungry, take half and leave half. The roots will recover if you leave the stems." },
    { title: "Warden's Rules, Posted at the Toll Bridge", short: "Rule four: do not make the Warden repeat himself.", text: "One. Pay on the first of the month. Two. No weapons past the barrier. Three. Questions are answered at the Warden's discretion. Four. Do not make the Warden repeat himself." },
    { title: "Evacuation Notice", short: "\"Proceed calmly to the stadium.\" Trodden into the mud by thousands of feet.", text: "Residents of the Vale are asked to proceed calmly to the stadium. Bring documents, medicine and one bag. Do not stop for others. The stadium was never reached, and the notice has been trodden into the mud by thousands of feet." },
    { title: "Scavenger's Tip", short: "\"People hide what matters in the same dumb places.\"", text: "Scratched into the side of a locker. 'Check the cabinet above the fridge, the tile behind the stove, and the toolbox in the trunk. People hide what they think matters in the same dumb places.'" },
    { title: "Scientist's Last Voicemail", short: "\"The horde isn't random. Something is pulling them south.\"", text: "Transcript. 'If this reaches anyone, the horde is not random. They follow noise and warmth and they follow each other. Something is pulling them south. I do not know what it is, and I think I do not want to.'" }
  ];

  var radio = [
    "\"...this is Haven. Follow the railway north to the pass. We have room. Repeat, we have room...\"",
    "Static, a long tone, then someone counting backwards from ten. They stop at three.",
    "\"Any station. Family of four at the water tower. Our kid has a fever. Not infected. Please.\"",
    "\"East side crossing closed until further notice. Pay at the barrier. This is the Warden's office.\"",
    "\"Haven calling Ardent Vale. We can hear you. We can't reach you. Keep trying.\"",
    "\"Fifty of them crossed the ring road at dusk, heading south. Don't go out tonight.\"",
    "\"This is a recorded message. Do not approach the hospital. Do not approach the hospital. Do not...\"",
    "\"Tollmen are reminded the tax rises at the new moon. Anyone holding back will be visited.\"",
    "\"Mara Voss, Haven. We have a doctor and room for a dozen more. We'll leave a light on.\"",
    "\"Something big on the highway at mile fourteen. Not a walker. Too slow, too loud. Stay clear.\"",
    "\"The whole north horizon is moving, you hear me? Get out of the city while you can.\"",
    "A child, whispering: \"Mommy says don't talk to the radio. But I think someone's there.\""
  ];

  var names = {
    first: [
      "Amara", "Dmitri", "Lucia", "Kenji", "Fatima", "Tomas", "Ingrid", "Rashid", "Mei", "Joaquin",
      "Nadia", "Obinna", "Sven", "Priya", "Mateo", "Yuki", "Hassan", "Elena", "Kofi", "Anya",
      "Marcus", "Zainab", "Pavel", "Chloe", "Ravi", "Beatriz", "Idris", "Hana", "Declan", "Sofia",
      "Tariq", "Greta", "Emeka", "Lena", "Santiago", "Mina", "Omar", "Freya", "Dario", "Leila",
      "Jonas", "Adaeze", "Viktor", "Noor", "Carmen"
    ],
    last: [
      "Okoye", "Petrov", "Tanaka", "Moreno", "Haddad", "Lindqvist", "Nowak", "Silva", "Chen", "Abara",
      "Kowalski", "Reyes", "Dubois", "Singh", "Mbeki", "Ferreira", "Andersen", "Kim", "Rossi", "Hamid",
      "Volkov", "Santos", "Nakamura", "Doyle", "Ibrahim", "Larsen", "Costa", "Bakr", "Weiss", "Ortega",
      "Njoroge", "Park", "Bianchi", "Farouk", "Marsh"
    ]
  };

  var barks = {
    hardworker: ["Give me something to carry.", "Idle hands get us killed. What needs doing?", "Done early. What's next?"],
    lazy: ["Is this really necessary today?", "After a rest. A long rest.", "Someone else is better at this. Honestly."],
    glutton: ["Any more of those peaches?", "I could eat the wall if it were seasoned.", "Seconds? Asking for a friend."],
    brave: ["I'll take first watch. Go sleep.", "They bleed like anyone. I'll go.", "Anything through that door meets me first."],
    cheerful: ["Look at that sunrise. We got another one.", "We have soup. Soup is practically a victory.", "Nobody laughed at my joke. It was good."],
    sickly: ["Chest hurts again. I'm fine.", "Sorry. Need to sit a minute.", "Don't catch this. Whatever it is."],
    scavenger: ["I know a place nobody's picked over.", "There's always something left behind.", "Found a good boot. Just the one, but good."],
    medic: ["Let me look at that before it gets worse.", "Clean bandages are worth more than gold.", "Rest. I mean it. You're about to fall over."],
    grumpy: ["Who left this mess? Not me.", "Don't look at me like that.", "Every plan has a hole. I'm the one who finds it."],
    quiet: ["...", "Heard something outside. Probably nothing.", "I'll be in the corner."],
    hungry: ["My stomach is eating itself.", "We need food. Soon.", "Can't think straight. When do we eat?"],
    thirsty: ["Mouth like sand. Any water?", "Just a sip. One sip.", "Water. Please. Anything wet."],
    lowmorale: ["What's the point of any of this?", "I hear them even when it's quiet.", "I don't know how much longer I can do this."],
    happy: ["Slept well, for once.", "We're going to make it. I can feel it.", "This place feels like home, you know?"]
  };

  function sName(s) { return s && s.name ? s.name : 'someone'; }
  var FG = function (ids, opts) { fight(ids, opts); return true; };
  // Hurts, but never kills.
  var sore = function (n, cause) { return hurt(Math.max(0, Math.min(n, G.p.hp - 10)), cause); };

  /* Shelter events: rolled in the morning at the bunker (engine dailyTick). Physical ones are played. */
  var shelterEvents = [
    {
      id: 'sh_scratching', title: 'Scratching at the Wall', where: ['shelter'], weight: 14, minDay: 2, night: true,
      text: 'Nails on plywood at the barricade. Slow, patient. Then a second set joins in.',
      play: { type: 'horde', foes: ['walker', 'walker'],
        onWin: function () { xp(8); return 'Two fewer. The barricade holds.'; },
        onLose: function () { var b = damageBuilding(); addMorale(-5); return b ? 'They claw at it till dawn. The ' + b + ' takes the damage.' : 'They claw at it till dawn. Nobody sleeps.'; } }
    },
    {
      id: 'sh_fence', title: 'At the Fence', where: ['shelter'], weight: 12, minDay: 3, night: false,
      text: 'Three of the dead at the yard fence, rattling the wire. They\'ll have it down by noon.',
      play: { type: 'horde', foes: ['walker', 'walker', 'runner'],
        onWin: function () { xp(10); return 'The wire stops rattling. Their pockets: ' + give('scrap', 1) + '.'; },
        onLose: function () { var b = damageBuilding(); return b ? 'They get through. The ' + b + ' takes a beating.' : 'They get through the wire before they wander off.'; } }
    },
    {
      id: 'sh_turning', title: 'The Hidden Bite', where: ['shelter'], weight: 8, minDay: 5, once: true, night: true,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._turning = s;
        return sName(s) + ' kept one sleeve down all week. Tonight: a soaked rag on the floor, glassy eyes in the corner.';
      },
      choices: [
        { label: 'Put them down',
          success: function () {
            var s = G.flags._turning;
            if (!s) return 'The cot is empty. You stand there a long time.';
            killSurvivor(s, 'turned'); addMorale(-12);
            return 'Quick and quiet, by your own hand. Nobody speaks at breakfast.';
          } },
        { label: 'Lock them in the signal room', check: { attr: 'int', diff: 6 },
          success: function () { var s = G.flags._turning; xp(15); addMorale(-3); return 'You brace the door with a pipe. By morning ' + sName(s) + '\'s fever eases. It didn\'t take.'; },
          fail: function () { var s = G.flags._turning; if (s) killSurvivor(s, 'turned'); sore(10, 'a bite'); addMorale(-12); return 'Around four the door cracks open. You put ' + sName(s) + ' down with a bite on your arm.'; } },
        { label: 'Give them antibiotics', req: function () { return has('antibiotics'); }, reqText: 'Needs antibiotics',
          success: function () { var s = G.flags._turning; take('antibiotics', 1); addMorale(5); xp(20); return sName(s) + ' takes the pills with shaking hands. By morning the fever breaks.'; } }
      ]
    },
    {
      id: 'sh_newcomer', title: 'Stranger at the Gate', where: ['shelter'], weight: 10, minDay: 3, night: false,
      cond: function () { return G.survivors.length < 8; },
      who: 'Stranger',
      text: '"Two days walking. Heard there\'s a place down here that isn\'t on fire."',
      choices: [
        { label: 'Talk them into joining', check: { attr: 'cha', diff: 5 },
          success: function () { var s = recruit(); xp(10); return sName(s) + ' steps through the gate and lets out a year\'s worth of breath. "Whatever you need."'; },
          fail: function () { return 'Right words, wrong tone. They look at the dark bunker and walk on.'; } },
        { label: 'Ask what they can do',
          success: function () { var r = give('canned', 1); var s = recruit(); return 'Dried fruit, rope, a first aid pouch, steady hands. ' + sName(s) + ' is in. ' + r + '.'; } },
        { label: 'Send them away',
          success: function () { addMorale(-2); return 'No argument. You watch them go until the street swallows them.'; } }
      ]
    },
    {
      id: 'sh_fire', title: 'Fire in the Storage', where: ['shelter'], weight: 8, minDay: 3, night: true,
      text: 'Smoke under the storage door. A crate of rags is burning, and the shelves above it are starting to go.',
      play: { type: 'dodge', waves: 3, dmg: [4, 8],
        onWin: function () { xp(8); return 'You beat it out with a wet blanket. Scorched shelves, whole stock.'; },
        onLose: function () { take('wood', 2); take('cloth', 2); return 'It\'s out. It took skin, wood and cloth with it.'; } }
    },
    {
      id: 'sh_theft', title: 'Missing Supplies', where: ['shelter'], weight: 9, minDay: 4,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._thief = s;
        return 'Cans and smokes gone from the shelf. Nobody saw a thing. ' + sName(s) + ' is chewing very slowly.';
      },
      choices: [
        { label: 'Confront them calmly', check: { attr: 'cha', diff: 5 },
          success: function () { var r = give('canned', 1); xp(8); return sName(G.flags._thief) + ' breaks, red-faced, and puts it back. ' + r + '.'; },
          fail: function () { addMorale(-5); return sName(G.flags._thief) + ' denies it, loudly. Soon you\'re both shouting. The food stays gone.'; } },
        { label: 'Let it go this time',
          success: function () { take('canned', 1); addMorale(-2); return 'A few cans aren\'t worth a war. The others notice you noticing.'; } },
        { label: 'Search every bag',
          success: function () { var r = give('cigs', 2); addMorale(-6); return 'The smokes are in ' + sName(G.flags._thief) + '\'s boot. ' + r + '. The trust you spent won\'t come back soon.'; } }
      ]
    },
    {
      id: 'sh_outbreak', title: 'Fever in the Rooms', where: ['shelter'], weight: 8, minDay: 4,
      cond: function () { return G.survivors.length > 0; },
      text: 'Three people wake with chills. Not the Fever. A stomach bug, probably the water. It will go through everyone.',
      choices: [
        { label: 'Use a medkit', req: function () { return has('medkit'); }, reqText: 'Needs a medkit',
          success: function () { take('medkit', 1); addMorale(4); xp(10); return 'Fluids, tablets, clean cloths. By night nobody is getting worse.'; } },
        { label: 'Nurse them through it', check: { attr: 'int', diff: 5 },
          success: function () { take('water', 1); addMorale(-1); return 'Rationed water, sick kept away from the food. Miserable. Over in two days.'; },
          fail: function () { setStatus('sick', 12); addMorale(-6); return 'It spreads anyway, and you catch it too.'; } },
        { label: 'Quarantine the sick',
          success: function () { tire(10); addMorale(-3); return 'Back room, turns with the water. Lonely, but nobody else catches it.'; } }
      ]
    },
    {
      id: 'sh_trader', title: 'Caravan at the Gate', where: ['shelter'], weight: 9, minDay: 3, night: false,
      who: 'Caravan',
      text: '"Trade, no trouble." Two tired men with rifles, a cart of tins, and a donkey that brays like a bad omen.',
      play: { type: 'barter', onWin: function () { return 'They tip their hats and trundle on. News: a bridge down to the east.'; } }
    },
    {
      id: 'sh_tribute', title: 'The Toll Collector', where: ['shelter'], weight: 10, minDay: 6, night: false,
      who: 'Tollman',
      text: '"Monthly toll. Five cigarettes or three cans. The Warden doesn\'t ask twice."',
      choices: [
        { label: 'Pay five cigarettes', req: function () { return has('cigs', 5); }, reqText: 'Needs 5 cigarettes',
          success: function () { take('cigs', 5); setFlag('tribute', (flag('tribute') || 0) + 1); return 'He ticks your name off and touches two fingers to his brow.'; } },
        { label: 'Pay three cans', req: function () { return has('canned', 3); }, reqText: 'Needs 3 canned food',
          success: function () { take('canned', 3); setFlag('tribute', (flag('tribute') || 0) + 1); addMorale(-2); return '"Pleasure," he says. It isn\'t.'; } },
        { label: 'Refuse to pay',
          success: function () { addNoise(2); return FG(['tollman', 'tollman'], { onWin: function () { return 'Their satchel: ' + give('cigs', 3) + '. The Warden will hear of this.'; } }) && 'You slam the gate. They don\'t look surprised.'; } }
      ]
    },
    {
      id: 'sh_stories', title: 'Stories by the Lamp', where: ['shelter'], weight: 12, night: true,
      cond: function () { return G.survivors.length >= 2; },
      text: 'The dead are far off tonight. Someone tells a story about a job they hated. Someone tops it. People laugh.',
      choices: [
        { label: 'Tell one of your own', success: function () { addMorale(8); xp(5); return 'The worst boss you ever had. It lands. For an hour, nobody thinks of anything else.'; } },
        { label: 'Just listen', success: function () { addMorale(5); rest(10); return 'You lean back and listen. Better than any radio.'; } }
      ]
    },
    {
      id: 'sh_dog', title: 'A Dog at the Door', where: ['shelter'], weight: 6, minDay: 2, once: true,
      text: 'A thin brown dog sits at the gate, tail tapping once. It doesn\'t bark. It just looks at you.',
      choices: [
        { label: 'Feed it through the gap', req: function () { return has('canned'); }, reqText: 'Needs canned food',
          success: function () { take('canned', 1); addMorale(6); return 'It wolfs it down and licks your knuckles. By evening it\'s asleep against the door.'; } },
        { label: 'Let it in',
          success: function () {
            if (chance(0.25)) { addNoise(1); return FG(['zdog'], {}) && 'Over the threshold its eyes go flat. It was sick all along.'; }
            addMorale(7); return 'It sniffs every corner and falls asleep at your feet. Everyone softens a little.';
          } },
        { label: 'Shut the gate', success: function () { addMorale(-3); return 'One whine, then quiet. You tell yourself it was the safe thing.'; } }
      ]
    },
    {
      id: 'sh_birthday', title: 'A Birthday', where: ['shelter'], weight: 6, minDay: 5,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._bday = s;
        return sName(s) + ' mentions, like an apology, that it\'s their birthday. Nobody has marked one in fourteen months.';
      },
      choices: [
        { label: 'Cook a proper meal', req: function () { return has('meal') || has('canned'); }, reqText: 'Needs a meal or canned food',
          success: function () { if (!take('meal', 1)) take('canned', 1); addMorale(10); xp(8); return 'A candle stub in a plate of food. Everyone sings badly. ' + sName(G.flags._bday) + ' cries, then asks for seconds.'; } },
        { label: 'Give a small gift', success: function () { addMorale(4); return 'A tin of mints from the cupboard. Clutched like treasure.'; } },
        { label: 'Don\'t make a fuss', success: function () { addMorale(-2); return 'You let it pass. Sensible. Their face says what it cost.'; } }
      ]
    },
    {
      id: 'sh_pipe', title: 'Burst Pipe', where: ['shelter'], weight: 9, minDay: 3,
      text: 'A ceiling pipe has split, spraying brown water over the cots. The valve is rusted solid. Wrench it.',
      play: { type: 'lock', mode: 'pry', diff: 4,
        onWin: function () { xp(12); return 'The valve gives with a shriek. The spray dies to a drip.'; },
        onLose: function () { take('water', 1); addMorale(-3); return 'The wrench slips. Clean water runs to waste before it stops.'; } }
    },
    {
      id: 'sh_screamer', title: 'The Screamer', where: ['shelter'], weight: 8, minDay: 4, night: true,
      text: 'A thin wail outside the gate: rising, breaking, rising. Shapes start moving toward it. Shut it up.',
      play: { type: 'screamer', time: 7, extra: ['walker', 'walker', 'walker'],
        onWin: function () { xp(12); return 'The wail chokes off. The street goes quiet again.'; },
        onLose: function () { var b = damageBuilding(); return b ? 'The whole block comes to the wall. The ' + b + ' takes a beating.' : 'The whole block comes to the wall and claws at it all night.'; } }
    },
    {
      id: 'sh_rats', title: 'Rats in the Stores', where: ['shelter'], weight: 9, minDay: 3,
      text: 'Gnawed sacks, droppings on the shelf. Grey shapes slip between the crates.',
      choices: [
        { label: 'Smoke them out (chem)', req: function () { return has('chem'); }, reqText: 'Needs chemicals',
          success: function () { take('chem', 1); xp(8); return 'A stinking bucket and a shut door. By evening the rats are gone. The smell, mostly.'; } },
        { label: 'Hunt them down', check: { attr: 'agi', diff: 5 },
          success: function () { var r = give('rawmeat', 1); xp(8); return 'A pipe, the dark, patience. Small and scrawny, but it\'s meat. ' + r + '.'; },
          fail: function () { take('canned', 1); addMorale(-2); return 'They know the room better than you. They take a can on the way out.'; } },
        { label: 'Accept the loss', success: function () { take('veg', 1); take('canned', 1); addMorale(-3); return 'You bin what they touched and tighten every lid.'; } }
      ]
    }
  ];

  window.CONTENT = { story: story, lore: lore, radio: radio, names: names, barks: barks, shelterEvents: shelterEvents };
})();
