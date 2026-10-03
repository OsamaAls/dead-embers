/* Dead Embers - narrative content */
(function () {
  var story = {
    intro: {
      title: "The Bunker",
      paras: [
        "You wake on a steel cot in a metro maintenance bunker, with a taste like old pennies in your mouth. The ceiling has cracked since you last looked. Dust sifts down in the light of one dying lamp.",
        "It has been fourteen months since the Grey Fever reached Ardent Vale. You remember the sirens, then the silence, then the first time you saw a neighbor walk the wrong way down the street. Nobody has come down these stairs in a long time.",
        "Above you, the dead shuffle through the city. Down here you have a locked door, a handful of tools and nobody to talk to, {name}.",
        "Your throat is dry and your stomach is a fist. Find water and food before you do anything else."
      ]
    },
    first_night: {
      title: "First Night",
      paras: [
        "The dark down here is total once the lamp is off. Above you something drags across the concrete, stops, and drags again. You hold your breath until your ears ring.",
        "Around midnight a sound comes from the shelf by the door, a hiss like a kettle. The old radio is awake, or something inside it is.",
        "Through the static you catch half a sentence in a woman's voice. '...north of the mountains. Haven is... repeat, Haven is...' Then it cuts out and the hiss is all that is left.",
        "You lie awake and say the word once, quietly. Haven."
      ]
    },
    radio_found: {
      title: "The Dead Radio",
      paras: [
        "You pull the radio into the lamplight and unscrew the back. The casing is military surplus, heavy and well built. Inside, three things are wrong with it.",
        "The tuning coil is burnt through. The antenna lead ends in a stub of wire. The power cell has swollen like a dead toad.",
        "You need a coil, a long antenna from the Radio Tower, and a power cell, which the Police Station or an Electronics store might still have. Find the parts and build the Radio."
      ]
    },
    radio_fixed: {
      title: "A Voice Answers",
      paras: [
        "You solder the last joint, seat the cell and turn the dial with a hand that will not stay still. The speaker crackles. You say your name into the microphone, {name}, and ask if anyone is there.",
        "A pause long enough to hurt. Then a woman, dry and tired and real. 'This is Haven. Mara Voss, radio operator. I hear you. Stay on the line.'",
        "Haven exists. It sits beyond the northern mountains, behind walls and a working generator. Mara says she will send coordinates, but only to a group that can prove it is organized: five survivors and defenses worth the name.",
        "'We have been burned by people who walk in alone and desperate,' she says. 'Show me you are a community and I will show you the road.'"
      ]
    },
    tollmen_demand: {
      title: "The Tollmen Call",
      paras: [
        "A man in a stitched leather coat stands at your gate with his hands open. Four others wait behind him with their hands very much not open. He calls himself a messenger and says it politely.",
        "The Warden runs the east side of the city. Before the Fever he was a prison guard, and he still believes in rules, schedules and a ledger. Every shelter that breathes inside his territory owes a toll.",
        "The messenger taps a page in a small book. Your name is already written there. 'He likes to be paid on time,' he says. 'He is much less pleasant when he has to come and collect.'"
      ]
    },
    haven_coords: {
      title: "The Road North",
      paras: [
        "Mara Voss reads the coordinates twice, slowly, and you write them on the wall in grease pencil. Then her voice changes. 'There is something you need to know. A horde is moving south, tens of thousands, a river of them. Our scouts say it will pass through Ardent Vale in about ten days.'",
        "You ask if it can be turned. She does not answer right away. 'No. You can hide from it, hold against it, or be somewhere else.'",
        "There is an old school bus at the Bus Depot, she says, one of the few vehicles left whole. It needs engine parts and fuel. She also sends a haven_map, marked with the safe route through the pass.",
        "Ten days. You write that on the wall too, under the coordinates."
      ]
    },
    horde_warning: {
      title: "The Horizon Moves",
      paras: [
        "The lookout comes down the ladder without speaking and just points. You climb up and look north. The skyline is the wrong color, a brown haze that shifts as you watch.",
        "It is not smoke or dust or weather. It is the dead, so many that the distance itself seems to crawl.",
        "You count the days on your fingers and then count again. There is less time than you thought."
      ]
    },
    bus_ready: {
      title: "The Bus Runs",
      paras: [
        "The engine catches on the fourth try and shakes the whole depot. Someone laughs, a short cracked sound, and then everyone is laughing. It is the first engine you have heard in more than a year.",
        "You fill the tank and check the tires. There are forty seats and a roof rack, and the road north is open, for now.",
        "The bus is ready. The choice that comes with it is the hard part."
      ]
    },
    final_choice: {
      title: "The Night Before",
      paras: [
        "Nobody sleeps. You can feel the horde through the floor, a low shiver in the concrete like a train that never arrives. The lamp swings a little on its cord.",
        "You can load the bus and drive for Haven before dawn, leaving the city and everything you built in it. You can stay behind your walls and fight with everything you have. Or you can walk across the dead ground to the Warden, a man you hate, and ask him to stand beside you.",
        "Your people look at you, {name}. Whatever you say now, they will do."
      ]
    },
    end_haven: {
      title: "Haven",
      paras: [
        "The convoy climbs through the pass at dusk with the horde a smear of brown in the mirrors behind it. The bus coughs, holds, and crests the ridge. Below you is a valley with lights in it, real lights, in rows.",
        "Mara Voss meets you at the gate in a patched coat, smaller than her voice. She counts heads as you step down. Not everyone you started with is on the bus, and she does not make you say their names, though you say them anyway.",
        "Haven is not paradise. There are queues for water, arguments about work shifts and a wall that needs mending. But the children sleep without anyone keeping watch, and you stand in the cold air and listen to nothing at all.",
        "You made it, {name}. The weight does not leave you, but it begins to shift."
      ]
    },
    end_stand: {
      title: "Dawn on the Wall",
      paras: [
        "The horde breaks against the walls all night. You hold the line with spears, bolts, and the last of the shells, and every hour someone hands you water without being asked.",
        "At first light the sound thins. The dead keep moving, but they are moving past you now, drawn on toward whatever lies south. The street outside is a field of ruin and the walls are still standing.",
        "You climb up and look over it. Your people sit along the parapet gray-faced and alive.",
        "You did not run, {name}. You built something that lasts, and the city will have to learn to live around it."
      ]
    },
    end_stand_fail: {
      title: "The Walls Break",
      paras: [
        "It starts with a groan from the north gate, then a split of timber, then the sound you have been dreading for fourteen months. The dead pour through the gap shoulder to shoulder.",
        "You fight from the stairwell, then the bunker door, then the dark between. There are too many, and they do not tire.",
        "Somewhere in the noise you hear someone you know call your name, {name}. Then the lamp goes out."
      ]
    },
    end_alliance: {
      title: "The Ledger and the Wall",
      paras: [
        "The Warden listens to your proposal without blinking, then opens his ledger and strikes a line through a column of debts. 'One night,' he says. 'Then we renegotiate.'",
        "His Tollmen and your people hold the east bridge together. When the horde breaks, you fight shoulder to shoulder with men who robbed you last month. Dawn finds both groups standing, bloody and exhausted and still wary.",
        "The peace that follows is uneasy. The Warden's rules remain, and so does your say in them. You have a council, a ledger, and a city to hold.",
        "It is not the world you wanted, {name}. But it is a world, and you are in charge of a piece of it."
      ]
    },
    end_alliance_fail: {
      title: "A Matter of Accounts",
      paras: [
        "The Warden lets you in through the gate himself and smiles like a man who has had the same thought all week. The Tollmen close in without a word. Your people are behind you, and so are the dead, and he has chosen which of you to deal with first.",
        "'You are a good manager,' he says, almost kindly. 'I will keep your things in order.'",
        "You understand too late that an alliance with a man like him was only ever a loan. He called it in early, {name}."
      ]
    },
    death: {
      title: "The Embers Go Out",
      paras: [
        "The world narrows to the sound of your own breathing and then not even that. The street is cold under your cheek.",
        "Somewhere a radio hisses. No one answers it.",
        "Fourteen months, {name}, and the dead did not need a fifteenth."
      ]
    },
    abandoned: {
      title: "Empty Rooms",
      paras: [
        "The bunker is quiet. The cots are made and the cups are washed, and there is no one left to use any of them.",
        "You lasted longer than most. In the end that did not matter, because there was no one to share it with."
      ]
    }
  };

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

  var radio = [
    "...this is Haven. If you can hear this, follow the railway north to the pass. We have room. Repeat, we have room...",
    "Static, then a long tone, then nothing. Then, very faint, someone counting backwards from ten and stopping at three.",
    "Any station, any station. This is a family of four at the water tower. We have a child with a fever. We are not infected. Please, anyone.",
    "East side crossing is closed until further notice. Pay at the barrier. This is the Warden's office.",
    "Haven calling Ardent Vale. We can hear you. We cannot reach you. Keep trying.",
    "Crackle. A man's voice, tired. 'Saw a column of them cross the ring road at dusk. Forty, fifty. Heading south. Don't go out tonight.'",
    "This is a recorded message. Do not approach the hospital. Do not approach the hospital. Do not...",
    "Tollmen on the north side are reminded that the tax increases at the new moon. Anyone found holding back will be visited.",
    "Mara Voss, Haven. Anyone in the valley with a working radio, we have a doctor and room for a dozen more. We will leave a light on.",
    "Something big on the highway at mile fourteen. Not a walker. Too slow, too loud. Stay clear.",
    "The horizon is moving, you hear me? The whole north horizon. Get out of the city while you still can.",
    "Hiss, a click, then a child's voice, whispered. 'Is anyone else there? Mommy says I should not talk to the radio. But I think someone is there.'"
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

  var shelterEvents = [
    {
      id: 'sh_scratching',
      title: 'Scratching at the Wall',
      where: ['shelter'],
      weight: 14,
      minDay: 2,
      night: true,
      text: function () {
        return "Sometime after midnight the scratching starts at the barricade. Dry nails drag down plywood, slow and patient, and then a second set joins in. Dust trickles from the ceiling with every shove.";
      },
      choices: [
        {
          label: 'Reinforce the barricade (2 wood)',
          req: function () { return has('wood', 2); },
          reqText: 'Needs 2 wood',
          success: function () {
            take('wood', 2);
            xp(8);
            return "You wedge fresh planks across the weak spots and hammer them down between shoves. The scratching goes on for an hour, then fades. The barricade holds.";
          }
        },
        {
          label: 'Go out and deal with them',
          success: function () {
            addNoise(1);
            return fight(['walker', 'walker']) || "You open the door a hand's width and step out. Two of them turn their heads together.";
          }
        },
        {
          label: 'Stay quiet and wait it out',
          check: { attr: 'end', diff: 5 },
          success: function () {
            return "You sit in the dark with your knees pulled up and your teeth clenched. By dawn the scratching has stopped and the barricade is still there.";
          },
          fail: function () {
            var b = damageBuilding();
            addMorale(-5);
            return b ? "A plank splits near dawn. The " + b + " takes the damage before they wander off. Nobody sleeps well after that." : "They claw at the wall until the sky grays, and nobody sleeps well after that.";
          }
        }
      ]
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
        return sName(s) + " has not been eating, has not been talking and has been keeping one sleeve pulled down. In the small hours you find a rag soaked through on the floor, and a pair of dark, glassy eyes watching you from the corner. They have been bitten, and they hid it.";
      },
      choices: [
        {
          label: 'Put them down',
          success: function () {
            var s = G.flags._turning;
            if (!s) return "The cot is empty. You stand there for a long time with nothing to do.";
            killSurvivor(s, 'turned');
            addMorale(-12);
            return "You do it quickly, and quietly, with your own hand. Nobody speaks at breakfast. Everyone saw the rag.";
          }
        },
        {
          label: 'Lock them in the old signal room',
          check: { attr: 'int', diff: 6 },
          success: function () {
            var s = G.flags._turning;
            xp(15);
            addMorale(-3);
            return "You bolt the signal room door from the outside and brace it with a pipe. " + sName(s) + " sits against the wall with the fever shaking through them, but the infection does not take. By morning the shivering has eased and the swelling has stopped.";
          },
          fail: function () {
            var s = G.flags._turning;
            if (s) killSurvivor(s, 'turned');
            hurt(10, 'bite');
            addMorale(-12);
            return "You do not brace the door properly. Around four the fever takes " + sName(s) + " and the door cracks open. You get a bite on the forearm before you put them down.";
          }
        },
        {
          label: 'Give them antibiotics',
          req: function () { return has('antibiotics'); },
          reqText: 'Needs antibiotics',
          success: function () {
            var s = G.flags._turning;
            take('antibiotics', 1);
            addMorale(5);
            xp(20);
            return "You hold the pills out and say nothing. " + sName(s) + " takes them with shaking hands. It is not a cure, but by morning the fever has broken and the wound has stopped spreading.";
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
      cond: function () { return G.survivors.length < 8; },
      text: function () {
        return "A lone figure waits at the gate with both hands raised, and a pack that looks too big for them. They say they have been walking for two days and have heard there is a place down here that is not on fire.";
      },
      choices: [
        {
          label: 'Talk them into joining',
          check: { attr: 'cha', diff: 5 },
          success: function () {
            var s = recruit();
            if (!s) return "You offer a place but the shelter has no room to give them. They nod and move on down the street.";
            xp(10);
            return sName(s) + " steps through the gate and lets out a breath that sounds like a year of holding it in. 'Thank you,' they say. 'Whatever you need.'";
          },
          fail: function () {
            return "You say all the right things in all the wrong tone. They look past you at the dark of the bunker and shake their head. They walk away down the street.";
          }
        },
        {
          label: 'Ask for proof they can pull their weight',
          success: function () {
            var r = give('canned', 1);
            var s = recruit();
            if (!s) return "They show a clean knife and a calm face, but there is nowhere to put another person. They leave you a can of food " + r + " for the trouble.";
            return "They empty the pack on the floor. Dried fruit, a coil of rope, a first aid pouch, and a scarred but steady set of hands. You nod and let " + sName(s) + " in. " + r + ".";
          }
        },
        {
          label: 'Send them away',
          success: function () {
            addMorale(-2);
            return "You tell them there is no room. They do not argue. You watch them walk until the street swallows them, and then wonder why you are still watching.";
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
      text: function () {
        return "You wake to smoke curling under the storage room door. A lamp has tipped, or a wire has sparked, and a crate of rags is burning. The flames are climbing toward the shelves.";
      },
      choices: [
        {
          label: 'Smother it with a blanket',
          check: { attr: 'end', diff: 5 },
          success: function () {
            xp(8);
            return "You beat the fire with a wet blanket until your lungs burn. It dies hissing, and the shelves are scorched but whole.";
          },
          fail: function () {
            hurt(6, 'fire');
            take('wood', 2);
            take('cloth', 2);
            return "The blanket catches. You get the fire out in the end, but it costs you skin and takes some wood and cloth with it.";
          }
        },
        {
          label: 'Drag the supplies out first',
          check: { attr: 'agi', diff: 5 },
          success: function () {
            xp(8);
            return "You haul crate after crate into the corridor, keeping low. The fire eats the rag box and nothing else.";
          },
          fail: function () {
            take('canned', 1);
            take('wood', 2);
            addMorale(-3);
            return "A shelf collapses as you reach for it. You get most of the stock out, but not all of it.";
          }
        }
      ]
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
        return "A few cans and a pack of cigarettes are missing from the shelf. Nobody saw anything and nobody is looking at you. " + sName(s) + " is chewing very slowly.";
      },
      choices: [
        {
          label: 'Confront them calmly',
          check: { attr: 'cha', diff: 5 },
          success: function () {
            var r = give('canned', 1);
            xp(8);
            return sName(G.flags._thief) + " breaks quickly, red-faced and sorry. They put the stolen food back. " + r + ". The shelter relaxes a little.";
          },
          fail: function () {
            addMorale(-5);
            return sName(G.flags._thief) + " denies everything, loudly. By the end you are shouting too. The food stays gone and so does the good mood.";
          }
        },
        {
          label: 'Let it go this time',
          success: function () {
            take('canned', 1);
            addMorale(-2);
            return "You say nothing and shrug it off. A few cans are not worth a war. But you notice the others noticing.";
          }
        },
        {
          label: 'Search everyone\'s bags',
          success: function () {
            var r = give('cigs', 2);
            addMorale(-6);
            return "You find the cigarettes in " + sName(G.flags._thief) + "'s boot. They are recovered, " + r + ", but the trust you spent doing it will not come back soon.";
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
      text: function () {
        return "Three people wake with chills and flushed faces. It is not the Grey Fever. It is a rough stomach bug, probably from the water. In a place this small it will go through everyone by tomorrow.";
      },
      choices: [
        {
          label: 'Use a medkit',
          req: function () { return has('medkit'); },
          reqText: 'Needs a medkit',
          success: function () {
            take('medkit', 1);
            addMorale(4);
            xp(10);
            return "You work down the line with fluids, tablets and clean cloths. By night everyone is sleeping through it and nobody gets worse.";
          }
        },
        {
          label: 'Nurse them with rest and water',
          check: { attr: 'int', diff: 5 },
          success: function () {
            take('water', 1);
            addMorale(-1);
            return "You ration clean water and keep the sick away from the food. It is miserable, but it is over in two days.";
          },
          fail: function () {
            setStatus('sick', 12);
            addMorale(-6);
            return "You do what you can but it is not enough. It spreads, and you catch it too. The place smells like sweat and bleach for days.";
          }
        },
        {
          label: 'Quarantine the sick',
          success: function () {
            tire(10);
            addMorale(-3);
            return "You move the sick into the back room and take turns bringing them water. The rest of you stay clear. It is lonely, but nobody else gets it.";
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
      text: function () {
        return "A wheeled cart rattles up the street, hauled by two tired men with rifles slung across their backs. They hold up a handwritten sign that reads TRADE, NO TROUBLE. A donkey brays behind them like a bad omen.";
      },
      choices: [
        {
          label: 'Trade with them',
          success: function () {
            openTrader();
            return "You open the gate a crack and talk across a table of old tins and tools. Prices are rude, as usual.";
          }
        },
        {
          label: 'Just ask for news',
          success: function () {
            addMorale(2);
            return "They tell you what they know: a bridge down to the east, a fort of kids in the old mall, something large crossing at night. You give them water for the information.";
          }
        },
        {
          label: 'Send them on',
          success: function () {
            return "You tell them you cannot take the risk. They shrug, tip their hats and trundle on.";
          }
        }
      ]
    },
    {
      id: 'sh_tribute',
      title: 'The Toll Collector',
      where: ['shelter'],
      weight: 10,
      minDay: 6,
      night: false,
      text: function () {
        return "Two Tollmen stand at the gate in leather coats stamped with the Warden's brand. One reads from a ledger. 'Monthly toll is due. Five cigarettes or three cans. The Warden does not like to ask twice.'";
      },
      choices: [
        {
          label: 'Pay five cigarettes',
          req: function () { return has('cigs', 5); },
          reqText: 'Needs 5 cigarettes',
          success: function () {
            take('cigs', 5);
            return "You count them out into a gloved hand. The Tollman ticks your name off, tips two fingers to his brow and leaves.";
          }
        },
        {
          label: 'Pay three cans of food',
          req: function () { return has('canned', 3); },
          reqText: 'Needs 3 canned food',
          success: function () {
            take('canned', 3);
            addMorale(-2);
            return "You hand over the food and watch it disappear into a sack. 'Pleasure,' he says. It is not.";
          }
        },
        {
          label: 'Refuse and fight',
          success: function () {
            addNoise(2);
            return fight(['tollman', 'tollman']) || "You slam the gate and reach for your weapon. They do not look surprised at all.";
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
      text: function () {
        return "The generator is quiet tonight and the dead are far off. Someone starts telling a story about a job they hated, and someone else tops it. By the third story people are laughing, real laughter, the kind you had forgotten the sound of.";
      },
      choices: [
        {
          label: 'Share a story of your own',
          success: function () {
            addMorale(8);
            xp(5);
            return "You tell them about the worst boss you ever had. It lands. For an hour nobody is thinking about anything but the story.";
          }
        },
        {
          label: 'Just listen',
          success: function () {
            addMorale(5);
            rest(10);
            return "You lean back against the wall and listen. The sound of other people talking is better than any radio.";
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
      text: function () {
        return "A thin brown dog sits outside the gate, ribs showing, tail tapping once against the pavement. It does not bark. It only looks at the door and then at you.";
      },
      choices: [
        {
          label: 'Feed it through the gap',
          req: function () { return has('canned'); },
          reqText: 'Needs a canned food',
          success: function () {
            take('canned', 1);
            addMorale(6);
            return "The dog wolfs the food down and then, very carefully, licks your knuckles. It does not leave. Neither do you. By evening it is asleep against the door.";
          }
        },
        {
          label: 'Let it in',
          success: function () {
            if (chance(0.25)) {
              addNoise(1);
              return fight(['zdog']) || "As it crosses the threshold its eyes go flat and it snarls. It was sick all along.";
            }
            addMorale(7);
            return "It trots in, sniffs every corner and falls asleep at your feet. The whole shelter softens a little.";
          }
        },
        {
          label: 'Shut the gate',
          success: function () {
            addMorale(-3);
            return "You close the gate. The dog whines once, then the street goes quiet. You tell yourself it was the safe thing to do.";
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
        return sName(s) + " lets slip, quietly, that it is their birthday. They say it like an apology. Nobody has marked a birthday in fourteen months.";
      },
      choices: [
        {
          label: 'Cook a proper meal (1 meal or canned)',
          req: function () { return has('meal') || has('canned'); },
          reqText: 'Needs a meal or canned food',
          success: function () {
            if (!take('meal', 1)) take('canned', 1);
            addMorale(10);
            xp(8);
            return "You set a plate in front of " + sName(G.flags._bday) + " with a candle stub stuck in it. Everyone sings badly. They cry, then laugh, then ask for seconds.";
          }
        },
        {
          label: 'Give a small gift',
          success: function () {
            addMorale(4);
            return "You find a tin of mints in the cupboard and press it into their hand. They clutch it like treasure. 'Thanks,' they say, and mean it.";
          }
        },
        {
          label: 'Do not make a fuss',
          success: function () {
            addMorale(-2);
            return "You nod and let it pass. It is the sensible thing. The look on their face tells you what it cost.";
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
      text: function () {
        return "A pipe in the ceiling has split, spraying brown water across the floor. The cots are soaked and the electrics are crackling. If it goes on, the floor will flood by noon.";
      },
      choices: [
        {
          label: 'Patch it with scrap',
          req: function () { return has('scrap'); },
          reqText: 'Needs scrap metal',
          success: function () {
            take('scrap', 1);
            xp(8);
            return "You clamp a flat of scrap around the split and tighten it with a wrench. The spray slows to a drip, then stops.";
          }
        },
        {
          label: 'Fix it properly',
          check: { attr: 'int', diff: 5 },
          success: function () {
            xp(12);
            return "You trace the line back to a valve and shut it off, then rig a bypass with what is on the shelf. The leak is gone and the water runs clean again.";
          },
          fail: function () {
            take('water', 1);
            addMorale(-3);
            return "You shut off the wrong valve and the pipe bursts worse. By the time it is sorted a good deal of clean water has run to waste.";
          }
        },
        {
          label: 'Mop up and move on',
          success: function () {
            addMorale(-3);
            tire(5);
            return "You mop until your arms ache, but the pipe keeps dripping into a bucket. It is a problem for later.";
          }
        }
      ]
    },
    {
      id: 'sh_screamer',
      title: 'The Screamer',
      where: ['shelter'],
      weight: 8,
      minDay: 4,
      night: true,
      text: function () {
        return "A thin wail rises from the street outside, unlike anything a walker makes. It rises, breaks, and rises again. Out in the dark you can hear shapes beginning to move toward the sound.";
      },
      choices: [
        {
          label: 'Stay silent and hold the door',
          check: { attr: 'agi', diff: 5 },
          success: function () {
            xp(8);
            return "You kill the lamp and hold your breath. The screaming wanders along the wall and moves off to the east, taking the crowd with it.";
          },
          fail: function () {
            addNoise(2);
            var b = damageBuilding();
            return b ? "The screamer finds the gate. It shrieks until the whole block is at your wall, and the " + b + " takes the damage before dawn." : "The screamer finds the gate and shrieks until the whole block is at your wall. They claw at it all night.";
          }
        },
        {
          label: 'Go out and silence it',
          success: function () {
            addNoise(1);
            return fight(['screamer']) || "You slip through the gate with a weapon in hand and move toward the sound.";
          }
        },
        {
          label: 'Shoot it from the roof',
          req: function () { return has('crossbow') || has('pistol'); },
          reqText: 'Needs a crossbow or pistol',
          success: function () {
            if (has('crossbow') && has('bolts')) take('bolts', 1);
            else if (has('pistol') && has('ammo')) { take('ammo', 1); addNoise(2); }
            xp(15);
            return "You lie on the roof and wait for the shape to cross a patch of moonlight. One shot. The wail cuts off mid-breath.";
          }
        }
      ]
    },
    {
      id: 'sh_rats',
      title: 'Rats in the Stores',
      where: ['shelter'],
      weight: 9,
      minDay: 3,
      text: function () {
        return "You find bite marks along a sack of food and droppings across the shelf. Something is in the stores. In the gloom you see a gray shape slip between the crates, and then another.";
      },
      choices: [
        {
          label: 'Smoke them out with chemicals',
          req: function () { return has('chem'); },
          reqText: 'Needs chemicals',
          success: function () {
            take('chem', 1);
            xp(8);
            return "You mix a stinking cloud in a bucket and leave it in the stores with the door shut. By evening the rats are gone and so is the smell, mostly.";
          }
        },
        {
          label: 'Hunt them down',
          check: { attr: 'agi', diff: 5 },
          success: function () {
            var r = give('rawmeat', 1);
            xp(8);
            return "You wait with a pipe in the dark and take them one by one. They are small and scrawny, but it is meat. " + r + ".";
          },
          fail: function () {
            take('canned', 1);
            addMorale(-2);
            return "They are faster than you and know the room better. By morning they have chewed through a can seal and made off with the rest.";
          }
        },
        {
          label: 'Accept the loss',
          success: function () {
            take('veg', 1);
            take('canned', 1);
            addMorale(-3);
            return "You throw out what they touched and tighten the lids on the rest. It is a waste, and everyone knows it.";
          }
        }
      ]
    }
  ];

  window.CONTENT = { story: story, lore: lore, radio: radio, names: names, barks: barks, shelterEvents: shelterEvents };
})();
