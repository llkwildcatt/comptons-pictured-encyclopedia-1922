/* Compton's Pictured Encyclopedia, 1st edition, c1922 — illustrated companion site.
   Derived from the World Book companion site's app.js (same
   article machinery, same data shape): data/comptons-pictured-encyclopedia-1922/<letter>.json
   is a dict key -> [{h, c}] (paragraph HTML), and words.json is a sorted
   list of [key, display, volume, page]. Full-page plates live in
   data/comptons-pictured-encyclopedia-1922/plates/ and are listed in plates.json.
   Routing is by hash: #/article/<key>, #/letter/<letter>, #/about, #/ (home). */
(function () {
  "use strict";

  // BUILD_V is replaced with the deploy timestamp by deploy-site.py, so
  // every deploy gives the data files a fresh URL and browsers cannot keep
  // serving the previous deploy's cached JSON.
  var BUILD_V = "20261127071704";
  function bust(u) { return u + "?v=" + BUILD_V; }

  var SLUG = "comptons-pictured-encyclopedia-1922";

  var main = document.getElementById("main");
  var searchBox = document.getElementById("search-box");
  var searchForm = document.getElementById("search-form");
  var suggestionsBox = document.getElementById("suggestions");
  var lettersNav = document.getElementById("letters");

  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(q) {
    return q.trim().toLowerCase().replace(/['\u2019]/g, "'");
  }

  function firstLetter(word) {
    var c = (word || "#").charAt(0).toLowerCase();
    return (c >= "a" && c <= "z") ? c : "#";
  }

  var CHAMB = {
    "comptons-pictured-encyclopedia-1922": {
      title: "Compton's Pictured Encyclopedia",
      years: "c1922",
      dir: "data/comptons-pictured-encyclopedia-1922",
      count: "2,754 articles",
      exactPages: true,
      note: "Scanned from the 1922 printed books (F. E. Compton & Co., Chicago), first edition, and cleaned up word by word — 34,936 counted fixes, with thousands more machine-reading errors fixed by the cleanup engine and by reading the sentence around each garbled word. Article page numbers are the exact printed folios, checked against the printed pages. Folios run continuously 1–3842 across the seven article volumes. Volume 8 (study outlines and Fact-Index, folios 3843–4410) holds no articles; it is carried as a reference section — 19 outline sections, 26 letter-history essays, and a 24,244-entry Fact-Index — kept separate from the article counts."
    }
  };

  function workFor(slug) {
    return CHAMB[slug];
  }

  var britWordsCache = {};    // slug -> [[key, display, volume, page], ...]
  var britWordsPromise = {};  // slug -> promise
  var britLetterCache = {};   // slug -> {letter -> {key: [{h, c}, ...]}}
  var platesCache = null;     // {plates: [{key, article, volume, leaf, folio, file, caption}]}
  var platesPromise = null;

  function britKey(q) {
    return (q || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function britRoman(n) {
    n = +n;
    if (!n || n < 1) return String(n);
    var table = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    var out = "";
    var rest = n;
    while (rest >= 10) { out += "X"; rest -= 10; }
    table.forEach(function (pair) {
      while (rest >= pair[0]) { out += pair[1]; rest -= pair[0]; }
    });
    return out;
  }

  function loadBritWords(slug) {
    if (!britWordsPromise[slug]) {
      britWordsPromise[slug] = fetch(bust(workFor(slug).dir + "/words.json"))
        .then(function (r) {
          if (!r.ok) throw new Error(slug + " words.json failed: " + r.status);
          return r.json();
        })
        .then(function (data) { britWordsCache[slug] = data; return data; });
    }
    return britWordsPromise[slug];
  }

  function loadBritLetter(slug, letter) {
    letter = (letter || "#").toLowerCase();
    britLetterCache[slug] = britLetterCache[slug] || {};
    if (britLetterCache[slug][letter]) return Promise.resolve(britLetterCache[slug][letter]);
    return fetch(bust(workFor(slug).dir + "/" + letter + ".json"))
      .then(function (r) {
        if (!r.ok) throw new Error(slug + " letter " + letter + " failed: " + r.status);
        return r.json();
      })
      .then(function (data) { britLetterCache[slug][letter] = data; return data; });
  }

  // Full-page plates (maps, portraits, pictures). A missing plates.json
  // is not an error — the text still renders, just without pictures.
  function loadPlates() {
    if (!platesPromise) {
      platesPromise = fetch(bust(workFor(SLUG).dir + "/plates.json"))
        .then(function (r) {
          if (!r.ok) return { plates: [] };
          return r.json();
        })
        .then(function (data) {
          platesCache = data && data.plates ? data : { plates: [] };
          return platesCache;
        })
        .catch(function () {
          platesCache = { plates: [] };
          return platesCache;
        });
    }
    return platesPromise;
  }

  function platesFor(key, volume) {
    if (!platesCache) return [];
    var out = [];
    platesCache.plates.forEach(function (p) {
      if (p.key === key && p.volume === volume) out.push(p);
    });
    return out;
  }

  // ---- Volume 8 (reference section) ----
  // Vol. 8 holds no articles: 19 study-outline sections, 26 letter-history
  // essays, and the 24,244-entry Fact-Index. Index entries are NOT articles
  // and are never merged into the article words.json; they carry
  // type="index" and are always shown with an "Index entry" marker.
  var vol8Cache = {};    // filename -> parsed JSON
  var vol8Promise = {};  // filename -> promise
  var VOL8_DIR = workFor(SLUG).dir;

  function loadVol8(file) {
    if (!vol8Promise[file]) {
      vol8Promise[file] = fetch(bust(VOL8_DIR + "/" + file))
        .then(function (r) {
          if (!r.ok) throw new Error("vol8 " + file + " failed: " + r.status);
          return r.json();
        })
        .then(function (data) { vol8Cache[file] = data; return data; });
    }
    return vol8Promise[file];
  }

  // Folio -> article lookup for Fact-Index page references. Article folios
  // run continuously 1-3842; the article covering folio F is the one with
  // the greatest starting folio <= F.
  var folioRowsCache = null;
  function folioRows() {
    if (folioRowsCache) return folioRowsCache;
    var index = britWordsCache[SLUG] || [];
    var rows = index.map(function (r) { return [r[3], r[0], r[1]]; });
    rows.sort(function (a, b) { return a[0] - b[0]; });
    folioRowsCache = rows;
    return rows;
  }
  function articleForFolio(f) {
    var rows = folioRows();
    var lo = 0, hi = rows.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid][0] <= f) { found = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (found < 0) return null;
    return { key: rows[found][1], display: rows[found][2], page: rows[found][0] };
  }

  // Plain text split into paragraphs on blank lines (single newlines are
  // line wraps inside a paragraph and are left to the browser).
  function paras(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) { return p.trim(); })
      .filter(function (p) { return p.length > 0; });
  }
  function parasHtml(text) {
    return paras(text).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
  }

  // Binary search over the sorted words index; returns the first index of
  // the key, or -1 when the key is absent.
  function findBritArticle(slug, q) {
    var index = britWordsCache[slug];
    if (!index) return -1;
    var lo = 0, hi = index.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var w = index[mid][0];
      if (w === q) { found = mid; hi = mid - 1; }
      else if (w < q) lo = mid + 1;
      else hi = mid - 1;
    }
    return found;
  }

  function britEntriesFor(slug, q) {
    var index = britWordsCache[slug];
    if (!index) return [];
    var out = [];
    for (var i = 0; i < index.length; i++) {
      if (index[i][0] === q) out.push(index[i]);
    }
    return out;
  }

  function britSuggestionsFor(slug, q, limit) {
    var index = britWordsCache[slug];
    if (!index || !q) return [];
    var out = [];
    var i, w;
    for (i = 0; i < index.length && out.length < limit; i++) {
      w = index[i][0];
      if (w.indexOf(q) === 0 && out.indexOf(index[i]) === -1) out.push(index[i]);
    }
    if (out.length < limit) {
      for (i = 0; i < index.length && out.length < limit; i++) {
        w = index[i][0];
        if (w.indexOf(q) > 0 && out.indexOf(index[i]) === -1) out.push(index[i]);
      }
    }
    return out;
  }

  function dictLettersHtml(slug) {
    var html = "";
    for (var i = 0; i < 26; i++) {
      var letter = String.fromCharCode(97 + i);
      html += '<a href="#/' + slug + "/letter/" + letter + '">' + letter.toUpperCase() + "</a>";
    }
    return html;
  }

  function hideSuggestions() {
    suggestionsBox.hidden = true;
    suggestionsBox.innerHTML = "";
  }

  function showSuggestions(q) {
    var list = britSuggestionsFor(SLUG, normalize(q), 8);
    if (!list.length) { hideSuggestions(); return; }
    suggestionsBox.innerHTML = list.map(function (pair) {
      return '<a href="#/' + SLUG + '/article/' + encodeURIComponent(pair[0]) + '">' + esc(pair[1]) + "</a>";
    }).join("");
    suggestionsBox.hidden = false;
  }

  function renderBritHome(slug) {
    var d = workFor(slug);
    main.innerHTML = '<p class="loading">Loading ' + esc(d.title) + "&hellip;</p>";
    Promise.all([loadBritWords(slug), loadPlates()]).then(function () {
      var plates = platesCache ? platesCache.plates : [];
      var platesLine = "";
      if (plates.length) {
        platesLine = "<p>Illustrated with " + plates.length.toLocaleString() +
          " full-page plates from the printed books — maps, portraits and pictures, " +
          "shown with their articles. The small figures printed inside the articles are not included.</p>";
      }
      var html = '<section class="bible"><h2>' + esc(d.title) + " (" + d.years + ")</h2>" +
        "<p>" + esc(d.count) + ". " + esc(d.note) + "</p>" + platesLine +
        '<p><b>Volume 8 — Study Outlines &amp; Fact-Index:</b> the study volume (folios 3843–4410) holds no articles, ' +
        "but it is here as a reference section — 19 outline sections, 26 letter-history essays, and a 24,244-entry " +
        'Fact-Index, kept separate from the article counts. <a href="#/vol8">Browse Volume 8 &rarr;</a></p>' +
        '<form id="brit-search-form" autocomplete="off">' +
        '<label class="visually-hidden" for="brit-search-box">Look up an article</label>' +
        '<input id="brit-search-box" type="search" placeholder="Look up an article&hellip; e.g. Africa, Airplane" aria-label="Look up an article">' +
        "<button type=\"submit\">Look up</button>" +
        "</form>" +
        '<nav class="letters" aria-label="Browse by letter">' + dictLettersHtml(slug) + "</nav>" +
        '<p class="random"><button type="button" id="brit-random-article">Show me a random article</button></p>' +
        '<p><a href="https://llkwildcatt.github.io/webster-1828-dictionary/">&larr; Webster\'s 1828 Dictionary (main site)</a></p>' +
        "</section>";
      main.innerHTML = html;
      document.title = d.title + " (" + d.years + ")";
      var form = document.getElementById("brit-search-form");
      if (form) form.addEventListener("submit", function (e) {
        e.preventDefault();
        var q = britKey(document.getElementById("brit-search-box").value);
        if (q) location.hash = "#/" + slug + "/article/" + encodeURIComponent(q);
      });
      var btn = document.getElementById("brit-random-article");
      if (btn) btn.addEventListener("click", function () {
        var index = britWordsCache[slug];
        var pair = index[Math.floor(Math.random() * index.length)];
        location.hash = "#/" + slug + "/article/" + encodeURIComponent(pair[0]);
      });
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that book. Please try again.</p>';
    });
  }

  function renderBritLetter(slug, letter) {
    var d = workFor(slug);
    main.innerHTML = '<p class="loading">Loading articles beginning with ' + esc(letter.toUpperCase()) + "&hellip;</p>";
    loadBritLetter(slug, letter).then(function (entries) {
      var keys = Object.keys(entries).sort(function (a, b) { return a.localeCompare(b); });
      var html = '<section class="browse"><h2>' + esc(d.title) + " &mdash; articles beginning with " + esc(letter.toUpperCase()) + "</h2>";
      html += "<p>" + keys.length.toLocaleString() + " articles.</p>";
      html += '<ul class="wordlist">';
      keys.forEach(function (w) {
        html += '<li><a href="#/' + slug + "/article/" + encodeURIComponent(w) + '">' + esc(entries[w][0].h) + "</a></li>";
      });
      html += "</ul>";
      html += '<p><a href="#/' + slug + '/">&larr; ' + esc(d.title) + "</a></p></section>";
      main.innerHTML = html;
      document.title = d.title + " — " + letter.toUpperCase();
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that letter. Please try again.</p>';
    });
  }

  function renderBritNotFound(slug, q) {
    var d = workFor(slug);
    var list = britSuggestionsFor(slug, q, 8);
    var html = '<section class="notfound"><h2>No article for &ldquo;' + esc(q) + "&rdquo; in " + esc(d.title) + "</h2>";
    if (list.length) {
      html += "<p>Did you mean one of these?</p><ul>";
      list.forEach(function (pair) {
        html += '<li><a href="#/' + slug + "/article/" + encodeURIComponent(pair[0]) + '">' + esc(pair[1]) + "</a></li>";
      });
      html += "</ul>";
    } else {
      html += "<p>Try another spelling, or browse by letter above.</p>";
    }
    html += '<p><a href="#/' + slug + '/">&larr; Back to ' + esc(d.title) + "</a></p></section>";
    main.innerHTML = html;
  }

  function renderBritArticle(slug, key) {
    var d = workFor(slug);
    main.innerHTML = '<p class="loading">Loading &ldquo;' + esc(key) + "&rdquo;&hellip;</p>";
    Promise.all([loadBritWords(slug), loadPlates()]).then(function () {
      var idx = findBritArticle(slug, key);
      if (idx < 0) { renderBritNotFound(slug, key); return; }
      return loadBritLetter(slug, firstLetter(key)).then(function (entries) {
        var list = entries[key];
        if (!list || !list.length) { renderBritNotFound(slug, key); return; }
        var index = britWordsCache[slug];
        // words.json entries for this key, in the same order as the
        // letter-file list, carry each article's volume and page.
        var meta = britEntriesFor(slug, key);
        var prev = idx > 0 ? index[idx - 1] : null;
        var next = idx + list.length < index.length ? index[idx + list.length] : null;
        var html = '<article class="entry"><h2>' + esc(list[0].h) + "</h2>";
        list.forEach(function (entry, i) {
          var m = meta[i];
          if (m && m[3] != null) {
            html += '<p class="article-meta">Volume ' + britRoman(m[2]) + " &middot; page " + m[3] + "</p>";
          } else if (m) {
            html += '<p class="article-meta">Volume ' + britRoman(m[2]) + "</p>";
          }
          html += '<div class="definition">' + entry.c + "</div>";
          // Full-page plates belonging to this article (matched by key
          // and volume, so duplicate headwords in other volumes do not
          // pick up each other's pictures).
          if (m) {
            platesFor(key, m[2]).forEach(function (p) {
              html += '<figure class="plate"><img src="' + bust(d.dir + "/" + p.file) +
                '" alt="' + esc(p.caption) + '" loading="lazy">' +
                "<figcaption>" + esc(p.caption) +
                (p.folio ? " &mdash; plate facing page " + p.folio : "") +
                "</figcaption></figure>";
            });
          }
        });
        html += '<nav class="wordnav" aria-label="Previous and next articles"><span>';
        if (prev) html += '&larr; <a href="#/' + slug + "/article/" + encodeURIComponent(prev[0]) + '">' + esc(prev[1]) + "</a>";
        html += "</span><span>";
        if (next) html += '<a href="#/' + slug + "/article/" + encodeURIComponent(next[0]) + '">' + esc(next[1]) + "</a> &rarr;";
        html += "</span></nav>";
        html += '<p><a href="#/' + slug + '/">&larr; ' + esc(d.title) + "</a></p></article>";
        main.innerHTML = html;
        document.title = list[0].h + " — " + d.title;
      });
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that article. Please try again.</p>';
    });
  }

  // ---- Volume 8 views ----
  function vol8BackLink() {
    return '<p><a href="#/vol8">&larr; Volume 8</a> &middot; <a href="#/' + SLUG + '/">&larr; ' + esc(workFor(SLUG).title) + "</a></p>";
  }

  function renderVol8Home() {
    main.innerHTML = '<p class="loading">Loading Volume 8&hellip;</p>';
    loadVol8("vol8-meta.json").then(function (m) {
      var html = '<section class="bible"><h2>Volume 8 — Study Outlines &amp; Fact-Index</h2>' +
        "<p>Volume 8 of <i>Compton's Pictured Encyclopedia</i> (folios 3843–4410) holds no articles. " +
        "It is the study volume: the outlines for systematic study, the history of each letter of the alphabet, " +
        "and the Easy Reference Fact-Index — a miniature work of reference in itself, with short entries and " +
        "page references back to the seven article volumes. Everything in it is kept separate from the article counts.</p>" +
        "<ul>" +
        "<li><a href=\"#/vol8/outlines\">Study Outlines</a> — " + m.outline_sections + " sections, " + Number(m.outline_words).toLocaleString() + " words</li>" +
        "<li><a href=\"#/vol8/essays\">Letter-History Essays</a> — " + m.essays + " essays, one for each letter A–Z (" + Number(m.essay_words).toLocaleString() + " words, every one read from the printed page)</li>" +
        "<li><a href=\"#/vol8/index\">Fact-Index</a> — " + Number(m.index_entries).toLocaleString() + " index entries, " + Number(m.index_refs_total).toLocaleString() + " page references</li>" +
        "<li><a href=\"#/vol8/frontmatter\">Front Matter &amp; Abbreviations</a> — cover, frontispiece, title page, contents, “Making the Most of Compton's”, Editor's Note, and the lists of abbreviations</li>" +
        "</ul>" +
        "<p>Index entries are <b>not articles</b>: every one is marked “Index entry”, and its page numbers link to the article that covers that folio. " +
        "Five entries are known false (continuation fragments of neighbouring entries); they are kept as parsed and flagged, not dropped. " +
        "Four real entries are known lost, their text preserved inside neighbouring entries. Full detail is in the " +
        "<a href=\"#/about\">About</a> page.</p>" +
        vol8BackLink() +
        "</section>";
      main.innerHTML = html;
      document.title = "Volume 8 — Study Outlines & Fact-Index — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load Volume 8. Please try again.</p>';
    });
  }

  function renderVol8Outlines() {
    main.innerHTML = '<p class="loading">Loading the study outlines&hellip;</p>';
    loadVol8("vol8-outlines.json").then(function (sections) {
      var html = '<section class="browse"><h2>Volume 8 — Study Outlines</h2>' +
        "<p>" + sections.length + " sections, as the printed Table of Contents lists them. " +
        "“Picture Story of Houses” and “Picture Story of Transportation” are two separate sections in the book.</p>" +
        '<ul class="wordlist">';
      sections.forEach(function (s, i) {
        html += '<li><a href="#/vol8/outline/' + (i + 1) + '">' + esc(s.title) + "</a> (" + Number(s.words).toLocaleString() + " words)</li>";
      });
      html += "</ul>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "Study Outlines — Volume 8 — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load the outlines. Please try again.</p>';
    });
  }

  function renderVol8Outline(n) {
    n = +n;
    main.innerHTML = '<p class="loading">Loading outline&hellip;</p>';
    loadVol8("vol8-outlines.json").then(function (sections) {
      var s = sections[n - 1];
      if (!s) { main.innerHTML = '<p class="error">No such outline section.</p>' + vol8BackLink(); return; }
      var html = '<section class="entry"><h2>' + esc(s.title) + "</h2>" +
        '<p class="article-meta">Volume 8 &middot; Study Outlines &middot; leaves ' + s.leaf_start + "&ndash;" + s.leaf_end +
        " &middot; folios " + s.folio_start + "&ndash;" + s.folio_end + " &middot; " + Number(s.words).toLocaleString() + " words</p>" +
        '<div class="definition">' +
        s.paragraphs.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
        "</div>" +
        '<nav class="wordnav" aria-label="Previous and next sections"><span>';
      if (n > 1) html += '&larr; <a href="#/vol8/outline/' + (n - 1) + '">' + esc(sections[n - 2].title) + "</a>";
      html += "</span><span>";
      if (n < sections.length) html += '<a href="#/vol8/outline/' + (n + 1) + '">' + esc(sections[n].title) + "</a> &rarr;";
      html += "</span></nav>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = s.title + " — Study Outlines — Volume 8";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that outline. Please try again.</p>';
    });
  }

  function renderVol8Essays() {
    main.innerHTML = '<p class="loading">Loading the letter-history essays&hellip;</p>';
    loadVol8("vol8-essays.json").then(function (essays) {
      var html = '<section class="browse"><h2>Volume 8 — Letter-History Essays</h2>' +
        "<p>One short history opens each letter section of the Fact-Index — how the letter got into the alphabet. " +
        "All 26 were read from the printed pages. Letter-forms and hieroglyphs that cannot be set in type are described in square brackets.</p>" +
        '<ul class="wordlist">';
      essays.forEach(function (e) {
        html += '<li><a href="#/vol8/essay/' + e.letter.toLowerCase() + '">The letter ' + esc(e.letter) + "</a> (folio " + e.folio + ")</li>";
      });
      html += "</ul>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "Letter-History Essays — Volume 8 — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load the essays. Please try again.</p>';
    });
  }

  function renderVol8Essay(letter) {
    letter = (letter || "a").toUpperCase();
    main.innerHTML = '<p class="loading">Loading the letter ' + esc(letter) + " essay&hellip;</p>";
    loadVol8("vol8-essays.json").then(function (essays) {
      var e = null, idx = -1;
      essays.forEach(function (x, i) { if (x.letter === letter) { e = x; idx = i; } });
      if (!e) { main.innerHTML = '<p class="error">No essay for that letter.</p>' + vol8BackLink(); return; }
      var html = '<section class="entry"><h2>The Letter ' + esc(e.letter) + "</h2>" +
        '<p class="article-meta">Volume 8 &middot; Fact-Index, letter ' + esc(e.letter) + " &middot; folio " + e.folio +
        (e.folio_interpolated ? " (folio number interpolated)" : "") + " &middot; read from the printed page</p>" +
        '<div class="definition">' + parasHtml(e.text) + "</div>";
      if (e.note) html += '<p class="flag-note">' + esc(e.note) + "</p>";
      html += '<nav class="wordnav" aria-label="Previous and next essays"><span>';
      if (idx > 0) html += '&larr; <a href="#/vol8/essay/' + essays[idx - 1].letter.toLowerCase() + '">The letter ' + esc(essays[idx - 1].letter) + "</a>";
      html += "</span><span>";
      if (idx < essays.length - 1) html += '<a href="#/vol8/essay/' + essays[idx + 1].letter.toLowerCase() + '">The letter ' + esc(essays[idx + 1].letter) + "</a> &rarr;";
      html += "</span></nav>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "The Letter " + e.letter + " — Volume 8 — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that essay. Please try again.</p>';
    });
  }

  function vol8IndexEntryHtml(e) {
    var html = '<article class="entry"><h2>' + esc(e.headword) + ' <span class="index-badge">Index entry</span></h2>' +
      '<p class="article-meta">Volume 8 &middot; Fact-Index, letter ' + esc(e.letter) + " &middot; folio " + e.folio +
      " (leaf " + e.leaf + ")</p>" +
      '<div class="definition">' + esc(e.text) + "</div>";
    if (e.refs && e.refs.length) {
      html += '<p class="ref-links">See: ' + e.refs.map(function (f) {
        var a = articleForFolio(f);
        return a ? '<a href="#/' + SLUG + "/article/" + encodeURIComponent(a.key) + '">p. ' + f + " (" + esc(a.display) + ")</a>" : "p. " + f;
      }).join(", ") + "</p>";
    } else {
      html += '<p class="ref-links">No page references.</p>';
    }
    if (e.known_false) html += '<p class="flag-note">Flagged: ' + esc(e.flag_note || "Known false entry — a continuation fragment of a neighbouring entry, kept as parsed.") + "</p>";
    if (e.ocr_note) html += '<p class="flag-note">' + esc(e.ocr_note) + "</p>";
    if (e.folio_interpolated) html += '<p class="flag-note">Folio number interpolated from neighbouring leaves (no OCR folio detection on this leaf).</p>';
    html += "</article>";
    return html;
  }

  function vol8IndexSearch(entries, q) {
    q = britKey(q);
    if (!q) return [];
    var out = [];
    var i;
    for (i = 0; i < entries.length && out.length < 20; i++) {
      if (entries[i].key.indexOf(q) === 0) out.push(entries[i]);
    }
    if (out.length < 20) {
      for (i = 0; i < entries.length && out.length < 20; i++) {
        if (entries[i].key.indexOf(q) > 0 && out.indexOf(entries[i]) === -1) out.push(entries[i]);
      }
    }
    return out;
  }

  function renderVol8IndexHome() {
    main.innerHTML = '<p class="loading">Loading the Fact-Index&hellip;</p>';
    Promise.all([loadVol8("vol8-meta.json"), loadVol8("vol8-index.json"), loadBritWords(SLUG)]).then(function (res) {
      var m = res[0], entries = res[1];
      var html = '<section class="bible"><h2>Volume 8 — Easy Reference Fact-Index</h2>' +
        "<p>" + Number(m.index_entries).toLocaleString() + " index entries, " + Number(m.index_refs_total).toLocaleString() +
        " page references back to the seven article volumes. These are <b>index entries, not articles</b> — " +
        "each one is marked, and its page numbers link to the article that covers that folio.</p>" +
        '<form id="vol8-search-form" autocomplete="off">' +
        '<label class="visually-hidden" for="vol8-search-box">Look up an index entry</label>' +
        '<input id="vol8-search-box" type="search" placeholder="Look up an index entry&hellip; e.g. Aberdeen, Abraham Lincoln" aria-label="Look up an index entry">' +
        "<button type=\"submit\">Look up</button>" +
        "</form>" +
        '<div id="vol8-search-results"></div>' +
        '<nav class="letters" aria-label="Browse the Fact-Index by letter">';
      for (var i = 0; i < 26; i++) {
        var letter = String.fromCharCode(65 + i);
        html += '<a href="#/vol8/index/' + letter.toLowerCase() + '">' + letter + " (" + Number(m.index_per_letter[letter]).toLocaleString() + ")</a>";
      }
      html += "</nav>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "Fact-Index — Volume 8 — Compton's Pictured Encyclopedia";
      var form = document.getElementById("vol8-search-form");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var q = document.getElementById("vol8-search-box").value;
        var list = vol8IndexSearch(entries, q);
        var box = document.getElementById("vol8-search-results");
        if (!list.length) { box.innerHTML = "<p>No index entry found for &ldquo;" + esc(q) + "&rdquo;.</p>"; return; }
        box.innerHTML = "<h3>Index entries</h3><ul class=\"search-results\">" + list.map(function (e) {
          return '<li><a href="#/vol8/index/entry/' + esc(e.id) + '">' + esc(e.headword) + "</a> &mdash; folio " + e.folio + "</li>";
        }).join("") + "</ul>";
      });
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load the Fact-Index. Please try again.</p>';
    });
  }

  function renderVol8IndexLetter(letter) {
    letter = (letter || "a").toUpperCase();
    main.innerHTML = '<p class="loading">Loading Fact-Index entries for ' + esc(letter) + "&hellip;</p>";
    loadVol8("vol8-index.json").then(function (entries) {
      var rows = entries.filter(function (e) { return e.letter === letter; });
      var html = '<section class="browse"><h2>Volume 8 — Fact-Index, letter ' + esc(letter) + "</h2>" +
        "<p>" + rows.length.toLocaleString() + " index entries. These are index entries, not articles.</p>" +
        '<ul class="wordlist">';
      rows.forEach(function (e) {
        html += '<li><a href="#/vol8/index/entry/' + esc(e.id) + '">' + esc(e.headword) + "</a> (" + e.folio + ")" +
          (e.known_false ? ' <span class="index-badge">flagged</span>' : "") + "</li>";
      });
      html += "</ul>" + vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "Fact-Index " + letter + " — Volume 8 — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that letter of the Fact-Index. Please try again.</p>';
    });
  }

  function renderVol8IndexEntry(id) {
    main.innerHTML = '<p class="loading">Loading index entry&hellip;</p>';
    Promise.all([loadVol8("vol8-index.json"), loadBritWords(SLUG)]).then(function (res) {
      var entries = res[0];
      var e = null;
      for (var i = 0; i < entries.length; i++) { if (entries[i].id === id) { e = entries[i]; break; } }
      if (!e) {
        main.innerHTML = '<section class="notfound"><h2>No index entry &ldquo;' + esc(id) + "&rdquo;</h2>" +
          "<p>Try another spelling, or browse the Fact-Index by letter.</p>" +
          '<p><a href="#/vol8/index">&larr; Fact-Index</a></p></section>';
        return;
      }
      main.innerHTML = '<section class="browse">' + vol8IndexEntryHtml(e) +
        '<p><a href="#/vol8/index/' + e.letter.toLowerCase() + '">&larr; Fact-Index, letter ' + esc(e.letter) + "</a></p>" +
        vol8BackLink() + "</section>";
      document.title = e.headword + " — Fact-Index — Volume 8";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load that index entry. Please try again.</p>';
    });
  }

  function renderVol8Frontmatter() {
    main.innerHTML = '<p class="loading">Loading Volume 8 front matter&hellip;</p>';
    Promise.all([loadVol8("vol8-frontmatter.json"), loadVol8("vol8-outlines.json"), loadPlates()]).then(function (res) {
      var f = res[0], outlines = res[1];
      var plates = platesCache ? platesCache.plates : [];
      function plateByLeaf(leaf) {
        for (var i = 0; i < plates.length; i++) {
          if (plates[i].volume === 8 && plates[i].leaf === leaf) return plates[i];
        }
        return null;
      }
      function plateHtml(p) {
        if (!p) return "";
        return '<figure class="plate"><img src="' + bust(VOL8_DIR + "/" + p.file) +
          '" alt="' + esc(p.caption) + '" loading="lazy"><figcaption>' + esc(p.caption) + "</figcaption></figure>";
      }
      var html = '<section class="about"><h2>Volume 8 — Front Matter &amp; Abbreviations</h2>';

      html += "<h3>Cover</h3><p>" + esc(f.cover.description) + "</p>";

      var gw = f.frontispiece_gateway;
      html += "<h3>Frontispiece — the gateway</h3><p>" + esc(gw.description) + "</p>";
      html += plateHtml(plateByLeaf(1)) + plateHtml(plateByLeaf(2));

      var ft = f.frontispiece_text;
      html += "<h3>" + esc(ft.title) + "</h3>" + parasHtml(ft.text);

      var fp = f.frontispiece_picture;
      html += "<h3>" + esc(fp.title) + "</h3><p>" + esc(fp.caption) + ". " + esc(fp.description) + "</p>";
      html += plateHtml(plateByLeaf(5));

      var tp = f.title_page;
      html += "<h3>Title page</h3><p><b>" + esc(tp.title) + "</b><br>" + esc(tp.volume) + "</p>" +
        "<p><i>" + esc(tp.motto) + "</i></p><p>" + esc(tp.illustration) + "</p>";

      var cp = f.copyright;
      html += "<h3>Copyright</h3><p>" + esc(cp.text) + "</p>";
      if (!cp.verified) html += '<p class="flag-note">Reconstructed from the scan\'s OCR word order, not read from the page image. ' + esc(cp.note || "") + "</p>";

      var ct = f.contents;
      html += "<h3>Table of Contents</h3><ul>";
      ct.entries.forEach(function (entry) {
        var outlineIdx = -1;
        outlines.forEach(function (s, i) { if (s.title.toLowerCase() === entry.title.toLowerCase()) outlineIdx = i; });
        var label = esc(entry.title) + " — folio " + entry.folio;
        if (outlineIdx >= 0) label = '<a href="#/vol8/outline/' + (outlineIdx + 1) + '">' + esc(entry.title) + "</a> — folio " + entry.folio;
        else if (entry.title.toUpperCase().indexOf("FACT-INDEX") >= 0) label = '<a href="#/vol8/index">THE FACT-INDEX</a> — folio ' + entry.folio;
        html += "<li>" + label;
        if (entry.sub && entry.sub.length) {
          html += "<ul>";
          entry.sub.forEach(function (sub) { html += "<li>" + esc(sub.title) + " — folio " + sub.folio + "</li>"; });
          html += "</ul>";
        }
        html += "</li>";
      });
      html += "</ul>";

      var mm = f.making_the_most;
      html += "<h3>" + esc(mm.title) + "</h3>" + parasHtml(mm.text);
      if (mm.illustrations && mm.illustrations.length) {
        html += "<p>Illustrations in this piece: " + mm.illustrations.map(function (x) { return esc(x.caption) + " (leaf " + x.leaf + ")"; }).join("; ") + ".</p>";
      }

      var fit = f.fact_index_title;
      html += "<h3>Fact-Index title page</h3><p>" + esc(fit.text) + "</p>";
      if (fit.folio_interpolated) html += '<p class="flag-note">Folio number interpolated from neighbouring leaves.</p>';

      var en = f.editors_note;
      html += "<h3>" + esc(en.title) + "</h3>" + parasHtml(en.text);

      var sa = f.special_abbreviations;
      html += "<h3>" + esc(sa.title) + "</h3><ul>";
      sa.entries.forEach(function (pair) { html += "<li><b>" + esc(pair[0]) + "</b> — " + esc(pair[1]) + "</li>"; });
      html += "</ul><p>" + esc(sa.trailer || "") + "</p>";

      var al = f.abbreviations_list;
      html += "<h3>" + esc(al.title) + "</h3>" +
        '<p class="flag-note">Reconstructed from the scan\'s word positions, not read from the page images; some entries may still be garbled.</p><ul>';
      al.pairs.forEach(function (pair) { html += "<li><b>" + esc(pair.abbr) + "</b> — " + esc(pair.expansion) + "</li>"; });
      html += "</ul>";

      var em = f.end_matter;
      html += "<h3>End matter</h3>";
      if (em.leaf_578) html += "<p>Leaf 578: " + esc(em.leaf_578.description) + "</p>";
      if (em.gateway_plate) {
        html += "<p>" + esc(em.gateway_plate.description) + "</p>";
        html += plateHtml(plateByLeaf(579)) + plateHtml(plateByLeaf(580));
      }
      if (em.leaf_581) html += "<p>Leaf 581: " + esc(em.leaf_581.description) + "</p>";

      html += vol8BackLink() + "</section>";
      main.innerHTML = html;
      document.title = "Volume 8 Front Matter — Compton's Pictured Encyclopedia";
    }).catch(function () {
      main.innerHTML = '<p class="error">Could not load Volume 8 front matter. Please try again.</p>';
    });
  }

  function renderAbout() {
    main.innerHTML =
      '<section class="about">' +
      "<h2>About this site</h2>" +
      "<p><i>Compton's Pictured Encyclopedia</i>, 1st edition, c1922, " +
      "in seven article volumes. Editor-in-chief Guy Stanton Ford; managing editors Samuel Bannister Harding " +
      "and Athol Ewart Rollins; art editor Seymour Jones; F. E. Compton & Co., Chicago. " +
      "The book is in the public domain, so anyone may read it, " +
      "share it, and build on it. This site is free for everyone.</p>" +
      "<h2>The text</h2>" +
      "<p>The 2,754 articles were scanned from the printed books and cleaned up word by word — " +
      "34,936 counted fixes (engine 33,006; context 912; proofread 739; headword 279), " +
      "with thousands more machine-reading errors fixed by the cleanup engine " +
      "and by reading the sentence around each garbled word. Article page numbers are the exact printed " +
      "folios, checked against the printed pages; folios run continuously 1–3842 across the seven article volumes. " +
      "Volume 8 (study outlines and Fact-Index, folios 3843–4410) holds no articles; it is carried as a reference section " +
      "(19 outline sections, 26 letter-history essays, 24,244 Fact-Index entries), kept separate from the article counts. " +
      "The 1924 printing is a different printing and was not used as a source of text or page numbers.</p>" +
      "<h2>The pictures</h2>" +
      "<p>The full-page plates from the printed books — maps, portraits and pictures — are shown with " +
      "their articles, reduced in size for the web. The small figures printed inside the articles are not " +
      "included. Volume 8's gateway artwork appears twice — the frontispiece pair (leaves 1–2, the left half carrying " +
      "the Library of Congress copyright-deposit label) and the end pair (leaves 579–580) — book-level plates with no article. " +
      "Plate-leaf text is not part of the article text, as in the " +
      "printed book.</p>" +
      "<h2>Volume 8 — honest limits</h2>" +
      "<p>The Fact-Index count (24,244) is of headword rows as parsed; the old 25,000–30,000 figure was a sampling estimate. " +
      "Five entries are known false (continuation fragments, e.g. “Woodrow Wilson,”) and are kept and flagged, not dropped; " +
      "four real entries are known lost, their text preserved inside neighbouring entries (Joseph of Arimathe'a, Woolly bear, " +
      "Nereus, Ural River). Subheadings inside long entries are sometimes split as separate rows, and table rows (coins, colleges, " +
      "battles, sieges, popes) are absorbed into the preceding entry's text. Page references are heuristic (75,807 refs); " +
      "2,195 index entries sit on the 44 interpolated folios and are flagged. The outlines' picture lists read left/right " +
      "interleaved on 2-column leaves (all items present, order alternates). The LIST OF ABBREVIATIONS (551 pairs) and the " +
      "copyright leaf are OCR-reconstructed, not image-verified. No second full-text copy exists.</p>" +
      "<h2>Honest limits</h2>" +
      "<p>No second full-text copy exists: all verification was against this scan's own page images. " +
      "Proofread coverage is partial by design; garbled tokens may remain, mostly in tables, diagrams and captions. " +
      "The book's own factual errors are kept as printed. " +
      "The checking was done by Larry Kendrick and Harlan Stephen Kendrick.</p>" +
      "<h2>The main site</h2>" +
      "<p>This is a companion site to <a href=\"https://llkwildcatt.github.io/webster-1828-dictionary/\">Webster's 1828 Dictionary</a>, " +
      "which carries Webster's 1828, Black's Law 1st and 2nd editions, Webster's 1844 and 1913, the whole King James Bible, " +
      "the founding documents, and the other encyclopaedias and dictionaries cleaned up the same way.</p>" +
      "</section>";
    document.title = "About — Compton's Pictured Encyclopedia, c1922";
  }

  function route() {
    var hash = location.hash || "#/";
    var parts = hash.replace(/^#\/?/, "").split("/");
    var kind = parts[0] || "";
    if (kind === SLUG) {
      if (parts[1] === "article" && parts[2]) {
        renderBritArticle(SLUG, britKey(decodeURIComponent(parts[2])));
      } else if (parts[1] === "letter" && parts[2]) {
        renderBritLetter(SLUG, parts[2].toLowerCase());
      } else {
        renderBritHome(SLUG);
      }
    } else if (kind === "vol8") {
      if (parts[1] === "outlines") {
        renderVol8Outlines();
      } else if (parts[1] === "outline" && parts[2]) {
        renderVol8Outline(parts[2]);
      } else if (parts[1] === "essays") {
        renderVol8Essays();
      } else if (parts[1] === "essay" && parts[2]) {
        renderVol8Essay(decodeURIComponent(parts[2]));
      } else if (parts[1] === "index" && parts[2] === "entry" && parts[3]) {
        renderVol8IndexEntry(decodeURIComponent(parts[3]));
      } else if (parts[1] === "index" && parts[2]) {
        renderVol8IndexLetter(parts[2]);
      } else if (parts[1] === "index") {
        renderVol8IndexHome();
      } else if (parts[1] === "frontmatter") {
        renderVol8Frontmatter();
      } else {
        renderVol8Home();
      }
    } else if (kind === "about") {
      renderAbout();
    } else {
      renderBritHome(SLUG);
    }
    window.scrollTo(0, 0);
  }

  // Letter navigation (header): browse Compton's articles by letter.
  (function buildLetters() {
    var html = "";
    for (var i = 0; i < 26; i++) {
      var letter = String.fromCharCode(97 + i);
      html += '<a href="#/' + SLUG + "/letter/" + letter + '">' + letter.toUpperCase() + "</a>";
    }
    lettersNav.innerHTML = html;
  })();

  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = britKey(searchBox.value);
    if (q) location.hash = "#/" + SLUG + "/article/" + encodeURIComponent(q);
  });

  searchBox.addEventListener("input", function () {
    var q = searchBox.value;
    if (q.trim().length < 2) { hideSuggestions(); return; }
    loadBritWords(SLUG).then(function () { showSuggestions(q); }).catch(function () {});
  });

  searchBox.addEventListener("blur", function () {
    setTimeout(hideSuggestions, 200);
  });

  searchBox.addEventListener("focus", function () {
    if (searchBox.value.trim().length >= 2) {
      loadBritWords(SLUG).then(function () { showSuggestions(searchBox.value); }).catch(function () {});
    }
  });

  window.addEventListener("hashchange", function () {
    hideSuggestions();
    route();
  });

  loadBritWords(SLUG).catch(function () {
    main.innerHTML = '<p class="error">The book data could not be loaded. Please check your connection and try again.</p>';
  });
  route();
})();
