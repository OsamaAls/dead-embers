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
        { who: '', line: "Two bottles of water left in storage. Find more up top." }
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
        { who: 'Mara Voss', line: "\"Show me a community: four people with you, and walls worth the name. Then I send the road.\"" },
        { who: 'Mara Voss', line: "\"One more thing. The ranger station in Kessler Woods kept stores. Coats. Get there before the frost.\"" }
      ],
      paras: [
        "You solder the last joint, seat the cell and turn the dial with a hand that will not stay still. The speaker crackles. You say your name into the microphone, {name}, and ask if anyone is there.",
        "A pause long enough to hurt. Then a woman, dry and tired and real. 'This is Haven. Mara Voss, radio operator. I hear you. Stay on the line.'",
        "Haven exists. It sits beyond the northern mountains, behind walls and a working generator. Mara will send coordinates, but only to a group that can prove it is organised: four survivors besides you, and barricades worth the name.",
        "'We have been burned by people who walk in alone and desperate,' she says. 'Show me you are a community and I will show you the road.'",
        "Before she signs off she gives you one thing for free. The rangers kept a station in Kessler Woods, north of the old wall, with stores laid in for winter. 'Coats, bolts, tins. Get there before the frost does.'"
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
    first_frost: {
      title: "First Frost",
      beats: [
        { who: '', line: "White frost on every wreck in the street. Your breath hangs in the air and won't leave." },
        { who: '', line: "The dead don't feel the cold. You do. The nights will bite from now on." }
      ],
      paras: [
        "Frost this morning, white and furred on every wreck in the street. The puddles have skins of ice, and your breath hangs in front of you as if it has nowhere better to go.",
        "Late autumn now. The dead do not feel the cold, but you do. Wood for the fire, cloth for the bunks, a coat if you can find one. The nights will bite."
      ]
    },
    first_snow: {
      title: "First Snow",
      beats: [
        { who: '', line: "Snow, soft and grey, settling on the dead city. It muffles everything. Even them." },
        { who: '', line: "The radio warned you. One heavy fall and the pass closes. Then there is no road north." }
      ],
      paras: [
        "Snow, falling soft and grey over the dead city. It settles on the cars and the roofs and the bodies in the street, and for a while everything is quiet, even the dead.",
        "The radio has been saying it for days: one heavy fall and the pass closes until spring. Whatever you mean to do, do it before the road north is gone."
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
    end_cure: {
      title: "The Okafor Broadcast",
      beats: [
        { who: '', line: "Signal Hill, the night the horde comes. The KVAL light burns red for the first time in a year." },
        { who: '', line: "You read Dr. Okafor's formula into the microphone. Slowly. Twice. Then again for anyone late." },
        { who: 'Radio', line: "\"...Haven here. Copying. Who is this?\" Then a second voice. Then a fourth." },
        { who: '', line: "It cost you the bunker and most of a night, {name}. Somewhere out there, a fever breaks." }
      ],
      paras: [
        "You climb Signal Hill with the horde already filling the valley behind you. The generator coughs, catches, and the red light on the KVAL mast burns for the first time in more than a year. Every dead thing for miles can see it. You start reading anyway.",
        "Dr. Okafor's formula is four pages of cramped handwriting: a protein from the ones who never fell ill, a way to grow it in a kitchen, a dose. You read it slowly, twice, then a third time for anyone who tuned in late. Your voice goes before the batteries do.",
        "Toward dawn the radio answers. Haven first, then a farm in the east, then a woman on a fishing boat, then voices you will never put faces to, all copying, all asking you to repeat page three. It is not a cure for the turned. It is a start, and starts are the only kind of thing left.",
        "You lost the bunker that night, {name}, and more than that. Somewhere beyond the mountains, a fever breaks, and somebody writes the formula on a wall so it cannot be lost again."
      ]
    },
    end_cure_fail: {
      title: "Dead Air",
      beats: [
        { who: '', line: "The dead reach Signal Hill before the last page. The generator chokes. The red light dies." },
        { who: '', line: "You keep reading into a dead microphone, {name}, because stopping feels worse." },
        { who: 'Radio', line: "Weeks later, on your frequency, a girl's voice: \"Page two. Does anyone have page two?\"" }
      ],
      paras: [
        "You get as far as the second page. Then the fence at the foot of Signal Hill goes down, the dead come up the slope like a tide, and the generator chokes on the last of the fuel. The red light on the mast flickers and dies.",
        "You keep reading into the dead microphone in the dark, {name}, because stopping would feel worse. The door holds for a while. Then it does not.",
        "Weeks later, on the same frequency, a girl's voice comes through the static, careful and stubborn. She has page one written down. She asks, every night at the same hour, whether anyone has page two."
      ]
    },
    end_usurp: {
      title: "The New Warden",
      beats: [
        { who: '', line: "You come through the camp's north wall at dawn, when the guard is thinnest. The black flag comes down." },
        { who: 'The Warden', line: "\"Rule four,\" he says, on his knees by his ledger. \"Don't make me repeat myself.\" You don't." },
        { who: '', line: "That night the horde breaks on Tollmen walls, behind Tollmen guns. Yours now." },
        { who: '', line: "The toll booths stay open, {name}. The ledger just has a new name at the top." }
      ],
      paras: [
        "You hit the Tollmen camp at dawn, through the gap in the north wall, while the guard is half asleep and the Warden is still at his desk. It is quick and loud and ugly. When it is over the black flag is in the mud and the Warden is dead beside his ledger, still reciting the rules.",
        "The Tollmen who are left look at you and wait. They are not loyal to a man. They are loyal to whoever holds the book. That night the great horde breaks against their walls, and they fight it behind their guns for you.",
        "In the morning the booths on the bridges open on time. People pay. Someone has to keep order, you tell yourself, and someone has to keep the walls fed. The ledger has a new name at the top, {name}, and the handwriting is yours."
      ]
    },
    end_alone: {
      title: "The Northern Pass",
      beats: [
        { who: '', line: "You leave before dawn with one pack and no goodbyes. The bunker door clicks shut behind you." },
        { who: '', line: "Snow in the pass. The horde is a hum far below you, and then not even that." },
        { who: '', line: "Nobody slows you down, {name}. Nobody is there to notice when you stop." }
      ],
      paras: [
        "You pack light: water, a knife, the route map folded inside your shirt. You do not wake anyone. You tell yourself it is kinder that way. The bunker door clicks shut behind you and nobody calls your name.",
        "The pass is snow and wind and narrow ledges. Far below, the horde fills the Vale like brown water filling a bowl, and you hear it as a hum, and then you climb high enough that you hear nothing at all.",
        "Travelling alone is fast. Nobody slows you down, nobody needs feeding, nobody asks you what happens next. And nobody is there, {name}, to notice when you stop."
      ]
    },
    end_choir: {
      title: "The Last Hymn",
      beats: [
        { who: '', line: "The bells ring all night. The great horde stands in the square, swaying, and does not bite." },
        { who: 'Choir elder', line: "\"You see? They only want to be sung to.\" Under the church, the captives sing on." },
        { who: '', line: "Dawn comes. You are alive, {name}, and fed. You do not go near the cellar door." }
      ],
      paras: [
        "You take your place in the robes. When the great horde comes down the high street the Choir rings every bell it owns, and the dead slow, and stop, and stand in the square in their thousands, swaying like wheat. Not one of them bites.",
        "'You see?' the elder says, warm as a grandmother. 'They only want to be sung to.' Under the church, in the cellar, the chained captives sing, because when they stop the dead remember they are hungry.",
        "Dawn comes grey and quiet. You are alive, {name}, and fed, and safe as anyone in the Vale. You learn the hymns. You do not go near the cellar door, and after a while you stop hearing the voices underneath the bells."
      ]
    },
    end_convoy: {
      title: "The Convoy",
      beats: [
        { who: 'Sgt. Ada Vance', line: "\"Convoy, move out.\" Her rifle on the roof rack. Your people behind the glass. All of them." },
        { who: '', line: "The horde hits the pass road an hour behind you. Ada's flares send it the wrong way." },
        { who: 'Mara Voss', line: "\"Welcome to Haven.\" She counts heads twice. \"Everyone?\" Everyone." },
        { who: '', line: "Nobody left behind, {name}. Tonight you sleep. So does Ada, for once." }
      ],
      paras: [
        "Ada Vance rides the roof rack with her rifle and a satchel of army flares, and she runs the bus like a convoy because that is what it is. Everyone has a seat, a job and a buddy. Nobody is left at the roadside.",
        "The horde reaches the pass road an hour behind you. Ada fires flares into the gullies to the east, red and hissing, and the river of the dead turns toward the light and pours away down the wrong valley.",
        "At the gate Mara Voss counts heads as you step down, then counts again because she does not believe it. 'Everyone?' she asks. Everyone. Tonight you sleep without keeping watch, {name}, and so, for once, does Ada."
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
        var s = subject('_turning');
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
        var s = subject('_thief');
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
        var s = subject('_bday');
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
      text: 'Brown water sprays out of the bunker door: a pipe has split over the cots. The valve is rusted solid. Wrench it.',
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

  /* Epilogues: short lines shown under the ending text (the engine shows up to 5, highest pri first).
     cond() uses flag()/G only; line is a string or (endingId) => string; endings: ids it may follow, or null = any ending but death/abandoned. */
  var alive = function (n) { return G.survivors.some(function (s) { return s.name === n; }); };
  var NORTH = ['end_haven', 'end_convoy'];
  var STAY = ['end_stand', 'end_alliance', 'end_usurp', 'end_cure', 'end_choir'];
  var WON = NORTH.concat(STAY);
  var GONE = WON.concat(['end_alone']);
  var north = function (e) { return NORTH.indexOf(e) >= 0; };
  var owned = function (id) { return (G.pack[id] || 0) + (G.store[id] || 0) > 0; };
  var epilogues = [
    // ---- Eli ----
    { id: 'eli_north', pri: 8, endings: NORTH, cond: function () { return flag('eli_joined') && alive('Eli'); },
      line: "Eli learned every vent in Haven within a week. Nobody's pantry was safe, and nobody minded." },
    { id: 'eli_stay', pri: 8, endings: ['end_stand', 'end_cure'], cond: function () { return flag('eli_joined') && alive('Eli'); },
      line: "Eli chalked the bunker on every wall: the walls, the lamp, a stick figure in a hat." },
    { id: 'eli_tolls', pri: 8, endings: ['end_alliance', 'end_usurp'], cond: function () { return flag('eli_joined') && alive('Eli'); },
      line: function (e) { return e === 'end_usurp'
        ? "Eli runs messages for the new Warden. He never once writes your name in the ledger."
        : "Eli runs messages across the toll bridge. The Tollmen tip him in cigarettes; he trades them for paper."; } },
    { id: 'eli_choir', pri: 8, endings: ['end_choir'], cond: function () { return flag('eli_joined') && alive('Eli'); },
      line: "Eli stopped talking again. He hums now, the same four notes, all day long." },
    { id: 'eli_dead', pri: 7, endings: WON, cond: function () { return flag('eli_joined') && !alive('Eli'); },
      line: function (e) { return north(e)
        ? "You carried Eli's stub of chalk all the way to Haven. You haven't drawn anything with it yet."
        : "Eli's chalk figure is still on the bunker wall. Nobody has washed it off. Nobody will."; } },
    { id: 'eli_lost', pri: 5, endings: GONE, cond: function () { return (flag('eli_lost') || flag('eli_scared')) && !flag('eli_joined'); },
      line: "Before you left the Vale you put one last can on a stairwell step. It was gone by morning." },
    // ---- Dr. Okafor ----
    { id: 'ines_cure', pri: 9, endings: ['end_cure'], cond: function () { return !!flag('ines_stays'); },
      line: "Dr. Okafor heard every word from her lab. Afterwards she radioed to correct your pronunciation." },
    { id: 'ines_joined', pri: 8, endings: WON, cond: function () { return flag('ines_joined') && alive('Dr. Ines Okafor'); },
      line: function (e) { return north(e)
        ? "Dr. Okafor runs Haven's clinic now. Bitten or not, she checks everyone twice."
        : "Dr. Okafor turned the signal room into a clinic. The coughing at night stopped."; } },
    { id: 'ines_behind', pri: 6, endings: GONE.filter(function (e) { return e !== 'end_cure'; }), cond: function () { return !!flag('ines_stays'); },
      line: "You never learned if Dr. Okafor's lab survived the horde. Some nights the static sounds like her." },
    { id: 'serum_kept', pri: 4, endings: GONE, cond: function () { return owned('serum'); },
      line: "The vial of serum is still in your pocket. You never found the right person to spend it on." },
    // ---- Marcus Hale / the Warden ----
    { id: 'marcus_with', pri: 7, endings: WON, cond: function () { return flag('marcus_helped') && alive('Marcus Hale'); },
      line: function (e) { return e === 'end_usurp'
        ? "Marcus Hale stood behind your chair at the Warden's table. He took no title, only the night watch."
        : north(e) ? "Marcus rode by the bus door the whole way north, pistol on his knee, watching the road."
        : "Marcus Hale walks your walls every night. He says it's the first job he's ever been proud of."; } },
    { id: 'marcus_gone', pri: 6, endings: WON, cond: function () { return flag('marcus_helped') && !alive('Marcus Hale'); },
      line: function (e) { return north(e)
        ? "Marcus Hale was waiting at Haven's gate with two cups of something hot. \"Took you long enough.\""
        : "A trader swore he saw Marcus Hale in the mountains, walking north, lighter than before."; } },
    { id: 'marcus_betrayed', pri: 6, endings: GONE, cond: function () { return !!flag('marcus_betrayed'); },
      line: function (e) { return e === 'end_usurp'
        ? "In the Warden's cellar you found Marcus Hale's coat, folded neatly. Nothing else of him."
        : "Some nights you still see Marcus Hale's face, the way it looked when he wouldn't look at you."; } },
    { id: 'warden_bluff', pri: 5, endings: ['end_alliance'], cond: function () { return !!flag('warden_secret'); },
      line: "You never told the Warden you knew his army was forty people. That silence kept the peace." },
    { id: 'tribute_paid', pri: 4, endings: WON, cond: function () { return (flag('tribute') || 0) >= 2; },
      line: function (e) { return e === 'end_usurp'
        ? "You found your own name in the ledger: paid in full. You left it there."
        : e === 'end_alliance' ? "The Warden kept your toll receipts. \"Paid in full,\" he said. It counted for something."
        : "Somewhere in a Tollmen ledger your name still reads: paid in full. Small comfort."; } },
    { id: 'tribute_never', pri: 4, endings: ['end_alliance', 'end_usurp'], cond: function () { return !!flag('tollmen') && !flag('tribute'); },
      line: "You never paid the Warden a single toll. People in the Vale noticed. They still talk about it." },
    // ---- The Choir ----
    { id: 'choir_freed', pri: 7, endings: WON, cond: function () { return !!flag('choir_freed'); },
      line: "The people you cut from the Choir's chains are free. Some of them still flinch at bells." },
    { id: 'choir_hum', pri: 6, endings: GONE.filter(function (e) { return e !== 'end_choir'; }), cond: function () { return !!flag('choir_joined'); },
      line: "You still hum the Choir's hymn without meaning to. You stop when anyone hears." },
    { id: 'choir_left', pri: 5, endings: GONE, cond: function () { return flag('choir_spy') && !flag('choir_freed') && !flag('choir_joined'); },
      line: "You never went back for the people under the church. You think of them whenever a bell rings." },
    // ---- The Relay ----
    { id: 'haven_gate', pri: 7, endings: NORTH, cond: function () { return !!flag('haven_truth'); },
      line: "At Haven's gate they checked every arm for bites. You'd warned your people. You held your breath anyway." },
    { id: 'haven_stay', pri: 5, endings: STAY, cond: function () { return !!flag('haven_truth'); },
      line: "You knew what Haven's gate does to the bitten. Staying felt less like cowardice after that." },
    // ---- Teodor and Biscuit ----
    { id: 'teodor_joined', pri: 7, endings: WON, cond: function () { return flag('teodor_joined') && alive('Teodor'); },
      line: function (e) { return north(e)
        ? "Teodor planted his seed jar in Haven's first spring and complained about the soil all year."
        : "Teodor's beans came up behind the barricade. He called them \"adequate\" and almost smiled."; } },
    { id: 'teodor_grave', pri: 6, endings: GONE, cond: function () { return flag('teodor_dead') && !flag('teodor_abandoned'); },
      line: "There's a grave under an apple tree outside the Vale, and an old dog who won't leave it." },
    { id: 'teodor_shots', pri: 6, endings: GONE, cond: function () { return !!flag('teodor_abandoned'); },
      line: "Some nights you hear shotgun blasts in your sleep. Two, then nothing. Teodor's farm." },
    // ---- Rosa Quill ----
    { id: 'rosa_lamps', pri: 6, endings: WON, cond: function () { return !!flag('lamps_lit'); },
      line: function (e) { return north(e)
        ? "Rosa's lamps still burn behind you in the Vale, a dotted line home for anyone who needs one."
        : "Rosa's lamps still burn along the river road. Strangers follow them right to your door."; } },
    { id: 'rosa_joined', pri: 7, endings: WON, cond: function () { return flag('rosa_joined') && alive('Rosa Quill'); },
      line: function (e) { return north(e)
        ? "Rosa Quill lit the first gas lamp on Haven's main street. People cheered like it was a parade."
        : "Rosa lights the yard lamp every dusk. On horde nights she lights two, out of spite."; } },
    { id: 'rosa_north', pri: 5, endings: GONE, cond: function () { return !!flag('rosa_north'); },
      line: function (e) { return e === 'end_alone'
        ? "High in the pass you found one of Rosa's lamps, still lit. It didn't make you feel less alone."
        : "Rosa Quill went north alone with her ladder. Travellers say the pass road has lamps now."; } },
    // ---- Sgt. Ada Vance ----
    { id: 'vance_ally', pri: 7, endings: WON, cond: function () { return flag('vance_ally') && alive('Ada Vance'); },
      line: function (e) { return e === 'end_convoy'
        ? "Ada Vance took Haven's night watch the first week. She says she'll stop soon. She won't."
        : "Ada Vance drilled your people every morning. Nobody liked it. Nobody died of it, either."; } },
    { id: 'vance_stays', pri: 6, endings: WON, cond: function () { return !!flag('vance_stays'); },
      line: function (e) { return north(e)
        ? "Passing Checkpoint Echo, you saw a lone figure on the wall. She saluted the bus."
        : "Checkpoint Echo's flag still flies. Ada Vance has never sent a report. Nobody has asked for one."; } },
    { id: 'vance_robbed', pri: 6, endings: GONE, cond: function () { return !!flag('vance_robbed'); },
      line: "Ada Vance woke to an empty locker. She never filed a report. She remembers your face." },
    { id: 'okoro', pri: 5, endings: WON, cond: function () { return !!flag('okoro_saved'); },
      line: "Pvt. Okoro writes his mother a letter every week. There's no post. He writes anyway." },
    // ---- standalone encounters ----
    { id: 'wedding', pri: 4, endings: WON, cond: function () { return !!flag('wedding_witness'); },
      line: function () { return flag('wedding_gift')
        ? "The couple you saw married in the ruins kept your can of peaches on a shelf. Unopened. For luck."
        : "The couple you saw married in the ruins had a daughter in spring. Your name is on her cereal box."; } },
    { id: 'dj', pri: 4, endings: WON, cond: function () { return !!flag('dj_saved'); },
      line: function (e) { return e === 'end_cure'
        ? "Static Sam replays your broadcast every night between soul records. He calls it a hit."
        : "Static Sam still broadcasts from a car park. Every night's first song goes to \"my bodyguard\"."; } },
    { id: 'dj_quiet', pri: 3, endings: WON, cond: function () { return !!flag('dj_silenced'); },
      line: "Static Sam never came back on the air. The Vale is quieter. Not better. Quieter." },
    { id: 'mapkid', pri: 3, endings: WON, cond: function () { return !!flag('mapkid_paid'); },
      line: "The map girl's maps got better. The new ones mark your door with a small crayon star." },
    { id: 'dog', pri: 4, endings: GONE, cond: function () { return !!flag('dog_adopted'); },
      line: function (e) { return e === 'end_alone'
        ? "The shepherd dog followed you up the pass. It was the only goodbye you didn't skip."
        : "The shepherd dog sleeps across your doorway now. It still guards like it owes someone."; } },
    { id: 'pharmacy', pri: 3, endings: WON, cond: function () { return flag('pharmacy_paid') || flag('pharmacy_left'); },
      line: "Someone signing \"R.\" leaves medicine in empty shops across the Vale. You've started doing it too." },
    { id: 'mother', pri: 4, endings: WON, cond: function () { return flag('mother_helped') || flag('mother_north'); },
      line: function () { return flag('mother_helped') && alive('Petra')
        ? "Old Petra outlived two more winters and told everyone you needed a haircut."
        : "You never learned if the man carrying his mother made the mountains. You hope she saw them."; } },
    { id: 'brothers', pri: 3, endings: WON, cond: function () { return flag('brothers_north') || flag('brothers_stay') || flag('brothers_robbed'); },
      line: function () { return flag('brothers_robbed')
        ? "Two brothers in the Vale tell a story about a thief and a dry tank. You're the villain in it."
        : flag('brothers_north') ? "The brothers made the pass together. The younger one still writes to his mother's grave."
        : "The brothers stayed by their mother's grave. They keep a garden there now."; } },
    { id: 'chimes', pri: 3, endings: GONE, cond: function () { return !!flag('chimes_home'); },
      line: "You kept three wind chimes from that balcony. Wherever you sleep, they ring you down." },
    // ---- act bosses ----
    { id: 'bosses', pri: 4, endings: null, cond: function () { return G.bosses && Object.keys(G.bosses).some(function (k) { return G.bosses[k] === 'dead'; }); },
      line: function () { var n = Object.keys(G.bosses).filter(function (k) { return G.bosses[k] === 'dead'; }).map(function (k) { return ENEMIES[k].n; });
        return n.length === 1 ? n[0] + " is a story they tell in the Vale now. You're in it, at the end."
          : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] + ": names the Vale says quietly now. You put them down."; } },
    // ---- numbers ----
    { id: 'survivors_many', pri: 2, endings: WON, cond: function () { return G.survivors.length >= 8; },
      line: function () { return G.survivors.length + " people sleep under your watch. You know every one of their names."; } },
    { id: 'survivors_few', pri: 2, endings: WON, cond: function () { return G.survivors.length > 0 && G.survivors.length <= 2; },
      line: "So few came this far with you. Each one counts double." },
    { id: 'kills_many', pri: 1, endings: null, cond: function () { return G.stats.kills >= 100; },
      line: function () { return "You put down " + G.stats.kills + " of the dead. You stopped counting long before that."; } },
    { id: 'kills_few', pri: 1, endings: null, cond: function () { return G.stats.kills < 15; },
      line: function () { return "You killed only " + G.stats.kills + " of the dead. Mostly, you were somewhere else."; } },
    { id: 'days_long', pri: 1, endings: null, cond: function () { return G.day >= 25; },
      line: function () { return "Day " + G.day + ". Longer than the Fever gave anyone."; } }
  ];
  window.EPILOGUES = epilogues;

  /* survivorTalk: what people at the bunker say when you talk to them (E near one). Banks are keyed by trait, with a default.
     mood.high/mid/low by morale; chat = "How are you holding up?"; gift ({item} = what you gave); ask = they want something
     ({item} {qty}); thanks = you brought it; follow/stay = coming on runs or not; hurt = when HP is low. */
  var survivorTalk = {
    mood: {
      high: {
        default: ["Good day. Don't jinx it.", "Slept four hours straight. Felt like a holiday.", "We're still here. That counts."],
        cheerful: ["I counted the beans. We're rich, by bean standards.", "Somebody hum something. Anything."],
        grumpy: ["Fine. Don't make a thing of it.", "It's tolerable. Write that on my grave."],
        brave: ["Point me at something. I'm ready.", "Felt good out there today."],
        scared: ["I didn't hear them last night. Not once.", "It's quiet. I like quiet."],
        hardworker: ["Finished early. Got more?", "Busy hands, quiet head."],
        lazy: ["Don't look at me like that. I'm resting productively."],
        grateful: ["You keep doing this for us. I notice.", "Thank you. Really."],
        loyal: ["Wherever this goes, I'm with you."],
        quiet: ["...good.", "It's alright today."],
      },
      mid: {
        default: ["Getting by.", "Another day. Same dust.", "Ask me tomorrow."],
        grumpy: ["The roof leaks on my side. Always my side.", "What."],
        cheerful: ["Could be worse. Could be raining. Oh. It is.", "Chin up. Mine's tired, but up."],
        scared: ["Did you lock the hatch? Twice?", "I keep hearing feet."],
        sickly: ["Bit of a cough. It's nothing. Probably.", "Cold's in my chest again."],
        glutton: ["Is it dinner yet? It feels like dinner.", "I dream about bread. Real bread."],
        steady: ["We hold. That's all."],
        medic: ["Everyone's patched. For now.", "Bring me clean cloth if you see any."],
        scavenger: ["Saw a pharmacy on the east side. Untouched, maybe.", "There's always something left behind."],
      },
      low: {
        default: ["I can't keep doing this.", "What's the point, honestly?", "I don't sleep anymore."],
        grumpy: ["This place is a tomb with bunks.", "Leave me alone."],
        cheerful: ["I'm trying to smile. Give me a minute.", "Even I've run out of jokes."],
        scared: ["They're going to get in. One night they will.", "Please don't send me out there."],
        loyal: ["It's bad. I'm not going anywhere. But it's bad."],
        brave: ["I'm tired of being brave."],
      },
    },
    hurt: ["Hurts to breathe. Give me a day.", "Don't look at the bandage. I don't.", "I'll mend. Slowly."],
    chat: {
      default: ["Talked to my sister in a dream. She said eat something.", "Remember coffee? Real coffee?", "Some days I forget what month it is. Then I remember."],
      cheerful: ["Did you know dogs can smell fear? Good thing I'm fearless.", "I named the rat. He's called Gregory."],
      grumpy: ["You want a chat? Here's a chat: we need more wood.", "I'm holding up. Because nobody else will hold me up."],
      brave: ["I keep a knife under my pillow. Two, actually.", "I'd go out with you any day."],
      scared: ["Talking helps. Keep talking. About anything.", "I made a list of exits. Want to see it?"],
      sickly: ["Better than yesterday. Worse than last week.", "If I cough at night, it's just a cough."],
      medic: ["Wash your hands. I mean it. Every time.", "Your colour's better. Eat something anyway."],
      scavenger: ["Junk is just treasure that's having a bad year.", "I could find a can opener in a minefield."],
      hardworker: ["Talk while I work. I can do both.", "If the hinges squeak, tell me. I'll fix them."],
      lazy: ["Holding up fine. Lying down, mostly.", "Rest is a skill. I'm very skilled."],
      glutton: ["I'd fight a bear for a sandwich. A small bear.", "Holding up. Hungry. Same thing."],
      grateful: ["Better since you found me. Much better.", "Thank you for asking. Nobody used to."],
      loyal: ["Don't worry about me. Worry about you.", "Same as always. Here."],
      quiet: ["...", "Fine. Thanks for asking."],
      steady: ["Breathe in, breathe out. Works every time.", "We take it one day at a time."],
    },
    gift: {
      default: ["{item}? For me? I'll remember this.", "You didn't have to. Thank you.", "That's the nicest thing in weeks."],
      grumpy: ["Hmph. {item}. ...Thanks.", "Don't tell anyone I smiled."],
      glutton: ["Oh. Oh, {item}. I could cry.", "Gone in three bites. Thank you."],
      cheerful: ["A present! It's like a birthday, if birthdays were grim."],
      quiet: ["...thank you."],
    },
    ask: {
      default: ["If you're out there anyway: {qty} {item}. It would mean a lot.", "Could you bring me {qty} {item}? I'll make it worth it."],
      sickly: ["I need {qty} {item}. Please. Before it gets worse."],
      medic: ["I'm short on things. {qty} {item}, if you find any."],
      grumpy: ["Since you're asking. {qty} {item}. Don't make a face."],
    },
    thanks: ["You remembered. Here, I've been saving this.", "That's exactly it. Take this, I insist.", "I owe you. Here."],
    follow: ["Give me a minute to find my boots.", "About time. Let's go.", "I'll watch your back."],
    stay: ["Fine by me. Bring something back.", "I'll keep the kettle warm.", "Be careful out there."],
    jobs: ["On it.", "Right away.", "If you say so."],
  };

  /* radioHints: one extra line on the bunker radio. cond() picks what fits the moment. */
  var radioHints = [
    { cond: function () { return G.hordeNight; }, line: "\"Horde moving on the ring road. Anyone with walls: tonight.\"" },
    { cond: function () { return !bl('walls'); }, line: "\"Barricades, people. Wood and scrap. Build them before you need them.\"" },
    { cond: function () { return G.flags.q_bus && !G.flags.bus_ready; }, line: "\"Bus depot still has parts if you're brave. The army road map is at Checkpoint Echo.\"" },
    /* names the ranger station before the woods open (the gate opens after radio_fixed), until you have been there */
    { cond: function () { return G.flags.radio_built && !Object.keys(WORLD.pois).some(function (k) { return WORLD.pois[k].type === 'ranger' && G.locs[k] && G.locs[k].visited; }); },
      line: "\"Rangers kept a station in Kessler Woods. Stores, a stove, coats. Worth the walk before the frost.\"" },
    /* winter: makes the first snow's warning true */
    { cond: function () { return G.flags.q_bus && seasonNow() === 'winter'; }, line: "\"Snow on the pass. One heavy fall and it shuts till spring. If you're going north, go soon.\"" },
    { cond: function () { return G.flags.q_bus && seasonNow() === 'winter'; }, line: "\"Anyone still heading north: the pass won't stay open past the next blizzard.\"" },
    { cond: function () { return G.p.inf > 0; }, line: "\"Grey Fever? Antibiotics slow it. St. Agnes had a whole pharmacy wing.\"" },
    { line: "\"Rain barrels and a hose. That's the whole secret to the dry months.\"" },
    { line: "\"Wrecks still hold fuel. A hose makes it quick. Siphon, don't spark.\"" },
    { line: "\"Fill bottles at the river and boil them. Never drink it raw.\"" },
    { line: "\"Nail a door shut behind you if you have to sleep out. Two planks will do.\"" },
    { line: "\"Dogs out there aren't all sick. Feed a stray and it might stay.\"" },
  ];

  /* graffiti: one-liners for notes and writing on walls (WORLD.notes, if the world has them) */
  var graffiti = [
    "MARIA WE WENT NORTH. FOLLOW THE TRACKS.",
    "Don't trust the Tollmen. They count your teeth.",
    "Day 40. Still no one. Still here.",
    "WATER IN THE CHURCH CELLAR. BOIL IT.",
    "They don't climb. Get high.",
    "Kev was here. Kev is not here anymore.",
    "If you can read this you're still alive. Good.",
    "HAVEN IS REAL. 3 DAYS ON FOOT.",
  ];
  /* placeNotes: writing on the walls of story places (WORLD.notes with a place) */
  var placeNotes = {
    shelter: ["BUNKER FULL. Not really. Knock twice.", "Whoever's in there: we left you the tins. Pay it on.", "Hatch sticks in the cold. Kick it, don't shout."],
    depot: ["Last bus: 06:40. Nobody drove it.", "Engine block's good. Parts are in the back. - R", "Bus 12 runs. It just needs someone brave."],
    radiotower: ["The voice on 98.6 is real. She answered me.", "Mast works. Copper's gone. Bring wire.", "DON'T BROADCAST AT NIGHT. THEY FOLLOW THE HUM."],
    hospital: ["NO MORE BEDS. NO MORE DOCTORS. GO.", "The last doctor took the antibiotics north. Follow.", "Ward 3 sealed. Don't open it. Don't."],
    police: ["Armoury empty. Cells are not.", "Sgt. Doyle held this door four days. Remember him.", "If you're bit, sit by the wall and wait. We'll be kind."],
    ranger: ["Ranger log: woods quiet. Too quiet for deer.", "Stove's dry wood under the floor. Leave some.", "Snares on the east trail. Mind your ankles."],
    military: ["CHECKPOINT ECHO. Route north by convoy only.", "We had orders. Then we had none.", "Map to Haven in the CO's desk. Burn it if they come."],
    harbour: ["Last ferry left without us. Tide's still honest.", "Bloaters wash up on the high tide. Burn them.", "Diesel at the jetty. Don't smoke near it, idiot."],
    flooded: ["The water rose in a night. We went up.", "Rooftops connect. Keep off the street.", "Something swims down there. Not a fish."],
    tollcamp: ["Toll paid in full. -A. (they took my boots)", "One Tollman sleeps on watch. Thursdays.", "The Warden keeps a book of names. Mine's in it."],
  };

  window.CONTENT = { story: story, lore: lore, radio: radio, names: names, barks: barks, shelterEvents: shelterEvents, epilogues: epilogues,
    survivorTalk: survivorTalk, radioHints: radioHints, graffiti: graffiti, placeNotes: placeNotes };
})();
