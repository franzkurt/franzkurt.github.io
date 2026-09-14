(function () {
  'use strict';

  /* ---------- alternância de tema (claro / escuro / do sistema) ---------- */
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function temaAtual() {
    var salvo = null;
    try { salvo = localStorage.getItem('theme'); } catch (e) {}
    if (salvo === 'dark' || salvo === 'light') return salvo;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var novo = temaAtual() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', novo);
      try { localStorage.setItem('theme', novo); } catch (e) {}
      toggle.setAttribute('aria-pressed', String(novo === 'dark'));
    });
  }

  /* ---------------- botão "copiar" nos blocos de código ----------------- */
  document.querySelectorAll('.prose pre').forEach(function (pre) {
    var code = pre.querySelector('code') || pre;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'copiar';
    btn.addEventListener('click', function () {
      var texto = code.innerText;
      var ok = function () {
        btn.textContent = 'copiado';
        setTimeout(function () { btn.textContent = 'copiar'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(ok, function () { btn.textContent = 'erro'; });
      } else {
        var ta = document.createElement('textarea');
        ta.value = texto;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) { btn.textContent = 'erro'; }
        document.body.removeChild(ta);
      }
    });
    pre.appendChild(btn);
  });

  /* ------------ tabelas largas ganham rolagem própria no celular --------- */
  document.querySelectorAll('.prose table').forEach(function (table) {
    if (table.parentElement.classList.contains('table-scroll')) return;
    var box = document.createElement('div');
    box.className = 'table-scroll';
    table.parentNode.insertBefore(box, table);
    box.appendChild(table);
  });

  /* ---------------- links externos abrem em nova aba -------------------- */
  document.querySelectorAll('.prose a[href^="http"]').forEach(function (a) {
    if (a.hostname === window.location.hostname) return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
})();
