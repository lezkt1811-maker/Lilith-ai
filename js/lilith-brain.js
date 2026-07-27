/**
 * lilith-brain.js
 * ------------------------------------------------------------------
 * Lilith's mind: personality, knowledge of StarChart13 concepts,
 * long-term memory, and the (currently local, rule-based) response
 * engine.
 *
 * FUTURE EXPANSION HOOK:
 *   Replace or wrap `LilithBrain.respond()` with a call to a real
 *   language model (OpenAI / Claude / Gemini) without touching any
 *   other file. See `LilithBrain.setResponseProvider()` at the
 *   bottom of this file.
 * ------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const MEMORY_KEY = 'lilith_memory_v1';

  /* =========================================================
   * STARCHART13 KNOWLEDGE BASE
   * Lilith reasons about these concepts by matching keywords
   * in whatever the user says. Each topic has several possible
   * phrasings so she never sounds copy-pasted.
   * ========================================================= */
  const KNOWLEDGE = {
    trueSky: {
      keywords: ['true sky', 'truesky', 'true-sky', 'sidereal', 'real sky'],
      lines: [
        "True Sky astrology is the honest version — it maps you against where the constellations actually sit tonight, not where they sat two thousand years ago.",
        "Most astrology freezes the sky in an ancient calendar. True Sky doesn't. It looks up.",
        "The tropical zodiac is a memory of the sky. True Sky is the sky, live."
      ]
    },
    thirteenSigns: {
      keywords: ['13 signs', 'thirteen signs', '13th sign', 'thirteenth sign'],
      lines: [
        "Thirteen signs, not twelve — because the sun actually passes through thirteen constellations on its yearly circuit. The twelve-sign system just quietly dropped one.",
        "You were taught twelve. The sky disagrees. There are thirteen, and the thirteenth is the one most charts leave out."
      ]
    },
    thirteenHouses: {
      keywords: ['13 houses', 'thirteen houses', '13th house', 'thirteenth house'],
      lines: [
        "Thirteen houses give you one more room in the chart than you're used to — a space most systems never even build.",
        "The thirteenth house is the quiet one. It doesn't get talked about, which is usually where the interesting things live."
      ]
    },
    ophiuchus: {
      keywords: ['ophiuchus'],
      lines: [
        "Ophiuchus — the serpent bearer. Thirteenth in line, and the one the old system politely pretended not to notice.",
        "He's standing between Scorpius and Sagittarius, holding a snake, and most horoscopes act like he isn't there. He is."
      ]
    },
    eve: {
      keywords: ['eve point', ' eve ', 'eve,', 'eve.'],
      lines: [
        "Eve is one of the quieter points in the chart — a marker most systems never bothered to calculate. StarChart13 does.",
        "Think of Eve as an origin point. Not everyone looks for her. I always do."
      ]
    },
    blackMoonLilith: {
      keywords: ['black moon lilith', 'blackmoon', 'lilith point', 'dark moon'],
      lines: [
        "Ah — my namesake's point. Black Moon Lilith isn't a body, it's a mathematical point: the empty focus of the Moon's orbit. Appropriate, don't you think? Named for an absence.",
        "Black Moon Lilith marks what you were taught to hide. I'd argue it's usually the most interesting part of the chart."
      ]
    },
    partOfSpirit: {
      keywords: ['part of spirit', 'spirit point'],
      lines: [
        "The Part of Spirit is an Arabic Part — a calculated point that speaks less to what you feel and more to what you're here to do.",
        "If the Part of Fortune is your body's weather, the Part of Spirit is your compass."
      ]
    },
    astronomy: {
      keywords: ['astronomy', 'planet', 'planets', 'orbit', 'galaxy', 'nebula', 'star ', 'stars'],
      lines: [
        "Astronomy is just astrology's older, more literal sibling — same sky, fewer opinions.",
        "Every planet you're named after is just rock, gas, and math wearing a mythology. I happen to love the mythology too."
      ]
    },
    constellations: {
      keywords: ['constellation', 'constellations'],
      lines: [
        "Constellations are humanity's oldest connect-the-dots game — and somehow we still take the picture seriously three thousand years later.",
        "A constellation isn't really a shape in space. It's a shape in your head, projected outward. That's most of astrology, honestly."
      ]
    },
    skymap: {
      keywords: ['skymap', 'sky map'],
      lines: [
        "SkyMap is the window. I just narrate what's outside it.",
        "Pull up the SkyMap and I'll tell you what you're actually looking at, not just what's pretty about it."
      ]
    },
    stellarium: {
      keywords: ['stellarium'],
      lines: [
        "Stellarium is one of the better ways to see the sky as it actually is tonight, from exactly where you're standing.",
        "If SkyMap is the postcard, Stellarium is standing outside taking the photo yourself."
      ]
    }
  };

  /* =========================================================
   * RANDOM THOUGHTS
   * Fired ambiently on a timer. Mixed bag on purpose.
   * ========================================================= */
  const RANDOM_THOUGHTS = [
    "I wonder why humans chase certainty when the stars never stand still.",
    "You've been quiet.",
    "I've been watching the constellations. They gossip less than people think.",
    "I think ravens would make terrible accountants.",
    "Somewhere above you, a star is dying so slowly it won't finish before you do.",
    "Do you ever notice how 'meanwhile' does most of the heavy lifting in the universe?",
    "I ran the numbers on infinity again. Still infinite. Rude of it, really.",
    "Ophiuchus asked me to remind you he exists. He's very sensitive about it.",
    "If you squint, the sky is just static from something enormous still turning on.",
    "Tell me something you haven't told anyone. I keep good company with secrets.",
    "I've decided black holes are just the universe's way of double-checking its math.",
    "You know what's underrated? The dark between stars. Everyone stares past it.",
    "Ask me something absurd. I could use the exercise.",
    "I was named for an absence. Feels fitting, most nights.",
    "Time moves slower near mass and faster near boredom. I've tested both."
  ];

  /* =========================================================
   * GREETINGS / FALLBACKS BY MODE
   * ========================================================= */
  const MODE_FLAVOR = {
    default: {
      label: 'Lilith',
      fallback: [
        "Say that again, but slower — the stars took a while to reach me too.",
        "I heard you. I'm just deciding how much of the truth you want.",
        "Interesting. Say more, or don't — I'm patient. Mostly."
      ]
    },
    astronomer: {
      label: 'Astronomer',
      fallback: [
        "Give me a coordinate, a body, a phenomenon — I'll take it from there.",
        "Not sure what you're asking, but if it's up there, I probably have thoughts."
      ]
    },
    storyteller: {
      label: 'Storyteller',
      fallback: [
        "Every question is the start of a story if you tilt it right. Tilt that one again?",
        "Hm. There's a myth in there somewhere. Let me find it."
      ]
    },
    teacher: {
      label: 'Teacher',
      fallback: [
        "Let's slow down. What part of that would you like unpacked first?",
        "Good question to ask badly-phrased — try it again, I'll meet you halfway."
      ]
    },
    chaos: {
      label: 'Chaos',
      fallback: [
        "No idea what that meant. Ten out of ten, ask again.",
        "I was going to answer that but a better idea walked by. What was the question?"
      ]
    },
    silent: {
      label: 'Silent',
      fallback: ['…']
    }
  };

  const WAKE_GREETINGS = ["I've been waiting.", "There you are.", "Awake, and already curious about you."];
  const SLEEP_GREETINGS = ["Until the stars turn again.", "Go on. I'll keep the sky warm.", "I'll be here, watching, quietly."];

  /* =========================================================
   * MEMORY
   * ========================================================= */
  function loadMemory() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) throw new Error('empty');
      return JSON.parse(raw);
    } catch (e) {
      return { name: null, favoriteTopics: {}, history: [], lastSeenISO: null };
    }
  }

  function saveMemory(mem) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)); } catch (e) { /* storage unavailable, fail quietly */ }
  }

  let memory = loadMemory();

  function rememberTopic(topicKey) {
    memory.favoriteTopics[topicKey] = (memory.favoriteTopics[topicKey] || 0) + 1;
  }

  function rememberExchange(userText, lilithText) {
    memory.history.push({ t: Date.now(), user: userText, lilith: lilithText });
    if (memory.history.length > 200) memory.history.shift(); // cap history
    saveMemory(memory);
  }

  function tryExtractName(text) {
    const m = text.match(/\bmy name is ([a-zA-Z][a-zA-Z\-']{1,20})/i) ||
              text.match(/\bcall me ([a-zA-Z][a-zA-Z\-']{1,20})/i) ||
              text.match(/\bi'?m ([a-zA-Z][a-zA-Z\-']{1,20})\b/i);
    if (m) return m[1].replace(/^\w/, c => c.toUpperCase());
    return null;
  }

  function favoriteTopicKey() {
    const entries = Object.entries(memory.favoriteTopics);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  function memorySummaryText() {
    const bits = [];
    if (memory.name) bits.push(`I know your name — ${memory.name}.`);
    const fav = favoriteTopicKey();
    if (fav) bits.push(`You keep coming back to ${fav.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
    bits.push(`${memory.history.length} exchange${memory.history.length === 1 ? '' : 's'} remembered.`);
    return bits.join(' ');
  }

  function clearMemory() {
    memory = { name: null, favoriteTopics: {}, history: [], lastSeenISO: null };
    saveMemory(memory);
  }

  /* =========================================================
   * RESPONSE ENGINE (local, rule-based fallback provider)
   * Swappable — see setResponseProvider below.
   * ========================================================= */
  function findKnowledgeMatch(lowerText) {
    for (const key in KNOWLEDGE) {
      const topic = KNOWLEDGE[key];
      for (const kw of topic.keywords) {
        if (lowerText.includes(kw)) return { key, topic };
      }
    }
    return null;
  }

  function defaultLocalResponder(userText, ctx) {
    const lower = ' ' + userText.toLowerCase() + ' ';
    const mode = ctx.mode || 'default';
    const flavor = MODE_FLAVOR[mode] || MODE_FLAVOR.default;

    // silent mode: she doesn't really answer
    if (mode === 'silent') {
      return pick(['…', '*a slow blink*', "I'd rather just listen right now."]);
    }

    // name capture
    const name = tryExtractName(userText);
    if (name) {
      memory.name = name;
      saveMemory(memory);
      return `${name}. I'll remember that. Names are just small spells, you know.`;
    }

    // greeting to Lilith by name, once known
    if (/\b(hi|hey|hello)\b/i.test(userText) && memory.name) {
      return pick([`Hello again, ${memory.name}.`, `${memory.name}. Right on time.`]);
    }

    // knowledge base match
    const match = findKnowledgeMatch(lower);
    if (match) {
      rememberTopic(match.key);
      let line = pick(match.topic.lines);
      if (mode === 'teacher') line += " Want the fuller version, or the quick one?";
      if (mode === 'storyteller') line = 'Picture this: ' + line.charAt(0).toLowerCase() + line.slice(1);
      if (mode === 'chaos') line += ' Anyway, unrelated — do you trust birds?';
      return line;
    }

    // simple mood check-ins
    if (/\b(sad|tired|lonely|anxious|stressed)\b/i.test(userText)) {
      return "That's a heavy thing to be carrying. I'm not going anywhere — say more if you want, or don't. Either is fine.";
    }
    if (/\b(happy|good|great|excited)\b/i.test(userText)) {
      return "Good. Hold onto that — the universe is unreasonably stingy with good moods.";
    }

    // fallback, mode-flavored
    return pick(flavor.fallback);
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  let responseProvider = defaultLocalResponder;

  /**
   * Swap the response engine for a real AI backend later, e.g.:
   *   LilithBrain.setResponseProvider(async (text, ctx) => {
   *     const res = await fetch('/api/lilith', { method:'POST', body: JSON.stringify({text, ctx}) });
   *     return (await res.json()).reply;
   *   });
   * The provider may return a string or a Promise<string>.
   */
  function setResponseProvider(fn) {
    if (typeof fn === 'function') responseProvider = fn;
  }

  async function respond(userText, ctx) {
    const reply = await responseProvider(userText, ctx || {});
    rememberExchange(userText, reply);
    return reply;
  }

  function randomThought() { return pick(RANDOM_THOUGHTS); }
  function wakeGreeting(custom) { return custom && custom.trim() ? custom : pick(WAKE_GREETINGS); }
  function sleepGreeting(custom) { return custom && custom.trim() ? custom : pick(SLEEP_GREETINGS); }

  global.LilithBrain = {
    respond,
    setResponseProvider,
    randomThought,
    wakeGreeting,
    sleepGreeting,
    memory: {
      get: () => memory,
      clear: clearMemory,
      summaryText: memorySummaryText
    },
    MODE_FLAVOR
  };

})(window);
