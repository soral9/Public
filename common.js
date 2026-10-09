/* 共通: 選択肢・判定ロジック・保存先アダプタ */
(function () {
  'use strict';
  var CFG = window.SALON_CONFIG || {};
  CFG.firebaseUrlFixed = String(CFG.firebaseUrl || '').trim();
  var NAMES = CFG.names || { a: '兄', b: '弟' };

  var OPTIONS = [
    { v: -2, label: '絶対①', sub: '①じゃないと無理' },
    { v: -1, label: '①',     sub: '①がいい' },
    { v:  0, label: 'どっちでもいい', sub: '相手に合わせる' },
    { v:  1, label: '②',     sub: '②がいい' },
    { v:  2, label: '絶対②', sub: '②じゃないと無理' }
  ];
  var LABEL = {}; OPTIONS.forEach(function (o) { LABEL[o.v] = o.label; });
  function isChoice(v) { return OPTIONS.some(function (o) { return o.v === v; }); }

  function emptyRoom() { return { d1: '', d2: '', dates: [], round: '', a: null, b: null, updated: 0 }; }
  function normalize(x) {
    var r = emptyRoom();
    if (x && typeof x === 'object') {
      r.d1 = String(x.d1 || ''); r.d2 = String(x.d2 || '');
      r.dates = Array.isArray(x.dates) ? x.dates.filter(function (d) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d); }).sort() : [];
      r.round = String(x.round || '');
      r.a = isChoice(x.a) ? x.a : null; r.b = isChoice(x.b) ? x.b : null;
      r.updated = Number(x.updated) || 0;
    }
    return r;
  }

  // ---- 年間候補日リスト ----
  // 「10月25日11時30分：」のような行を解釈。年は startYear から始め、月が戻ったら翌年にする。
  function toHalf(t) { return t.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDates(text, startYear) {
    var re = /(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})\s*[時:：]\s*(\d{1,2})?\s*分?)?/g;
    var out = [], year = Number(startYear), prevMonth = 0, m;
    var src = toHalf(String(text || ''));
    while ((m = re.exec(src)) !== null) {
      var mo = +m[1], d = +m[2], h = m[3] === undefined ? 0 : +m[3], mi = m[4] === undefined ? 0 : +m[4];
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) continue;
      if (prevMonth && mo < prevMonth) year++;
      prevMonth = mo;
      out.push(year + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(h) + ':' + pad(mi));
    }
    return out.sort();
  }
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function parseIso(iso) {
    var p = iso.split(/[-T:]/).map(Number);
    return new Date(p[0], p[1] - 1, p[2], p[3], p[4]);
  }
  function fmtDate(iso, withYear) {
    var d = parseIso(iso);
    return (withYear ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WEEK[d.getDay()] + ') ' + d.getHours() + ':' + pad(d.getMinutes());
  }
  // 今日以降の直近2件
  function upcoming(dates, now) {
    var t0 = new Date(now || Date.now()); t0.setHours(0, 0, 0, 0);
    return dates.filter(function (iso) { return parseIso(iso) >= t0; }).slice(0, 2);
  }
  // 画面に出す「今回の候補日」と、その回に対する選択。リストがなければ手入力の d1/d2 を使う。
  function view(room, now) {
    var v = { d1: room.d1, d2: room.d2, key: 'manual', auto: false, a: room.a, b: room.b, list: room.dates, next: [] };
    if (room.dates.length) {
      var up = upcoming(room.dates, now);
      v.auto = true; v.next = up;
      v.d1 = up[0] ? fmtDate(up[0]) : ''; v.d2 = up[1] ? fmtDate(up[1]) : '';
      v.key = up.join('|') || 'none';
    }
    // 別の回の選択は無効
    if (room.round && room.round !== v.key) { v.a = null; v.b = null; }
    if (!room.round && v.key !== 'manual') { v.a = null; v.b = null; }
    return v;
  }

  // ---- 判定 ----
  // 点数: 絶対①=-2, ①=-1, どっちでも=0, ②=+1, 絶対②=+2
  // diff = b - a。正なら A→①/B→②、負なら A→②/B→①、0 なら同点(コイントス)。
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function decide(s) {
    if (s.a === null || s.b === null) return null;
    var na = NAMES.a, nb = NAMES.b;
    var diff = s.b - s.a;
    var r = { aTo: 1, tie: false, conflict: false, reason: '' };
    if (diff > 0) r.aTo = 1;
    else if (diff < 0) r.aTo = 2;
    else {
      r.tie = true;
      r.aTo = (hash(s.d1 + '|' + s.d2) % 2 === 0) ? 1 : 2;
      if (s.a === 0) r.reason = '2人とも「どっちでもいい」なので、コイントスで決めました。';
      else if (Math.abs(s.a) === 2) { r.conflict = true; r.reason = '2人とも「' + LABEL[s.a] + '」で完全に競合しています。暫定でコイントスの結果を出しましたが、相談して決めてください。'; }
      else r.reason = '2人とも「' + LABEL[s.a] + '」で希望が同じなので、コイントスで決めました。';
    }
    if (!r.tie) {
      var aGot = s.a === 0 || (s.a < 0 && r.aTo === 1) || (s.a > 0 && r.aTo === 2);
      var bGot = s.b === 0 || (s.b < 0 && r.aTo === 2) || (s.b > 0 && r.aTo === 1);
      if (aGot && bGot) r.reason = '2人の希望どおりに決まりました。';
      else if (!aGot) r.reason = na + 'は「' + LABEL[s.a] + '」でしたが、' + nb + 'の希望の方が強い(' + LABEL[s.b] + ')ので譲る形になりました。';
      else r.reason = nb + 'は「' + LABEL[s.b] + '」でしたが、' + na + 'の希望の方が強い(' + LABEL[s.a] + ')ので譲る形になりました。';
    }
    return r;
  }

  // ---- 保存先 ----
  function jsonHeaders() { return { 'Content-Type': 'application/json', 'Accept': 'application/json' }; }
  var stores = {
    jsonblob: {
      base: 'https://jsonblob.com/api/jsonBlob',
      create: function (data) {
        return fetch(this.base, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) })
          .then(function (res) {
            if (!res.ok) throw new Error('create failed ' + res.status);
            var loc = res.headers.get('Location') || res.headers.get('X-jsonblob') || '';
            var id = loc.split('/').pop();
            if (!id) throw new Error('no id');
            return id;
          });
      },
      load: function (id) {
        return fetch(this.base + '/' + encodeURIComponent(id), { headers: jsonHeaders(), cache: 'no-store' })
          .then(function (res) { if (!res.ok) throw new Error('load failed ' + res.status); return res.json(); });
      },
      save: function (id, data) {
        return fetch(this.base + '/' + encodeURIComponent(id), { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) })
          .then(function (res) { if (!res.ok) throw new Error('save failed ' + res.status); });
      }
    },
    firebase: {
      url: function (id) { return String(CFG.firebaseUrl || '').replace(/\/+$/, '') + '/rooms/' + encodeURIComponent(id) + '.json'; },
      create: function (data) {
        var id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        return this.save(id, data).then(function () { return id; });
      },
      load: function (id) {
        return fetch(this.url(id), { cache: 'no-store' })
          .then(function (res) { if (!res.ok) throw new Error('load failed ' + res.status); return res.json(); });
      },
      save: function (id, data) {
        return fetch(this.url(id), { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) })
          .then(function (res) { if (!res.ok) throw new Error('save failed ' + res.status); });
      }
    }
  };
  // 保存先の決定: config.js の firebaseUrl > リンクの ?db= > この端末に保存したURL > jsonblob
  var params = new URLSearchParams(location.search);
  var dbFromLink = params.get('db') || '';
  var dbSaved = ''; try { dbSaved = localStorage.getItem('salon-db') || ''; } catch (e) {}
  var dbUrl = String(CFG.firebaseUrl || '').trim() || dbFromLink || dbSaved;
  if (dbFromLink) { try { localStorage.setItem('salon-db', dbFromLink); } catch (e) {} }
  if (CFG.jsonblobUrl) stores.jsonblob.base = String(CFG.jsonblobUrl).replace(/\/+$/, '');
  var store;
  if (dbUrl) { store = stores.firebase; CFG.firebaseUrl = dbUrl; }
  else store = stores.jsonblob;
  var storeName = dbUrl ? 'firebase' : 'jsonblob';
  function setDbUrl(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/.test(url)) return false;
    try { localStorage.setItem('salon-db', url); } catch (e) {}
    CFG.firebaseUrl = url; dbUrl = url; store = stores.firebase; storeName = 'firebase';
    return true;
  }
  function roomId() { return params.get('r') || ''; }
  function pageUrl(file, id) {
    var u = new URL(file, location.href); u.hash = '';
    var q = '?r=' + encodeURIComponent(id);
    // config.js に書いていないときだけ、リンクでDBのURLを引き継ぐ
    if (dbUrl && !CFG.firebaseUrlFixed) q += '&db=' + encodeURIComponent(dbUrl);
    u.search = q;
    return u.toString();
  }
  function loadRoom(id) { return store.load(id).then(normalize); }
  // 最新を読み直してから自分の変更だけを上書き保存(同時操作で相手の選択を消さないため)
  function updateRoom(id, patch) {
    return loadRoom(id).then(function (cur) {
      Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
      cur.updated = Date.now();
      return store.save(id, cur).then(function () { return cur; });
    });
  }
  // 選択を保存。回(round)が変わっていたら相手の古い選択も消す
  function saveChoice(id, role, value) {
    return loadRoom(id).then(function (cur) {
      var key = view(cur).key;
      if (cur.round !== key) { cur.a = null; cur.b = null; cur.round = key; }
      cur[role] = value; cur.updated = Date.now();
      return store.save(id, cur).then(function () { return cur; });
    });
  }
  function createRoom() { var r = emptyRoom(); r.updated = Date.now(); return store.create(r); }

  // ---- 共通UI ----
  function $(id) { return document.getElementById(id); }
  function renderResultInto(box, room) {
    var v = view(room);
    var r = decide(v); box.innerHTML = '';
    if (!r) return null;
    var aDay = r.aTo, bDay = r.aTo === 1 ? 2 : 1;
    var assign = document.createElement('div'); assign.className = 'assign';
    [[NAMES.a, aDay], [NAMES.b, bDay]].sort(function (x, y) { return x[1] - y[1]; }).forEach(function (p) {
      var d = document.createElement('div');
      d.innerHTML = '<span class="tag ' + (p[1] === 1 ? 'd1' : 'd2') + '">' + (p[1] === 1 ? '①' : '②') + '</span><span class="who"></span><span class="when"></span>';
      d.querySelector('.who').textContent = p[0];
      d.querySelector('.when').textContent = (p[1] === 1 ? v.d1 : v.d2) || '(候補日 未入力)';
      assign.appendChild(d);
    });
    box.appendChild(assign);
    var note = document.createElement('p'); note.className = 'note ' + (r.conflict ? 'warn' : 'ok'); note.textContent = r.reason; box.appendChild(note);
    var votes = document.createElement('p'); votes.className = 'votes';
    votes.innerHTML = '選択: <b></b> = ' + LABEL[v.a] + ' / <b></b> = ' + LABEL[v.b];
    votes.querySelectorAll('b')[0].textContent = NAMES.a; votes.querySelectorAll('b')[1].textContent = NAMES.b;
    box.appendChild(votes);
    return r;
  }
  function shareTextFor(room, r) {
    var v = view(room);
    if (r) {
      var a1 = r.aTo === 1 ? NAMES.a : NAMES.b, a2 = r.aTo === 1 ? NAMES.b : NAMES.a;
      return '【美容院 結果】\n① ' + v.d1 + ' → ' + a1 + '\n② ' + v.d2 + ' → ' + a2 + '\n';
    }
    return '【美容院 日程きめ】\n① ' + v.d1 + '\n② ' + v.d2 + '\n';
  }
  function lineShareUrl(text) { return 'https://line.me/R/share?text=' + encodeURIComponent(text); }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    fallbackCopy(text); return Promise.resolve();
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
  }
  function fmtTime(ms) { if (!ms) return ''; var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }

  window.Salon = {
    NAMES: NAMES, OPTIONS: OPTIONS, LABEL: LABEL, decide: decide, normalize: normalize,
    roomId: roomId, pageUrl: pageUrl, loadRoom: loadRoom, updateRoom: updateRoom, saveChoice: saveChoice, createRoom: createRoom,
    view: view, parseDates: parseDates, fmtDate: fmtDate, upcoming: upcoming,
    $: $, renderResultInto: renderResultInto, shareTextFor: shareTextFor, lineShareUrl: lineShareUrl,
    copyText: copyText, fmtTime: fmtTime, setDbUrl: setDbUrl, storeName: function () { return storeName; }, dbUrl: function () { return dbUrl; }
  };
})();
