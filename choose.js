/* A・Bの選択ページ共通。 window.APP_ROLE = 'a' | 'b' を各ページで指定 */
(function () {
  'use strict';
  var S = window.App, $ = S.$;
  var role = (document.currentScript && document.currentScript.getAttribute('data-role')) === 'b' ? 'b' : 'a';
  var id = S.roomId();
  var room = null;

  function show(el, on) { el.hidden = !on; }
  function setErr(msg) { $('err').textContent = msg || ''; show($('err'), !!msg); }

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
    var me = S.NAMES[role], other = S.NAMES[role === 'a' ? 'b' : 'a'];
    document.title = me + 'の選択｜' + S.title();
    $('who').textContent = me;
    var v = S.view(room);
    var hasDates = !!(v.d1 && v.d2);
    $('d1').textContent = v.d1 || (v.auto ? '(リストに今日以降の日付がありません)' : '(未登録)');
    $('d2').textContent = v.d2 || (v.auto ? '(次の候補日がありません)' : '(未登録)');
    show($('noDates'), !hasDates);
    show($('secChoose'), hasDates);
    if (!hasDates) { show($('secR'), false); show($('waiting'), false); return; }
    renderChoices(v);
    var mine = v[role] !== null;
    $('state').textContent = mine
      ? 'あなたの選択: ' + S.LABEL[v[role]] + '（押し直すと変更できます）'
      : 'まだ選んでいません。';
    var r = S.renderResultInto($('result'), room);
    show($('secR'), !!r);
    show($('waiting'), mine && !r);
    $('waitMsg').textContent = other + 'がまだ選んでいません。' + other + 'が選ぶと結果が出ます。';
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
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  if (id) setInterval(refresh, 20000);
  refresh();
})();
