import { JSDOM } from "jsdom";

interface PoTokenResult {
  visitorData: string;
  poToken: string;
}

let cachedToken: { result: PoTokenResult; expiresAt: number } | null = null;

export async function generatePoToken(): Promise<PoTokenResult> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    console.log("[pot] Using cached PO token");
    return cachedToken.result;
  }

  console.log("[pot] Generating fresh PO token...");

  const { BG } = await import("bgutils-js");
  const { Innertube } = await import("youtubei.js");

  const requestKey = "O43z0dpjhgX20SCx4KAo";

  const innertube = await Innertube.create({ retrieve_player: false });
  const visitorData = innertube.session.context.client.visitorData;

  if (!visitorData) {
    throw new Error("Failed to get visitor data from Innertube");
  }

  const dom = new JSDOM();
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });

  const bgConfig = {
    fetch: (input: any, init: any) => fetch(input, init),
    globalObj: globalThis,
    identifier: visitorData,
    requestKey,
  };

  const challenge = await BG.Challenge.create(bgConfig);

  if (!challenge) {
    throw new Error("Failed to create BotGuard challenge");
  }

  const interpreterJavascript = challenge.interpreterJavascript
    .privateDoNotAccessOrElseSafeScriptWrappedValue;

  if (interpreterJavascript) {
    new Function(interpreterJavascript)();
  } else {
    console.warn("[pot] No interpreter javascript found in challenge");
  }

  const poTokenResult = await BG.PoToken.generate({
    program: challenge.program,
    globalName: challenge.globalName,
    bgConfig,
  });

  const result: PoTokenResult = {
    visitorData,
    poToken: poTokenResult.poToken,
  };

  cachedToken = {
    result,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  };

  console.log(`[pot] Generated PO token (visitor: ${visitorData.slice(0, 20)}...)`);
  return result;
}
