/* Storefront survey widget (inline block + pop-up embed). Talks to the app through the Shopify app proxy. */
(function () {
  'use strict';

  var TEXT = {
    question: 'Question {n} of {total}',
    save: 'Next',
    submit: 'Submit',
    close: 'Close',
    thanksTitle: 'Thanks for your feedback!',
    thanksText: 'Your response has been submitted',
    enter: 'Type your answer',
    other: 'Please specify',
    ratingLow: '1 = Poor',
    ratingHigh: '5 = Excellent',
    npsLow: '0 = Not likely',
    npsHigh: '10 = Very likely',
    editorHint: 'The survey will appear here when an active storefront survey matches this page.',
  };

  var PAGE_MAP = { index: 'home', product: 'product', collection: 'collection', cart: 'cart', page: 'page', blog: 'blog', article: 'blog' };
  var WEEK = 7 * 24 * 60 * 60 * 1000;

  // ── tiny storage helpers (storage can be blocked) ──
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function visitorId() {
    var id = lsGet('ft_visitor');
    if (!id) {
      id = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
      lsSet('ft_visitor', id);
    }
    return id;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /** Where to go after an answer: a question number (1-based), 'end', or null for "next" */
  function nextStep(question, answerText) {
    var rules = Array.isArray(question.branchRules) ? question.branchRules : [];
    var answer = String(answerText == null ? '' : answerText);
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var a = Number(answer);
      var v = Number(rule.value);
      var hit = rule.op === 'eq' ? answer.toLowerCase() === String(rule.value).toLowerCase()
        : rule.op === 'lte' ? !isNaN(a) && !isNaN(v) && a <= v
        : rule.op === 'gte' ? !isNaN(a) && !isNaN(v) && a >= v
        : false;
      if (hit) return rule.goTo;
    }
    if (rules.length === 0 && question.isConditional && ['no', 'non'].indexOf(answer.toLowerCase()) !== -1) return 'end';
    return null;
  }

  function canShow(survey, design, mode) {
    if (lsGet('ft_survey_' + survey.id + '_done')) return false;
    if (mode === 'inline') return true;
    var freq = design.frequency || 'week';
    if (freq === 'always') return true;
    if (freq === 'session') return !ssGet('ft_survey_' + survey.id + '_dismissed');
    var at = Number(lsGet('ft_survey_' + survey.id + '_dismissed') || 0);
    return !at || Date.now() - at > WEEK;
  }

  function applyDesign(node, design) {
    var map = { '--ft-accent': design.accent, '--ft-bg': design.background, '--ft-text': design.text };
    Object.keys(map).forEach(function (k) { if (map[k]) node.style.setProperty(k, map[k]); });
    if (design.radius !== undefined && design.radius !== '') node.style.setProperty('--ft-radius', Number(design.radius) + 'px');
    var fonts = { serif: 'Georgia, "Times New Roman", serif', system: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', mono: 'ui-monospace, Menlo, Consolas, monospace' };
    if (design.font && fonts[design.font]) node.style.setProperty('--ft-font', fonts[design.font]);
  }

  // Testing helper: open any page with ?ft_reset=1 to forget "closed" and "finished" for this browser
  try {
    if (window.location.search.indexOf('ft_reset=1') !== -1) {
      Object.keys(window.localStorage).filter(function (k) { return k.indexOf('ft_survey_') === 0; }).forEach(function (k) { window.localStorage.removeItem(k); });
      Object.keys(window.sessionStorage).filter(function (k) { return k.indexOf('ft_survey_') === 0; }).forEach(function (k) { window.sessionStorage.removeItem(k); });
    }
  } catch (e) { /* ignore */ }

  function init(root) {
    if (root.getAttribute('data-ft-ready')) return;
    root.setAttribute('data-ft-ready', '1');

    var mode = root.getAttribute('data-mode') === 'popup' ? 'popup' : 'inline';
    var proxy = root.getAttribute('data-proxy') || '/apps/surveyquery';
    var designMode = root.getAttribute('data-design-mode') === 'true';
    var pageType = PAGE_MAP[root.getAttribute('data-page-type')] || 'other';

    var params = new URLSearchParams({
      page: pageType,
      productId: root.getAttribute('data-product-id') || '',
      collectionId: root.getAttribute('data-collection-id') || '',
      country: root.getAttribute('data-country') || '',
      total: root.getAttribute('data-cart-total') || '0',
    });

    fetch(proxy + '/survey?' + params.toString(), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { survey: null }; })
      .then(function (data) {
        if (!data || !data.survey) {
          if (designMode && mode === 'inline') root.appendChild(el('p', 'ft-hint', TEXT.editorHint));
          return;
        }
        start(root, data.survey, mode, proxy, pageType, designMode);
      })
      .catch(function () { /* storefront must never break because of the survey */ });
  }

  function start(root, survey, mode, proxy, pageType, designMode) {
    var design = survey.design || {};
    if (!canShow(survey, design, mode)) return;
    var questions = survey.questions || [];
    if (questions.length === 0) return;

    var state = { idx: 0, answers: [], selected: [], text: '', done: false };
    var customerEmail = root.getAttribute('data-customer-email') || '';

    // ── container ──
    var card = el('div', 'ft-survey ft-survey--' + (design.layout === 'flat' ? 'flat' : 'card'));
    card.setAttribute('role', mode === 'popup' ? 'dialog' : 'region');
    card.setAttribute('aria-label', 'Feedback survey');
    applyDesign(card, design);

    var host = card;
    var wrap = null;
    if (mode === 'popup') {
      var position = ['bottom-right', 'bottom-left', 'center'].indexOf(design.position) !== -1 ? design.position : 'bottom-right';
      wrap = el('div', 'ft-popup-wrap ft-pos-' + position);
      wrap.appendChild(card);
      root.appendChild(wrap);
      host = card;
      if (position === 'center') wrap.addEventListener('click', function (e) { if (e.target === wrap) dismiss(); });
    } else {
      root.classList.add('ft-inline');
      root.appendChild(card);
    }

    function dismiss() {
      if (wrap) wrap.classList.remove('ft-open');
      if (!state.done) {
        if ((design.frequency || 'week') === 'session') ssSet('ft_survey_' + survey.id + '_dismissed', '1');
        else lsSet('ft_survey_' + survey.id + '_dismissed', String(Date.now()));
      }
    }

    function save() {
      var payload = {
        surveyId: survey.id,
        visitorId: visitorId(),
        email: customerEmail,
        pageUrl: window.location.pathname,
        answers: state.answers.filter(Boolean),
      };
      fetch(proxy + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(function () { /* ignore */ });
    }

    function record(answerText) {
      var q = questions[state.idx];
      state.answers[state.idx] = { questionTitle: q.text, questionNumber: state.idx + 1, answer: answerText };
      save();
    }

    function finish() {
      state.done = true;
      lsSet('ft_survey_' + survey.id + '_done', '1');
      render();
      if (mode === 'popup') setTimeout(function () { if (wrap) wrap.classList.remove('ft-open'); }, 3500);
    }

    function goTo(step) {
      if (step === 'end') { finish(); return; }
      var next = step === null || step === undefined ? state.idx + 1 : Number(step) - 1;
      if (!(next > state.idx) || next >= questions.length) { if (state.idx >= questions.length - 1) finish(); return; }
      state.idx = next; state.selected = []; state.text = '';
      render();
    }

    function isLast() { return state.idx === questions.length - 1; }

    function button(label, onClick, disabled) {
      var b = el('button', 'ft-btn', label);
      b.type = 'button';
      if (disabled) b.disabled = true;
      b.addEventListener('click', onClick);
      return b;
    }

    function optionButton(label, selected, onClick) {
      var b = el('button', 'ft-option' + (selected ? ' ft-selected' : ''), label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }

    function render() {
      host.textContent = '';

      if (state.done) {
        var thanks = el('div', 'ft-thanks');
        thanks.appendChild(el('strong', null, TEXT.thanksTitle));
        thanks.appendChild(el('span', null, TEXT.thanksText));
        host.appendChild(thanks);
        return;
      }

      var q = questions[state.idx];
      var kind = q.questionType || (q.isConditional ? 'conditional' : q.isTextBox ? 'text' : q.isMultiChoice ? 'multi' : 'single');

      var head = el('div', 'ft-head');
      head.appendChild(el('p', 'ft-step', TEXT.question.replace('{n}', state.idx + 1).replace('{total}', questions.length)));
      if (mode === 'popup') {
        var close = el('button', 'ft-close', TEXT.close);
        close.type = 'button';
        close.addEventListener('click', dismiss);
        head.appendChild(close);
      }
      host.appendChild(head);

      var progress = el('div', 'ft-progress');
      var bar = el('span');
      bar.style.width = Math.round(((state.idx + 1) / questions.length) * 100) + '%';
      progress.appendChild(bar);
      host.appendChild(progress);

      host.appendChild(el('p', 'ft-question', q.text));

      if (kind === 'rating' || kind === 'nps') {
        var values = kind === 'rating' ? ['1', '2', '3', '4', '5'] : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
        var scale = el('div', 'ft-scale');
        values.forEach(function (v) {
          scale.appendChild(optionButton(v, state.selected[0] === v, function () {
            state.selected = [v];
            record(v);
            var step = nextStep(q, v);
            if (step === 'end') { finish(); return; }
            if (!isLast()) setTimeout(function () { goTo(step); }, 150); else render();
          }));
        });
        host.appendChild(scale);
        var labels = el('div', 'ft-scale-labels');
        labels.appendChild(el('span', null, kind === 'rating' ? TEXT.ratingLow : TEXT.npsLow));
        labels.appendChild(el('span', null, kind === 'rating' ? TEXT.ratingHigh : TEXT.npsHigh));
        host.appendChild(labels);
        if (isLast() && state.selected.length) host.appendChild(button(TEXT.submit, finish));
        return;
      }

      if (kind === 'text') {
        var ta = el('textarea', 'ft-textarea');
        ta.placeholder = TEXT.enter;
        ta.value = state.text;
        ta.addEventListener('input', function () { state.text = ta.value; });
        host.appendChild(ta);
        host.appendChild(button(isLast() ? TEXT.submit : TEXT.save, function () {
          if (!state.text.trim()) return;
          record('other(' + state.text.trim() + ')');
          if (isLast()) finish(); else goTo(null);
        }));
        return;
      }

      // single, multi, conditional
      var list = el('div', 'ft-options');
      var otherSelected = false;
      (q.answers || []).forEach(function (a) {
        var id = String(a.id);
        var isSel = state.selected.indexOf(id) !== -1;
        if (isSel && a.haveTextBox) otherSelected = true;
        list.appendChild(optionButton(a.text, isSel, function () {
          if (kind === 'multi') {
            var at = state.selected.indexOf(id);
            if (at === -1) state.selected.push(id); else state.selected.splice(at, 1);
            render();
            return;
          }
          state.selected = [id];
          if (a.haveTextBox) { render(); return; }
          record(a.text);
          var step = nextStep(q, a.text);
          if (step === 'end') { finish(); return; }
          if (!isLast()) setTimeout(function () { goTo(step); }, 150); else render();
        }));
      });
      host.appendChild(list);

      var needsText = false;
      (q.answers || []).forEach(function (a) { if (a.haveTextBox && state.selected.indexOf(String(a.id)) !== -1) needsText = true; });
      if (needsText) {
        var input = el('input', 'ft-input');
        input.type = 'text';
        input.placeholder = TEXT.other;
        input.value = state.text;
        input.addEventListener('input', function () { state.text = input.value; });
        host.appendChild(input);
      }

      if (kind === 'multi' || needsText) {
        host.appendChild(button(isLast() ? TEXT.submit : TEXT.save, function () {
          var chosen = (q.answers || []).filter(function (a) { return state.selected.indexOf(String(a.id)) !== -1; });
          if (chosen.length === 0) return;
          var parts = chosen.filter(function (a) { return !a.haveTextBox; }).map(function (a) { return a.text; });
          chosen.forEach(function (a) { if (a.haveTextBox && state.text.trim()) parts.push('other(' + state.text.trim() + ')'); });
          var answerText = parts.join(',');
          record(answerText);
          var step = kind === 'multi' ? null : nextStep(q, chosen[0].text);
          if (step === 'end' || isLast()) finish(); else goTo(step);
        }));
      } else if (isLast() && state.selected.length) {
        host.appendChild(button(TEXT.submit, finish));
      }
    }

    render();

    // ── when to show (pop-up only) ──
    if (mode !== 'popup') return;
    var shown = false;
    function open() {
      if (shown || state.done) return;
      shown = true;
      wrap.classList.add('ft-open');
    }

    var trigger = design.trigger || 'delay';
    var value = Number(design.triggerValue);
    if (trigger === 'immediate') {
      open();
    } else if (trigger === 'scroll') {
      var pct = value > 0 ? value : 50;
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0 && (window.scrollY / max) * 100 >= pct) { window.removeEventListener('scroll', onScroll); open(); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    } else if (trigger === 'exit') {
      var touch = 'ontouchstart' in window;
      if (touch) setTimeout(open, 25000); // no mouse on phones: fall back to a delay
      else document.addEventListener('mouseout', function onOut(e) {
        if (!e.relatedTarget && e.clientY <= 0) { document.removeEventListener('mouseout', onOut); open(); }
      });
    } else {
      setTimeout(open, (value > 0 ? value : 5) * 1000);
    }
    if (designMode) open(); // always visible while editing the theme
  }

  function boot() {
    var roots = document.querySelectorAll('.ft-survey-root');
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
})();
