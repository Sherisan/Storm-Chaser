# Storm Chaser

Tornado crash game. A funnel touches down ahead of your chase truck and the multiplier climbs as you drive at it. The
longer you chase, the stronger the tornado gets (wind, EF rating, falling pressure) and the closer you get. The only
thing you do is **bail out** (cash out) before it turns onto the road and lifts the truck. Anyone still chasing when
that happens loses the bet.

```
npm install
npm run dev      # http://localhost:5192
npm run build
```

The game plays against the game API's live crash engine (FeedingFranzeeAPI, `/livecrashhub`, Engine `LiveCrash`,
GameId `stormchaser`). In dev, Vite proxies `/api`, `/livecrashhub` and `/promohub` to http://localhost:5003, and the
API's `/api/dev-token` signs in a demo player. Production builds call `VITE_API_BASE` with the lobby's `?token=`.
Open the game with `?demo` (or build with `VITE_DEMO=1`) to play offline against the in-browser demo engine
(`src/game/demoEngine.ts`: demo wallet R2,000 and a few other chasers).

## The round

```
BETTING (7 s)   the funnel lowers out of the wall cloud; radar pings in the last 3 s. Two trucks (bet slots) per player.
FLYING          touchdown. multiplier = e^(0.12·t) floored to the cent: 2× at 5.8 s, 10× at 19 s, 100× at 38 s, 1000× at 58 s.
                bail out any time, by hand or at an auto-bail target; win = stake × multiplier (capped at MaxWin).
CRASHED (5 s)   it turns: a 0.5 s surge as the funnel comes down the road, then the truck is lifted (3.2 s). Bets still in lose.
```

The API draws the crash point before betting opens (`Rng` block, Model `Target`, 4% house edge, max ×1000), so every
bail-out target returns 96% over time, early or late. Everything on screen is a pure function of ln(multiplier)
(`src/game/storm.ts`):

| | formula | at 2× | at 10× | at 100× |
|---|---|---|---|---|
| wind | 105 + 70·ln m km/h | 154 (EF1) | 266 (EF3, EF4 from 10.1×) | 427 (EF5) |
| pressure | 1012 − 20·ln m hPa | 998 | 966 | 920 |
| range to the funnel | 40 + 1220 / (1 + 1.1·ln m) m | 715 | 342 | 205 |

Nothing on screen feeds back into the multiplier, and the client reports no event that could move the RTP.

## Provably fair

The hub sends the SHA-256 hash of the server seed and the chase's nonce with every round, and reveals the previous
seed when it rotates (every 1 000 draws). Both are shown under **Provably fair** in the menu. The demo engine documents
a standard crash mapping for its own draws (`demoEngine.ts`). The live game's draw comes from the API's generator
(EasyRNG).

## Backend (FeedingFranzeeAPI)

There's no new engine: Storm Chaser is a `LiveCrash` game, like REDLINE and Witching Hour. It needs:

- the `stormchaser` entry in `appsettings.json` `Games` (Engine `LiveCrash`, ProviderGameId 16, LaunchUrl
  `https://stormchaser.easygamesdemo.co.za/`; Rng Target, 4% edge, max ×1000; Live: 7 s betting, 5 s crashed,
  growth 0.12, 2 bet slots), plus the origin in `AllowedOrigins` in `appsettings.json` and `appsettings.Staging.json`
- `Infrastructure/Persistence/StormChaserGameServer.sql`, which creates the `dbo.Games` row (run it ahead of the
  deploy)
- `StormChaserCatalogue.sql`, which creates the BetAvenue lobby row: provider 10013, GameTypeID 1 (crash), and the
  first free Enum after 728
- a restart once the row exists: `LiveCrashRegistry` builds one engine per enabled LiveCrash game at startup

Hub calls used: `GetSnapshot`, `PlaceBet(slot, amount, autoCashOut)`, `PlaceFreeBet`, `CancelBet`, `CashOut`,
`GetBalance`, `GetMyBets`, `GetTopPayouts`. Events: `Round`, `Tick`, `BetPlaced`, `CashedOut`, `MyBet`. Free bets and
promotions come from `/promohub` (`src/promo`, shared with the other crash games).

## Look and feel

A chase camera rides behind a red pickup on a straight two-lane highway across tornado alley. The vehicles are
low-poly 3D models with painted faces (`vehicle3d.ts`, textures in `truckArt.ts`), so they show their flanks, beds and
roofs in true perspective, shade by how each face meets the sky, ride on their springs (rolling in the gusts, squatting
on the launch, diving under braking) and reflect in the wet road. The pickup has an open bed with two tornado probes
and a gear case, a roll bar with work lights, a light bar, tow mirrors, storm decals on the tailgate and doors, and a
weather mast with a spinning anemometer and whip antennas bent back by the wind. The world around it: wheat and
pasture with gusts running through them, verge grass and wheat combed over by the wind, fence lines, delineator posts
whose reflectors catch the light, telephone poles, farmsteads (barn, silo, house with its lamps on, windmill), hay
bales, wind turbines on the horizon, and green **×2 / ×5 / ×10…** signs that you pass exactly when the multiplier
reaches them. The road is wet: wheel tracks, patches, raindrop splashes, tail lights and lightning mirrored in it, and
haze lies over the far fields. Ahead is the supercell: a dark storm base with striations sweeping round it, a bright
slot of clear sky under it with a low sun and light shafts, mammatus, scud racing in towards the wall cloud, rain
curtains and lightning.

- Betting: hazards blink, the funnel lowers out of the slowly turning wall cloud.
- Touchdown: a debris cloud spins up at the base. The funnel is a rope at first, then a cone, then a black wedge as
  the EF rating climbs. Helical bands slide round it, the edges are ragged, and wreckage orbits it. The light goes
  green-grey, rain gets heavier, spray comes off the tyres, and leaves, dust and then planks and sheet metal blow
  across towards the funnel. The EF scale lights up segment by segment; each upgrade plays the weather-radio alert.
- Power lines flash blue-green round the funnel as it strengthens, lighting the scene.
- Other chasers drive ahead in SUVs. When one bails, it swerves onto the shoulder braking hard, hazards on, and drops
  back past the camera.
- Bailing out: your truck swings its nose onto the shoulder, dives under braking and slides back past the lens flank
  first, then a win flash shows the multiplier and the amount.
- The crash: the funnel swings onto the road. Anemometer pegged, siren, camera rolling in the gusts, brown murk, the
  truck's rear stepping out towards the funnel and lifting. Then glass bursts, panels tear off in its paint, and the
  truck is thrown up off the road tumbling end over end (roof, underside, nose), the camera tilting up after it, and
  carried round the funnel (counter-clockwise, as they turn) and up into it. The other chasers go too, nearest the
  funnel first. The dial glass cracks, and the tornado moves off across the fields with the trucks circling in it,
  leaving the empty road behind.
- Sound is all synthesized (`src/game/sound.ts`): wind and the freight-train roar rising with the storm, rain, the
  truck's engine, radar pings, the two-tone alert, thunder timed to the lightning's distance, the siren, the crunch.
  The muted state is remembered.
- `prefers-reduced-motion`: no shake or camera roll, fewer particles, less lightning.

Per-frame values never go through React. The loop in `App.tsx` reads the server clock, steps `StormModel`, draws the
canvas (`src/scene/scene.ts`) and publishes a `Frame` on `frameBus`. The gauges, the EF scale, the readout and the
bail button update their DOM directly from that frame. React only re-renders on hub events.

## Files

- `src/api/hubEngine.ts`: SignalR client for `/livecrashhub`; `demoEngine.ts`: the offline stand-in; `types.ts`: DTOs
- `src/game/useGame.ts`: connection, round and bet state, actions; `clock.ts`: the server clock and e^(rate·t);
  `storm.ts`: wind, EF, pressure, range and truck speed from time, plus the surge and lift; `events.ts`,
  `frameBus.ts`, `sound.ts`
- `src/scene/scene.ts`: the renderer (camera, vehicle poses for driving, bailing, the surge and the lift, power
  flashes, weather, grade); `plains.ts`: sky, fields, road, verge, roadside, signs; `tornado.ts`: storm base, scud,
  rain curtains, lightning, wall cloud, funnel, debris; `vehicle3d.ts`: the pickup and SUV models and their renderer
  (culling, shading, perspective strips, reflections, shadows, roll bar and mast); `truckArt.ts`: paints and the face
  textures; `particles.ts`
- `src/components`: `Gauge` (wind with the EF scale, barometer with the range), `Dash` (EF scale, tornado warning),
  `Readout`, `BetSlot` / `BetPanel`, `LiveBets`, `HistoryStrip`, `TopBar`, modals, `Splash`
- `tools/preview.html`: the scene frozen at fixed moments (betting, touchdown, the chase, bailing out and dropping
  back, EF5, the surge, lift-off, carried round, gone, moving off), for checking the art without waiting for random
  rounds
- `tools/thumbnail.html`: the 1280×720 lobby thumbnail. With `npm run dev` running, open `/tools/thumbnail.html` and
  screenshot it into `public/thumbnail.png`
