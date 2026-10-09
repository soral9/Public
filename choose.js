/* A・Bの選択ページ共通。 window.SALON_ROLE = 'a' | 'b' を各ページで指定 */
(function () {
  'use strict';
  var S = window.Salon, $ = S.$;
  var role = window.SALON_ROLE === 'b' ? 'b' : 'a';
  var me = S.NAMES[role], other = S.NAMES[role === 'a' ? 'b' : 'a'];
  var id = S.roomId();
  var room = null;

  function show(el, on) { el.hidden = !on; }
  function setErr(msg) { $('err').textContent = msg || ''; show($('err'), !!msg); }

  document.title = me + 'の選択｜日程決め';
  $('who').textContent = me;
  $('indexLink').href = id ? S.pageUrl('index.html', id) : 'index.html';

  if (!id) {
    setErr('このページは、トップページから送られたリンク(?r=…付き)で開いてください。');
    show($('secChoose'), false);
  }

  function renderChoices(v) {
    var c = $('choices'); c.innerHTML = '';
    S.OPTIONS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'choice'; b.dataset.v = o.v;
      b.setAttribute('aria-pressed', v && v[role] === o.v ? 'true' : 'false');
      b.innerHTML = '<span>' + o.label + '</span><small>' + o.sub + '</small>';
      b.addEventListener('click', function () { choose(o.v); });
      c.appendChild(b);
    });
  }
  function render() {
    if (!room) return;
    var v = S.view(room);
    $('d1').textContent = v.d1 || '(未入力)';
    $('d2').textContent = v.d2 || '(未入力)';
    renderChoices(v);
    var mine = v[role] !== null;
    $('state').textContent = mine
      ? 'あなたの選択: ' + S.LABEL[v[role]] + '（押し直すと変更できます）'
      : 'まだ選んでいません。';
    var r = S.renderResultInto($('result'), room);
    show($('secR'), !!r);
    show($('waiting'), mine && !r);
    $('waitMsg').textContent = other + 'がまだ選んでいません。' + other + 'が選ぶと結果が出ます。';
    $('meta').textContent = room.updated ? '最終更新: ' + S.fmtTime(room.updated) : '';
  }
  function choose(v) {
    var btns = document.querySelectorAll('.choice');
    btns.forEach(function (b) { b.disabled = true; });
    S.saveChoice(id, role, v).then(function (r) { room = r; setErr(''); render(); $('toast').textContent = '送信しました。'; setTimeout(function () { $('toast').textContent = ''; }, 3000); })
      .catch(function (e) { setErr('送信に失敗しました。もう一度押してください。(' + e.message + ')'); })
      .then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }
  function refresh() {
    if (!id) return;
    S.loadRoom(id).then(function (r) { room = r; setErr(''); render(); })
      .catch(function (e) { setErr('読み込みに失敗しました。(' + e.message + ')'); });
  }
  $('btnRefresh').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  if (id) setInterval(refresh, 20000);
  refresh();
})();
