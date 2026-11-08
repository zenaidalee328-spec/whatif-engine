# Ref 3: Liam3d "How a Hole on a Beach Becomes a Bunker" (14M views)

Watched at 30 fps, all 1849 frames (1080x1920, 61.6 s, voiceover + music bed). Script formula and the 20-short study are in the chat history; the key points:

## Script formula (~260 words, ~4.3 words/s)
Hook "If you [naive action] to [goal], you have a [basic thing]." -> 8-12 loops of "But [enemy counter]. So you [fix]. This is a [name]." -> twist "And that [thing] is not [wrong] by mistake." -> gag "Add a stove, a deck of cards, and a [animal] that steals your bread." -> "Congratulations, you have built [X]."
Winners have an ENEMY (soldiers, warships, guards). Plain engineering with no enemy gets 60-200K views.

## Visual language
- Low-poly 3D, one persistent world (a beach). Objects ACCUMULATE: foxhole -> bunker -> tank traps -> mined poles -> tunnel. Nothing is reset between beats.
- One hero soldier with a helmet, seen mostly from behind or the side. Flat bright lighting, simple models.
- Camera: static side or front view of the build; hard cut or fast pan to the enemy (warship, tank, boat) when "But..." is spoken, then back. Cross-section and top views are used for the interior and the twist.
- Each beat is about 150 frames (5 s). Build animation 1-2 s, enemy attack 1-2 s.
- Explosions are cheap: a flat orange blob, grey and black smoke spheres, debris cubes.
- Twist beat (frames 1430-1600): the window turns sideways and RED SIGHT-LINES are drawn from the ships, showing they cannot see it while it sees the boats.
- Gag beat (1680-1770): stove, cards, a seagull flies in and steals the bread.
- Ending (1772-1848): "CONGRATULATIONS" then a slow pull-back to the finished bunker, with the last words as captions. No CTA or outro.

## Captions
Karaoke style, centred in the middle of the screen, small bold sans with an outline. Two-word chunks, and the word being spoken is coloured (green, pink, red, cyan or yellow, rotating). A chunk changes every ~8-10 frames, synced to the voiceover. No title overlay and no HUD.

## Beat map (frames)
0-100 dig, soldier jumps in, ship fire | 100-230 wave floods the hole, walls slide in | 230-340 move to the dunes, formwork, concrete, roof (lookout) | 340-470 pan to the warships, bunker blasted | 470-660 thicker walls, buried under sand and grass (hideout) | 660-760 landing boats, tank rolls out | 760-950 weld X traps, tide floods them | 950-1100 poles with mines, boat blown up | 1100-1350 shooting, run across the sand, dig tunnel | 1350-1600 ships aim at the window, it turns sideways, thick wall, red sight-lines | 1600-1680 "ships cannot see it, but it sees every boat" | 1680-1770 gag | 1770-1848 congratulations, pull-back.

## Needed in our engine
Karaoke caption style, a persistent beach scene with accumulating props (bunker, X traps, poles, tunnel), enemy props (warships, tank, landing boats), cheap explosion fx, cross-section camera, sight-line overlay. Voiceover vs captions-only is an open question for the user.
