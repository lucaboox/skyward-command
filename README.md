# Skyward Command

An air-war command-center strategy game for Android foldables and tablets. You run a theater air wing across eight real-world flashpoints on a live OpenStreetMap world map. Build strike packages and pick loadouts, then watch every missile, tracer and SAM launch play out on the map.

## Play
- **Android:** install `SkywardCommand.apk`. Unfold your phone, or use a tablet. On narrow screens the game pauses and asks you to unfold.
- **Browser (dev):** `npm run serve`, then open http://localhost:5173

## How it plays
- **8 zones:** Donbas, Crimea, Kaliningrad, Kola, the US–Canada border (Sault Ste. Marie), Helmand, the Spratly Islands and Fujian. Two start hot; the rest escalate over time.
- **Intel:** only spotted units appear. Recon flights, drones, satellites and enemy SAM launches reveal more.
- **Missions:** STRIKE, SEAD, CAS, RECON, CAP, CSAR (rescue downed pilots), REINFORCE (airlift to allied positions), and NUCLEAR once researched.
- **Combat:** stealth shrinks radar SAM range. Low flyers dodge long-range radar but take gunfire. Flares, ECM (Growler), range and fuel all matter.
- **Enemy AI:** HQs send reinforcements. Airbases scramble interceptors. Cruise-missile raids hit your bases. Allied ground positions can be overrun.
- **Economy:** you get a budget plus kill bounties ($M), and earn RP to unlock the F-15E, Growler, F-35, F-22, B-52, B-1B, B-2, JASSM, cluster bombs, B61 and doctrine upgrades.
- **Lose** if global threat hits 100%. **Win** by securing all 8 zones. Grades S–D, with best scores saved per difficulty.

## How to play (quick version)
- **Tap to strike:** tap an enemy marker, a spot in a red zone, an allied unit, a downed pilot or a base under attack. A strike card offers a ready-made package; press LAUNCH. ◀ ▶ switches between Best, Safest and Cheapest. If nothing can reach, BUY & LAUNCH buys the right jet at the right base.
- **AUTO:** flip a zone to AUTO and free aircraft keep hitting its most dangerous targets on their own.
- **Win a zone:** destroy its command post (and airbase) and break 75% of its forces. The liberation bar and checklist on each zone card track this.
- **Hangar:** pick a jet and the zone it's for. The base is chosen for you.
- **Pressure scales with you:** every aircraft costs upkeep each budget cycle (net shown under Funds). Securing a zone pulls the next crisis forward, and each zone you've secured makes later ones bigger and their air defenses sharper.
- First game includes a short tutorial (replay it from Settings). The detailed hand-built planner is still there: Settings → Advanced planner.

## Land, sea and the navy
- Units are placed using land/water masks built offline from Natural Earth (`tools/build_water.py` writes `www/js/water.js`). Ground units stay on land and warships at sea. Some IFVs are amphibious and operate just offshore. Units on reef fortresses sit on artificial islands.
- Enemy navies: missile frigates, guided-missile destroyers and fast attack craft patrol the coastal zones. They shoot SAMs at aircraft and anti-ship missiles at your carriers. Harpoons are the counter, and loadouts add them automatically when ships are spotted.
- **Carrier strike groups** (R&D > Navy): floating airbases for 10 carrier-capable jets (F/A-18E, EA-18G, F-35, UH-60). They sail anywhere by sea, routed around coastlines through Gibraltar, Suez, the Turkish straits and Hormuz. Aegis escorts shoot down missiles and drones within 110 km, and each group carries Tomahawk cruise missiles for strikes up to 1,600 km away.

## Modes
- **Campaign:** secure all 8 flashpoints to win.
- **Endless:** new crises keep erupting from a pool of 18 locations. Every 4 minutes the threat level rises, making zones bigger and SAMs deadlier. Drones and cruise missiles hit your home bases; each one that gets through costs repair money and can wreck parked jets. Fly **DEFEND** patrols to intercept them. Play until global threat hits 100%.

## Saving
The game autosaves every 20 seconds, whenever the app is minimized or closed, and from the ☰ menu (also opened with Android's back button). **Continue** on the title screen resumes the run. Missiles already in flight are not saved.

## Settings (⚙ on the title screen, or ☰ menu)
- **Layouts:** Classic (top bar + top tabs), Thumb Dock (bottom tab bar + corner control dock; the default on touch screens), Side Rail (big vertical tabs on the screen edge). Also: panel side, panel width, UI size and comms-log size.
- **Audio:** procedural Web Audio, no sound files. Radio static in several variants plus garbled voice bursts, missile warnings, klaxons, positional explosions/missiles/guns (only what's on screen, louder when zoomed in), and battle ambience when you zoom into a hot zone. Each category can be toggled, with a master volume slider.
- **Other:** haptics, follow-new-packages, auto-pause on alerts, CRT scanlines.

## Build the APK
Requires the Android SDK and JDK 17–24. Android Studio's bundled JBR 25 is too new for Gradle 8.14.
```
npm install
npm run sync                     # copies Leaflet + web assets into the Android project
cd android
set JAVA_HOME=C:\Program Files\Java\jdk-22
gradlew.bat assembleDebug        # -> android/app/build/outputs/apk/debug/app-debug.apk
```
Layout: `www/` holds the game (vanilla JS + Leaflet + canvas). `android/` is the Capacitor native shell (immersive full-screen, keep-awake, custom icon).

Map data © OpenStreetMap contributors.
