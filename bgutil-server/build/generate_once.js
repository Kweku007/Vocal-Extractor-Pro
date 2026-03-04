import { BG, buildURL } from "bgutils-js";
import { JSDOM } from "jsdom";
import { Innertube } from "youtubei.js";
import * as fs from "node:fs";
import * as path from "node:path";

const VERSION = "1.3.0";
const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const TOKEN_TTL_HOURS = 6;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version") { opts.version = true; }
    else if (args[i] === "-c" || args[i] === "--content-binding") { opts.contentBinding = args[++i]; }
    else if (args[i] === "--innertube-context") { opts.innertubeContext = args[++i]; }
    else if (args[i] === "-p" || args[i] === "--proxy") { opts.proxy = args[++i]; }
    else if (args[i] === "-b" || args[i] === "--bypass-cache") { opts.bypassCache = true; }
    else if (args[i] === "-s" || args[i] === "--source-address") { opts.sourceAddress = args[++i]; }
    else if (args[i] === "--disable-tls-verification") { opts.disableTls = true; }
    else if (args[i] === "--verbose") { opts.verbose = true; }
  }
  return opts;
}

const opts = parseArgs();

if (opts.version) {
  console.log(VERSION);
  process.exit(0);
}

let cachedir;
const homeDirectory = process.env.HOME || process.env.USERPROFILE;
const xdgCache = process.env.XDG_CACHE_HOME;
if (xdgCache) {
  cachedir = path.resolve(xdgCache, "bgutil-ytdlp-pot-provider");
} else if (homeDirectory) {
  cachedir = path.resolve(homeDirectory, ".cache", "bgutil-ytdlp-pot-provider");
} else {
  cachedir = path.resolve(import.meta.dirname, "..");
}
if (!fs.existsSync(cachedir)) {
  fs.mkdirSync(cachedir, { recursive: true });
}
const CACHE_PATH = path.resolve(cachedir, "cache.json");

(async () => {
  try {
    let contentBinding = opts.contentBinding;
    let innertubeContext;

    if (opts.innertubeContext) {
      try { innertubeContext = JSON.parse(opts.innertubeContext); } catch {}
    }

    if (!contentBinding) {
      const innertube = await Innertube.create({ retrieve_player: false });
      contentBinding = innertube.session.context.client.visitorData;
      if (!innertubeContext) innertubeContext = innertube.session.context;
    }

    if (!contentBinding) {
      throw new Error("Unable to generate visitor data");
    }

    if (!opts.bypassCache && fs.existsSync(CACHE_PATH)) {
      try {
        const caches = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
        const cached = caches[contentBinding];
        if (cached && new Date(cached.expiresAt) > new Date()) {
          console.log(JSON.stringify({
            poToken: cached.poToken,
            contentBinding: contentBinding,
            expiresAt: cached.expiresAt,
          }));
          process.exit(0);
        }
      } catch {}
    }

    const dom = new JSDOM();
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
    });

    const bgConfig = {
      fetch: (url, options) => fetch(url, options),
      globalObj: globalThis,
      identifier: contentBinding,
      requestKey: REQUEST_KEY,
    };

    const challenge = await BG.Challenge.create(bgConfig);
    if (!challenge) throw new Error("Failed to create challenge");

    const interpreterJs = challenge.interpreterJavascript
      .privateDoNotAccessOrElseSafeScriptWrappedValue;

    if (interpreterJs) {
      new Function(interpreterJs)();
    }

    const poTokenResult = await BG.PoToken.generate({
      program: challenge.program,
      globalName: challenge.globalName,
      bgConfig,
    });

    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
    const result = {
      poToken: poTokenResult.poToken,
      contentBinding,
      expiresAt: expiresAt.toISOString(),
    };

    try {
      let caches = {};
      if (fs.existsSync(CACHE_PATH)) {
        try { caches = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch {}
      }
      caches[contentBinding] = result;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(caches), "utf8");
    } catch {}

    console.log(JSON.stringify(result));
  } catch (e) {
    console.error("Failed while generating POT. err.name = " + e.name + ". err.message = " + e.message + ". err.stack = " + e.stack);
    console.log(JSON.stringify({}));
    process.exit(1);
  }
})();
