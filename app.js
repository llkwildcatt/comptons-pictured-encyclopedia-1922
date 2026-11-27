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
  var BUILD_V = "20261127045520";
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
      count: "2,736 articles",
      exactPages: true,
      note: "Scanned from the 1922 printed books (F. E. Compton & Co., Chicago), first edition, and cleaned up word by word — 34,936 counted fixes, with thousands more machine-reading errors fixed by the cleanup engine and by reading the sentence around each garbled word. Article page numbers are the exact printed folios, checked against the printed pages. Folios run continuously 1–3842 across the seven article volumes; volume 8 (study outlines and Fact-Index) holds no articles."
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
      "<p>The 2,736 articles were scanned from the printed books and cleaned up word by word — " +
      "34,936 counted fixes (engine 33,006; context 912; proofread 739; headword 279), " +
      "with thousands more machine-reading errors fixed by the cleanup engine " +
      "and by reading the sentence around each garbled word. Article page numbers are the exact printed " +
      "folios, checked against the printed pages; folios run continuously 1–3842 across the seven article volumes. " +
      "Volume 8 (study outlines and Fact-Index) holds no articles and is excluded. " +
      "The 1924 printing is a different printing and was not used as a source of text or page numbers.</p>" +
      "<h2>The pictures</h2>" +
      "<p>The full-page plates from the printed books — maps, portraits and pictures — are shown with " +
      "their articles, reduced in size for the web. The small figures printed inside the articles are not " +
      "included. Volume 8's two-leaf colour plate (gateway artwork, signed 'Hilda Hanway') is a book-level " +
      "plate with no article. Plate-leaf text is not part of the article text, as in the " +
      "printed book.</p>" +
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
