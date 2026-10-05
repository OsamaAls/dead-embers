/* Dead Embers - narrative content
   story scenes: `beats` are what the player sees (1-4 short lines, endings up to 5); `paras` is the long journal version.
   Shelter events follow the encounter schema in API.md: physical things are `play`, real decisions are `choices`. */
(function () {
  var story = {
    intro: {
      title: "The Bunker",
      beats: [
        { who: "", line: "Fourteen months since the Grey Fever. You wake alone in a metro bunker under a dead city." },
        { who: "", line: "Your throat is dry and your stomach is a fist. Find water. Try FreshMart." }
      ],
      paras: [
        "You wake on a steel cot in a metro maintenance bunker, with a taste like old pennies in your mouth. The ceiling has cracked since you last looked. Dust sifts down in the light of one dying lamp.",
        "It has been fourteen months since the Grey Fever reached Ardent Vale. You remember the sirens, then the silence, then the first time you saw a neighbor walk the wrong way down the street. Nobody has come down these stairs in a long time.",
        "Above you, the dead shuffle through the city. Down here you have a locked door, a handful of tools and nobody to talk to, {name}.",
        "Your throat is dry and your stomach is a fist. Find water and food before you do anything else."
      ]
    },
    first_night: {
      title: "First Night",
      beats: [
        { who: "", line: "Something drags across the concrete above you. Then the old radio by the door hisses awake." },
        { who: "A woman's voice", line: "...north of the mountains. Haven is... repeat, Haven is..." },
        { who: "", line: "Static. You say the word once, quietly. Haven." }
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
        { who: "", line: "You open the old radio. Burnt coil, no antenna, a power cell swollen like a dead toad." },
        { who: "", line: "Coil: Tower Blocks or Volt & Co. Antenna: KVAL Radio Tower. Cell: Precinct 9 or Volt & Co." },
        { who: "", line: "Bring all three home and build the radio." }
      ],
      paras: [
        "You pull the radio into the lamplight and unscrew the back. The casing is military surplus, heavy and well built. Inside, three things are wrong with it.",
        "The tuning coil is burnt through. The antenna lead ends in a stub of wire. The power cell has swollen like a dead toad.",
        "You need a coil, a long antenna from the Radio Tower, and a power cell, which the Police Station or an Electronics store might still have. Find the parts and build the Radio."
      ]
    },
    radio_fixed: {
      title: "A Voice Answers",
      beats: [
        { who: "", line: "The speaker crackles. You say your name, {name}, and ask if anyone is there." },
        { who: "Mara Voss", line: "This is Haven. Mara Voss, radio operator. I hear you. Stay on the line." },
        { who: "Mara Voss", line: "Show me a community. Five of you, and walls worth the name. Then I send you the road." }
      ],
      paras: [
        "You solder the last joint, seat the cell and turn the dial with a hand that will not stay still. The speaker crackles. You say your name into the microphone, {name}, and ask if anyone is there.",
        "A pause long enough to hurt. Then a woman, dry and tired and real. 'This is Haven. Mara Voss, radio operator. I hear you. Stay on the line.'",
        "Haven exists. It sits beyond the northern mountains, behind walls and a working generator. Mara says she will send coordinates, but only to a group that can prove it is organized: five people and defenses worth the name.",
        "'We have been burned by people who walk in alone and desperate,' she says. 'Show me you are a community and I will show you the road.'"
      ]
    },
    tollmen_demand: {
      title: "The Tollmen Call",
      beats: [
        { who: "", line: "A man in a stitched leather coat waits at your gate. Four armed men wait behind him." },
        { who: "Tollman", line: "The Warden runs the east side. Every shelter that breathes in his territory pays a toll." },
        { who: "Tollman", line: "Your name is already in his book. He likes to be paid on time." }
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
        { who: "Mara Voss", line: "Here are the coordinates. Write them down. Now the bad news." },
        { who: "Mara Voss", line: "A horde is moving south. Tens of thousands. It reaches you in about twelve days." },
        { who: "Mara Voss", line: "There is a bus at the depot. It needs engine parts and 6 fuel." },
        { who: "Mara Voss", line: "The route through the pass is on a map at Checkpoint Echo. Get it. Then drive." }
      ],
      paras: [
        "Mara Voss reads the coordinates twice, slowly, and you write them on the wall in grease pencil. Then her voice changes. 'There is something you need to know. A horde is moving south, tens of thousands, a river of them. Our scouts say it will pass through Ardent Vale in about twelve days.'",
        "You ask if it can be turned. She does not answer right away. 'No. You can hide from it, hold against it, or be somewhere else.'",
        "There is an old school bus at the Bus Depot, she says, one of the few vehicles left whole. It needs engine parts and fuel. The safe route through the pass is marked on an army map at Checkpoint Echo.",
        "Twelve days. You write that on the wall too, under the coordinates."
      ]
    },
    horde_warning: {
      title: "The Horizon Moves",
      beats: [
        { who: "", line: "The lookout comes down the ladder without a word and points north." },
        { who: "", line: "The skyline is moving. A brown haze of the dead, so many the distance itself crawls." },
        { who: "", line: "You count the days again. Fewer than you thought." }
      ],
      paras: [
        "The lookout comes down the ladder without speaking and just points. You climb up and look north. The skyline is the wrong color, a brown haze that shifts as you watch.",
        "It is not smoke or dust or weather. It is the dead, so many that the distance itself seems to crawl.",
        "You count the days on your fingers and then count again. There is less time than you thought."
      ]
    },
    bus_ready: {
      title: "The Bus Runs",
      beats: [
        { who: "", line: "The engine catches on the fourth try. Someone laughs, and then everyone is laughing." },
        { who: "", line: "Forty seats, a full tank, and the road north is open. For now." },
        { who: "", line: "The bus is ready. The choice that comes with it is the hard part." }
      ],
      paras: [
        "The engine catches on the fourth try and shakes the whole depot. Someone laughs, a short cracked sound, and then everyone is laughing. It is the first engine you have heard in more than a year.",
        "You fill the tank and check the tires. There are forty seats and a roof rack, and the road north is open, for now.",
        "The bus is ready. The choice that comes with it is the hard part."
      ]
    },
    final_choice: {
      title: "The Night Before",
      beats: [
        { who: "", line: "Nobody sleeps. The horde hums through the floor like a train that never arrives." },
        { who: "", line: "Drive for Haven. Hold the bunker. Or ask the Warden, a man you hate, to stand with you." },
        { who: "", line: "Your people look at you, {name}. Whatever you say now, they will do." }
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
        { who: "", line: "The bus crests the pass at dusk. Below is a valley with lights in it. Real lights, in rows." },
        { who: "Mara Voss", line: "Welcome to Haven. Step down slowly. I need to count you." },
        { who: "", line: "Not everyone made it. She does not make you say their names. You say them anyway." },
        { who: "", line: "Haven has queues and quarrels. But here the children sleep without anyone on watch." },
        { who: "", line: "You made it, {name}. The weight does not leave you, but it begins to shift." }
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
        { who: "", line: "The horde breaks on your walls all night. Someone keeps handing you water without being asked." },
        { who: "", line: "At first light the dead flow past you, south, toward something else." },
        { who: "", line: "Your people sit along the wall, grey-faced and alive." },
        { who: "", line: "You did not run, {name}. You built something that lasts." }
      ],
      paras: [
        "The horde breaks against the walls all night. You hold the line with spears, bolts, and the last of the shells, and every hour someone hands you water without being asked.",
        "At first light the sound thins. The dead keep moving, but they are moving past you now, drawn on toward whatever lies south. The street outside is a field of ruin and the walls are still standing.",
        "You climb up and look over it. Your people sit along the parapet gray-faced and alive.",
        "You did not run, {name}. You built something that lasts, and the city will have to learn to live around it."
      ]
    },
    end_stand_fail: {
      title: "The Walls Break",
      beats: [
        { who: "", line: "The north gate groans, then splits. The dead pour through, shoulder to shoulder." },
        { who: "", line: "You fight from the stairwell, then the bunker door, then the dark. They do not tire." },
        { who: "", line: "Someone you know calls your name, {name}. Then the lamp goes out." }
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
        { who: "The Warden", line: "One night. Then we renegotiate." },
        { who: "", line: "Tollmen and your people hold the east bridge together. Dawn finds both sides standing." },
        { who: "", line: "Now there is a council, a ledger, and a city to hold." },
        { who: "", line: "It is not the world you wanted, {name}. But it is a world, and part of it is yours." }
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
        { who: "", line: "The Warden opens the gate himself, smiling. The Tollmen close in without a word." },
        { who: "The Warden", line: "You are a good manager. I will keep your things in order." },
        { who: "", line: "An alliance with him was only ever a loan. He called it in early, {name}." }
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
        { who: "", line: "The street is cold under your cheek. Somewhere a radio hisses. No one answers it." },
        { who: "", line: "Fourteen months, {name}. The dead did not need a fifteenth." }
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
        { who: "", line: "The cots are made and the cups are washed. There is no one left to use them." },
        { who: "", line: "You lasted longer than most. With no one to share it, that did not matter." }
      ],
      paras: [
        "The bunker is quiet. The cots are made and the cups are washed, and there is no one left to use any of them.",
        "You lasted longer than most. In the end that did not matter, because there was no one to share it with."
      ]
    }
  };

  /* Lore notes: optional reading, they go to the journal. */
  var lore = [
    { title: "Diary of a Nurse, Day 3", text: "They told us it was a flu. By noon the ward was full and by evening half of them had stopped answering. The ones who got up again did not look at us the way sick people do. I am writing this in the supply closet with the door held shut." },
    { title: "CDC Memo 114-A", text: "The Grey Fever is spread by contact with infected fluids, including bites and scratches. Incubation ranges from several hours to two days. Once core temperature drops below thirty degrees, cognitive function is not recoverable. Containment protocols have failed in all major districts." },
    { title: "The Last Log of Sergeant Okafor", text: "We held the bridge for nine hours. The lieutenant is gone, the radio is gone, and I am down to six rounds. If anyone finds this, tell my wife I walked home. I did not, but tell her anyway." },
    { title: "A Child's Drawing", text: "Crayon on the back of a pharmacy flyer. Four stick figures hold hands under a yellow sun, and one has a bigger scribble for hair. Across the bottom, in wobbly letters, it says 'MOM DAD ME BEN. NO MONSTERS.' The paper is soft from being folded." },
    { title: "Tollmen Ledger, Page 12", text: "Row after row of neat handwriting. 'Apt block on Fenner, 5 cigs, paid. Bakery cellar, 8 canned, short 2, visited. Bridge crossing, 4 cigs, paid.' At the bottom someone has written, in a different hand, 'The Warden is always right.'" },
    { title: "Field Note on Bloaters", text: "Some infected swell with gas as the fever advances. They look slow and harmless. Do not kill them in a closed space. Their burst releases a cloud that will make anyone nearby violently ill." },
    { title: "Field Note on Screamers", text: "A small number of infected cry out when they spot the living. The sound carries for blocks and the dead come to it. If you hear one, go quiet, go low, and do not light a fire." },
    { title: "Scrawled on a Wall in Red Paint", text: "HAVEN IS REAL. NORTH OF THE MOUNTAINS. WALLS, POWER, FOOD. FOLLOW THE RAILWAY TO THE PASS. Beneath it someone has added in black marker, 'It was real when I wrote this.'" },
    { title: "Pharmacist's Note", text: "Taped to a shuttered counter. 'If you are bitten, antibiotics will not cure you. But a full course early may slow the infection enough for someone to act. Do not hoard them. If you find any, share them.'" },
    { title: "Supermarket Manager's Memo", text: "Staff are to lock the doors at closing and not unlock them for anyone. This includes family. Perishables in the walk-in are to be left alone. I mean it. Some of that stock has been turning for three days and I do not want to know how." },
    { title: "Radio Operator's Log", text: "I have been broadcasting on this frequency for forty days. No one has replied, but the batteries still hold. If someone hears this, the tower has a spare antenna in the maintenance shed. Take it and go." },
    { title: "Bus Depot Work Order", text: "Bus 14 is down for engine overhaul. Parts are on order. Fuel is in the underground tank, key with the foreman. Do not release the vehicle until the inspection is signed. The inspection never was." },
    { title: "Letter to a Daughter", text: "I am leaving this on your bed in case you come back. The key is under the geranium. There is water in the tub and tins in the cupboard. I went to find you and I will keep looking." },
    { title: "Rooftop Gardener's Note", text: "Tomatoes are coming in. Beans are slow. The crows keep trying for the seedlings. If you are reading this and you are hungry, take half and leave half. The roots will recover if you leave the stems." },
    { title: "Warden's Rules, Posted at the Toll Bridge", text: "One. Pay on the first of the month. Two. No weapons past the barrier. Three. Questions are answered at the Warden's discretion. Four. Do not make the Warden repeat himself." },
    { title: "Evacuation Notice", text: "Residents of the Vale are asked to proceed calmly to the stadium. Bring documents, medicine and one bag. Do not stop for others. The stadium was never reached, and the notice has been trodden into the mud by thousands of feet." },
    { title: "Scavenger's Tip", text: "Scratched into the side of a locker. 'Check the cabinet above the fridge, the tile behind the stove, and the toolbox in the trunk. People hide what they think matters in the same dumb places.'" },
    { title: "Scientist's Last Voicemail", text: "Transcript. 'If this reaches anyone, the horde is not random. They follow noise and warmth and they follow each other. Something is pulling them south. I do not know what it is, and I think I do not want to.'" }
  ];

  /* Radio: one broadcast per morning once the radio is built. 1-2 short lines each. */
  var radio = [
    "...this is Haven. Follow the railway north to the pass. We have room. Repeat, we have room...",
    "Static, then a long tone. Someone counts down from ten and stops at three.",
    "Any station. Family of four at the water tower. Our child has a fever. We are not infected. Please.",
    "East crossing closed until further notice. Pay at the barrier. This is the Warden's office.",
    "Haven calling Ardent Vale. We can hear you. We cannot reach you. Keep trying.",
    "A tired man: 'Fifty of them crossed the ring road at dusk, heading south. Don't go out tonight.'",
    "Recorded message. Do not approach the hospital. Do not approach the hospital. Do not...",
    "Tollmen are reminded: the tax goes up at the new moon. Anyone holding back will be visited.",
    "Mara Voss, Haven. We have a doctor and room for a dozen more. We will leave a light on.",
    "Something big on the highway at mile fourteen. Too slow, too loud. Not a walker. Stay clear.",
    "The whole north horizon is moving. You hear me? Get out of the city while you still can.",
    "A child, whispering: 'Mommy says don't talk to the radio. But I think someone is there.'"
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
    hardworker: [
      "Give me something to carry and I will carry it.",
      "Idle hands get us killed. What needs doing?",
      "I finished early. Anything else?"
    ],
    lazy: [
      "Is this really necessary today?",
      "I will do it after I rest a bit. A long bit.",
      "Someone else is better at this, honestly."
    ],
    glutton: [
      "Is there any more of the canned peaches?",
      "I could eat the wall if it were seasoned.",
      "Do we have seconds? Asking for a friend."
    ],
    brave: [
      "I will take the first watch. Go sleep.",
      "They bleed like everyone else. I will go.",
      "If it comes through that door, it meets me first."
    ],
    cheerful: [
      "Look at that sunrise. We got another one.",
      "Chin up. We have soup, and soup is practically a victory.",
      "I made a joke earlier. Nobody laughed. I think it was good."
    ],
    sickly: [
      "My chest hurts again. I will be fine.",
      "Sorry, I need to sit for a minute.",
      "Do not catch this. Whatever it is."
    ],
    scavenger: [
      "I know a place nobody has picked over. Give me a day.",
      "There is always something left behind. You just have to be patient.",
      "I found a good boot. Only one, but it is good."
    ],
    medic: [
      "Let me look at that before it gets worse.",
      "Clean bandages are worth more than gold right now.",
      "Rest. I am serious. You are going to fall over."
    ],
    grumpy: [
      "Who left this mess? I know it was not me.",
      "Do not look at me like that.",
      "Every plan we make has a hole in it, and I am the one who finds it."
    ],
    quiet: [
      "...",
      "I heard something outside. Probably nothing.",
      "I will be in the corner if you need me."
    ],
    hungry: [
      "My stomach is eating itself.",
      "We need food. Soon.",
      "I cannot think straight. When do we eat?"
    ],
    thirsty: [
      "My mouth is like sand. Is there any water?",
      "Just a sip. One sip.",
      "Water. Please. Anything wet."
    ],
    lowmorale: [
      "What is the point of any of this?",
      "I keep hearing them even when it is quiet.",
      "I do not know how much longer I can do this."
    ],
    happy: [
      "I slept well for once. It is a good day.",
      "We are going to make it. I can feel it.",
      "This place feels like home, you know?"
    ]
  };

  function sName(s) { return s && s.name ? s.name : 'someone'; }

  /* Shelter events (where: ['shelter']). Physical ones are played; the rest are short decisions. */
  var shelterEvents = [
    {
      id: 'sh_scratching',
      title: 'Scratching at the Wall',
      where: ['shelter'],
      weight: 14,
      minDay: 2,
      night: true,
      text: "Dry nails drag down the barricade after midnight. Then a second set joins in.",
      play: {
        type: 'horde', foes: ['walker', 'walker'],
        onWin: function () { xp(8); return "The scratching stops. For good."; },
        onLose: function () {
          var b = damageBuilding();
          addMorale(-5);
          return b ? "They claw until dawn. The " + b + " takes the damage." : "They claw at the wall until dawn. Nobody sleeps.";
        }
      }
    },
    {
      id: 'sh_turning',
      title: 'The Hidden Bite',
      where: ['shelter'],
      weight: 8,
      minDay: 5,
      once: true,
      night: true,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._turning = s;
        return sName(s) + " has been hiding a bite under one sleeve. Now glassy eyes watch you from the corner.";
      },
      choices: [
        {
          label: 'Put them down',
          success: function () {
            var s = G.flags._turning;
            if (!s) return "The cot is empty. You stand there a long time.";
            killSurvivor(s, 'turned');
            addMorale(-12);
            return "You do it quickly, with your own hand. Nobody speaks at breakfast.";
          }
        },
        {
          label: 'Lock them in the old signal room',
          check: { attr: 'int', diff: 6 },
          success: function () {
            var s = G.flags._turning;
            xp(15);
            addMorale(-3);
            return sName(s) + " shakes all night behind the braced door. By morning the fever has eased.";
          },
          fail: function () {
            var s = G.flags._turning;
            if (s) killSurvivor(s, 'turned');
            hurt(10, 'bite');
            addMorale(-12);
            return "The door was not braced. The fever takes " + sName(s) + ", and you take a bite before it ends.";
          }
        },
        {
          label: 'Give them antibiotics',
          req: function () { return has('antibiotics'); },
          reqText: 'Needs antibiotics',
          success: function () {
            take('antibiotics', 1);
            addMorale(5);
            xp(20);
            return "Not a cure. But by morning the fever breaks and the wound stops spreading.";
          }
        }
      ]
    },
    {
      id: 'sh_newcomer',
      title: 'Stranger at the Gate',
      where: ['shelter'],
      weight: 10,
      minDay: 3,
      night: false,
      who: 'Stranger',
      cond: function () { return G.survivors.length < 8; },
      text: "A lone figure at the gate, hands raised. \"Two days walking. They said there is a place here not on fire.\"",
      choices: [
        {
          label: 'Talk them into joining',
          check: { attr: 'cha', diff: 5 },
          success: function () {
            var s = recruit();
            xp(10);
            return sName(s) + " steps through the gate and lets out a long breath. \"Whatever you need.\"";
          },
          fail: function () {
            return "Right words, wrong tone. They shake their head and walk on.";
          }
        },
        {
          label: 'Ask for proof they can pull their weight',
          success: function () {
            var r = give('canned', 1);
            var s = recruit();
            return "Rope, a first aid pouch, steady hands. You let " + sName(s) + " in. " + r + ".";
          }
        },
        {
          label: 'Send them away',
          success: function () {
            addMorale(-2);
            return "They do not argue. You watch until the street swallows them.";
          }
        }
      ]
    },
    {
      id: 'sh_fire',
      title: 'Fire in the Storage',
      where: ['shelter'],
      weight: 8,
      minDay: 3,
      night: true,
      text: "Smoke under the storage door. A crate of rags is burning and the shelves are coming down.",
      play: {
        type: 'dodge', waves: 3, dmg: [4, 8],
        onWin: function () { xp(8); return "The fire dies hissing. Scorched shelves, nothing lost."; },
        onLose: function () {
          take('wood', 2);
          take('cloth', 2);
          return "You beat it out at last, but it took wood and cloth with it.";
        }
      }
    },
    {
      id: 'sh_theft',
      title: 'Missing Supplies',
      where: ['shelter'],
      weight: 9,
      minDay: 4,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._thief = s;
        return "Cans and cigarettes are missing. Nobody saw a thing. " + sName(s) + " is chewing very slowly.";
      },
      choices: [
        {
          label: 'Confront them calmly',
          check: { attr: 'cha', diff: 5 },
          success: function () {
            var r = give('canned', 1);
            xp(8);
            return sName(G.flags._thief) + " breaks, red-faced, and puts the food back. " + r + ".";
          },
          fail: function () {
            addMorale(-5);
            return sName(G.flags._thief) + " denies everything, loudly. Soon you are shouting too.";
          }
        },
        {
          label: 'Let it go this time',
          success: function () {
            take('canned', 1);
            addMorale(-2);
            return "A few cans are not worth a war. But the others notice.";
          }
        },
        {
          label: 'Search everyone\'s bags',
          success: function () {
            var r = give('cigs', 2);
            addMorale(-6);
            return "The cigarettes are in " + sName(G.flags._thief) + "'s boot. " + r + ". The trust you spent will not come back soon.";
          }
        }
      ]
    },
    {
      id: 'sh_outbreak',
      title: 'Fever in the Rooms',
      where: ['shelter'],
      weight: 8,
      minDay: 4,
      cond: function () { return G.survivors.length > 0; },
      text: "Three people wake with chills. Not the Grey Fever, just bad water. It will go through everyone.",
      choices: [
        {
          label: 'Use a medkit',
          req: function () { return has('medkit'); },
          reqText: 'Needs a medkit',
          success: function () {
            take('medkit', 1);
            addMorale(4);
            xp(10);
            return "Fluids, tablets, clean cloths. By night everyone is sleeping it off.";
          }
        },
        {
          label: 'Nurse them with rest and water',
          check: { attr: 'int', diff: 5 },
          success: function () {
            take('water', 1);
            addMorale(-1);
            return "You ration clean water and keep the sick from the food. Two bad days, then it passes.";
          },
          fail: function () {
            setStatus('sick', 12);
            addMorale(-6);
            return "It spreads anyway, and you catch it too.";
          }
        },
        {
          label: 'Quarantine the sick',
          success: function () {
            tire(10);
            addMorale(-3);
            return "The sick go to the back room. It is lonely, but nobody else catches it.";
          }
        }
      ]
    },
    {
      id: 'sh_trader',
      title: 'Caravan at the Gate',
      where: ['shelter'],
      weight: 9,
      minDay: 3,
      night: false,
      who: 'Trader',
      text: "A cart rattles up, hauled by two tired men with rifles. Their sign says TRADE, NO TROUBLE.",
      play: {
        type: 'barter',
        onWin: function () {
          addMorale(2);
          return "They share news as they pack: a bridge down to the east, kids holding the old mall.";
        },
        onLose: function () { return ''; }
      }
    },
    {
      id: 'sh_tribute',
      title: 'The Toll Collector',
      where: ['shelter'],
      weight: 10,
      minDay: 6,
      night: false,
      who: 'Tollman',
      text: "\"Monthly toll is due. Five cigarettes or three cans. The Warden does not like to ask twice.\"",
      choices: [
        {
          label: 'Pay five cigarettes',
          req: function () { return has('cigs', 5); },
          reqText: 'Needs 5 cigarettes',
          success: function () {
            take('cigs', 5);
            return "He ticks your name off, touches two fingers to his brow and leaves.";
          }
        },
        {
          label: 'Pay three cans of food',
          req: function () { return has('canned', 3); },
          reqText: 'Needs 3 canned food',
          success: function () {
            take('canned', 3);
            addMorale(-2);
            return "\"Pleasure,\" he says. It is not.";
          }
        },
        {
          label: 'Refuse to pay',
          success: function () {
            addNoise(2);
            fight(['tollman', 'tollman'], {
              onWin: function () { return "The collectors will not be back. The Warden will hear of this."; }
            });
            return "You shut the gate in his face. They do not look surprised.";
          }
        }
      ]
    },
    {
      id: 'sh_stories',
      title: 'Stories by the Lamp',
      where: ['shelter'],
      weight: 12,
      night: true,
      cond: function () { return G.survivors.length >= 2; },
      text: "The dead are far off tonight. Someone tells a story, someone tops it, and people laugh for real.",
      choices: [
        {
          label: 'Share a story of your own',
          success: function () {
            addMorale(8);
            xp(5);
            return "Your worst boss ever. It lands. For an hour nobody thinks about the dead.";
          }
        },
        {
          label: 'Just listen',
          success: function () {
            addMorale(5);
            rest(10);
            return "Other people talking. It beats any radio.";
          }
        }
      ]
    },
    {
      id: 'sh_dog',
      title: 'A Dog at the Door',
      where: ['shelter'],
      weight: 6,
      minDay: 2,
      once: true,
      text: "A thin brown dog sits outside the gate, ribs showing. It does not bark. It just looks at you.",
      choices: [
        {
          label: 'Feed it through the gap',
          req: function () { return has('canned'); },
          reqText: 'Needs a canned food',
          success: function () {
            take('canned', 1);
            addMorale(6);
            return "It wolfs the food and licks your knuckles. By evening it is asleep against the door.";
          }
        },
        {
          label: 'Let it in',
          success: function () {
            if (chance(0.25)) {
              addNoise(1);
              fight(['zdog']);
              return "At the threshold its eyes go flat. It was sick all along.";
            }
            addMorale(7);
            return "It sniffs every corner and falls asleep at your feet. The whole shelter softens.";
          }
        },
        {
          label: 'Shut the gate',
          success: function () {
            addMorale(-3);
            return "It whines once. Then the street goes quiet.";
          }
        }
      ]
    },
    {
      id: 'sh_birthday',
      title: 'A Birthday',
      where: ['shelter'],
      weight: 6,
      minDay: 5,
      cond: function () { return G.survivors.length > 0; },
      text: function () {
        var s = randomSurvivor();
        G.flags._bday = s;
        return sName(s) + " admits it is their birthday, like an apology. Nobody has had one in fourteen months.";
      },
      choices: [
        {
          label: 'Cook a proper meal (meal or can)',
          req: function () { return has('meal') || has('canned'); },
          reqText: 'Needs a meal or canned food',
          success: function () {
            if (!take('meal', 1)) take('canned', 1);
            addMorale(10);
            xp(8);
            return "A candle stub in a plate of food. Everyone sings badly. " + sName(G.flags._bday) + " cries, then asks for seconds.";
          }
        },
        {
          label: 'Give a small gift',
          success: function () {
            addMorale(4);
            return "A tin of mints from the cupboard. They hold it like treasure.";
          }
        },
        {
          label: 'Do not make a fuss',
          success: function () {
            addMorale(-2);
            return "The sensible thing. The look on their face tells you what it cost.";
          }
        }
      ]
    },
    {
      id: 'sh_pipe',
      title: 'Burst Pipe',
      where: ['shelter'],
      weight: 9,
      minDay: 3,
      text: "A pipe bursts, spraying brown water over the cots. Reach the valve before the floor floods.",
      play: {
        type: 'race', time: 25,
        onWin: function () { xp(10); return "You wrench the valve shut. The spray dies to a drip."; },
        onLose: function () {
          take('water', 1);
          addMorale(-3);
          return "Too slow. Clean water runs to waste across the floor.";
        }
      }
    },
    {
      id: 'sh_screamer',
      title: 'The Screamer',
      where: ['shelter'],
      weight: 8,
      minDay: 4,
      night: true,
      text: "A thin wail rises outside the gate, and shapes start moving toward it. Silence it fast.",
      play: {
        type: 'screamer', time: 6, extra: ['walker', 'walker', 'walker'],
        onWin: function () { xp(15); return "The wail cuts off mid-breath. The street settles."; },
        onLose: function () {
          addNoise(2);
          var b = damageBuilding();
          return b ? "The whole block comes to your wall. The " + b + " takes the damage." : "The whole block comes to your wall and claws at it all night.";
        }
      }
    },
    {
      id: 'sh_rats',
      title: 'Rats in the Stores',
      where: ['shelter'],
      weight: 9,
      minDay: 3,
      text: "Bite marks on the food sacks. Grey shapes slip between the crates.",
      choices: [
        {
          label: 'Smoke them out (chemicals)',
          req: function () { return has('chem'); },
          reqText: 'Needs chemicals',
          success: function () {
            take('chem', 1);
            xp(8);
            return "A stinking bucket, the door shut. By evening the rats are gone, and most of the smell.";
          }
        },
        {
          label: 'Wait for them in the dark',
          check: { attr: 'agi', diff: 5 },
          success: function () {
            var r = give('rawmeat', 1);
            xp(8);
            return "One by one, with a pipe. Scrawny, but it is meat. " + r + ".";
          },
          fail: function () {
            take('canned', 1);
            addMorale(-2);
            return "They know the room better. By morning a can is chewed open.";
          }
        },
        {
          label: 'Accept the loss',
          success: function () {
            take('veg', 1);
            take('canned', 1);
            addMorale(-3);
            return "You throw out what they touched. A waste, and everyone knows it.";
          }
        }
      ]
    }
  ];

  window.CONTENT = { story: story, lore: lore, radio: radio, names: names, barks: barks, shelterEvents: shelterEvents };
})();
