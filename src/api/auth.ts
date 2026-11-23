import { API_BASE, GAME_ID } from './base';

// Production: the lobby launches the game as /?token=<jwt>.
// Dev/staging: the API's GET /api/dev-token mints a random player for this game.
// One token per page: the game hub and the promo hub connect at the same time, and each would otherwise mint
// its own dev player.
let token: Promise<string> | null = null;

export function getToken(): Promise<string> {
  token ??= fetchToken().catch((e: unknown) => {
    token = null; // the next call tries again
    throw e;
  });
  return token;
}

async function fetchToken(): Promise<string> {
  const fromUrl = new URLSearchParams(window.location.search).get('token');
  if (fromUrl) return fromUrl;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/dev-token?gameId=${GAME_ID}`);
  } catch {
    throw new Error('Connection lost.');
  }
  if (!res.ok) throw new Error('No session token. Launch the game from the lobby, or run the API in Development mode.');
  return ((await res.json()) as { token: string }).token;
}
