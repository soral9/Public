/* 共通: 選択肢・判定ロジック・保存先アダプタ */
(function () {
  'use strict';
  var CFG = window.SALON_CONFIG || {};
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

  function emptyRoom() { return { d1: '', d2: '', a: null, b: null, updated: 0 }; }
  function normalize(x) {
    var r = emptyRoom();
    if (x && typeof x === 'object') {
      r.d1 = String(x.d1 || ''); r.d2 = String(x.d2 || '');
      r.a = isChoice(x.a) ? x.a : null; r.b = isChoice(x.b) ? x.b : null;
      r.updated = Number(x.updated) || 0;
    }
    return r;
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
  var store = stores[CFG.store] || stores.jsonblob;

  function roomId() { return new URLSearchParams(location.search).get('r') || ''; }
  function pageUrl(file, id) {
    var u = new URL(file, location.href); u.search = '?r=' + encodeURIComponent(id); u.hash = '';
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
  function createRoom() { var r = emptyRoom(); r.updated = Date.now(); return store.create(r); }

  // ---- 共通UI ----
  function $(id) { return document.getElementById(id); }
  function renderResultInto(box, room) {
    var r = decide(room); box.innerHTML = '';
    if (!r) return null;
    var aDay = r.aTo, bDay = r.aTo === 1 ? 2 : 1;
    var assign = document.createElement('div'); assign.className = 'assign';
    [[NAMES.a, aDay], [NAMES.b, bDay]].sort(function (x, y) { return x[1] - y[1]; }).forEach(function (p) {
      var d = document.createElement('div');
      d.innerHTML = '<span class="tag ' + (p[1] === 1 ? 'd1' : 'd2') + '">' + (p[1] === 1 ? '①' : '②') + '</span><span class="who"></span><span class="when"></span>';
      d.querySelector('.who').textContent = p[0];
      d.querySelector('.when').textContent = (p[1] === 1 ? room.d1 : room.d2) || '(候補日 未入力)';
      assign.appendChild(d);
    });
    box.appendChild(assign);
    var note = document.createElement('p'); note.className = 'note ' + (r.conflict ? 'warn' : 'ok'); note.textContent = r.reason; box.appendChild(note);
    var votes = document.createElement('p'); votes.className = 'votes';
    votes.innerHTML = '選択: <b></b> = ' + LABEL[room.a] + ' / <b></b> = ' + LABEL[room.b];
    votes.querySelectorAll('b')[0].textContent = NAMES.a; votes.querySelectorAll('b')[1].textContent = NAMES.b;
    box.appendChild(votes);
    return r;
  }
  function shareTextFor(room, r) {
    if (r) {
      var a1 = r.aTo === 1 ? NAMES.a : NAMES.b, a2 = r.aTo === 1 ? NAMES.b : NAMES.a;
      return '【美容院 結果】\n① ' + room.d1 + ' → ' + a1 + '\n② ' + room.d2 + ' → ' + a2 + '\n';
    }
    return '【美容院 日程きめ】\n① ' + room.d1 + '\n② ' + room.d2 + '\n';
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
    roomId: roomId, pageUrl: pageUrl, loadRoom: loadRoom, updateRoom: updateRoom, createRoom: createRoom,
    $: $, renderResultInto: renderResultInto, shareTextFor: shareTextFor, lineShareUrl: lineShareUrl,
    copyText: copyText, fmtTime: fmtTime
  };
})();
