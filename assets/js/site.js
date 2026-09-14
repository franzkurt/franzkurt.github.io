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

  /* ------------- sumário lateral, montado a partir dos títulos ---------- */
  var listaSumario = document.getElementById('sumario-lista');
  if (listaSumario) {
    var titulos = document.querySelectorAll('.prose h2, .prose h3');
    if (titulos.length >= 3) {          // sumário de dois itens não ajuda ninguém
      var links = [];
      titulos.forEach(function (h, i) {
        if (!h.id) {
          h.id = 'secao-' + (i + 1) + '-' + (h.textContent || '')
            .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        }
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        if (h.tagName === 'H3') a.className = 'sumario__sub';
        listaSumario.appendChild(a);
        links.push(a);
      });

      // destaca a seção visível; sem isso o sumário é só uma lista de links
      if ('IntersectionObserver' in window) {
        var visiveis = new Set();
        var obs = new IntersectionObserver(function (entradas) {
          entradas.forEach(function (e) {
            if (e.isIntersecting) visiveis.add(e.target.id);
            else visiveis.delete(e.target.id);
          });
          var atual = null;
          titulos.forEach(function (h) { if (visiveis.has(h.id) && !atual) atual = h.id; });
          links.forEach(function (a) {
            a.setAttribute('aria-current', a.hash === '#' + atual ? 'true' : 'false');
          });
        }, { rootMargin: '-15% 0px -70% 0px' });
        titulos.forEach(function (h) { obs.observe(h); });
      }
    } else {
      listaSumario.closest('.sumario').remove();
    }
  }

  /* ---------------- links externos abrem em nova aba -------------------- */
  document.querySelectorAll('.prose a[href^="http"]').forEach(function (a) {
    if (a.hostname === window.location.hostname) return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
})();
