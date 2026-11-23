// In dev, relative URLs go through the Vite proxy (vite.config.ts) to localhost:5003. In production the frontend
// and API are on different hosts (stormchaser.easygamesdemo.co.za / the game API), so builds set VITE_API_BASE to
// the API's absolute origin.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

/** This game's id on the API: the "stormchaser" entry in the "Games" list (Engine LiveCrash). It tags the session token. */
export const GAME_ID = 'stormchaser';

/** `?demo` or VITE_DEMO=1 plays offline against the in-browser demo engine. */
export const DEMO: boolean =
  import.meta.env.VITE_DEMO === '1' || new URLSearchParams(window.location.search).has('demo');
