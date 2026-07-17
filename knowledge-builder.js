(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KnowledgeBuilder = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cleanText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitLong(text, maxChars) {
    var sentences = String(text || '').split(/(?<=[。！？.!?；;])\s*/u).filter(Boolean);
    if (sentences.length < 2) {
      var parts = [];
      for (var i = 0; i < text.length; i += maxChars) parts.push(text.slice(i, i + maxChars));
      return parts;
    }
    var out = [], current = '';
    sentences.forEach(function (sentence) {
      if (current && current.length + sentence.length > maxChars) { out.push(current.trim()); current = ''; }
      current += sentence;
    });
    if (current.trim()) out.push(current.trim());
    return out;
  }

  function chunkText(input, options) {
    options = options || {};
    var maxChars = Math.max(300, Math.min(Number(options.maxChars) || 850, 1400));
    var minChars = Math.max(80, Math.min(Number(options.minChars) || 180, maxChars));
    var text = cleanText(input);
    if (!text) return [];
    var paragraphs = text.split(/\n{2,}/).flatMap(function (part) {
      part = part.trim();
      return part.length > maxChars ? splitLong(part, maxChars) : [part];
    }).filter(Boolean);
    var chunks = [], current = '';
    paragraphs.forEach(function (part) {
      var candidate = current ? current + '\n\n' + part : part;
      if (candidate.length > maxChars && current.length >= minChars) { chunks.push(current.trim()); current = part; }
      else current = candidate;
    });
    if (current.trim()) {
      if (chunks.length && current.length < minChars && chunks[chunks.length - 1].length + current.length < maxChars * 1.2) chunks[chunks.length - 1] += '\n\n' + current;
      else chunks.push(current.trim());
    }
    return chunks.slice(0, 300);
  }

  function makeQuestion(chunk, index, title) {
    var firstLine = chunk.split('\n')[0].replace(/^#{1,6}\s*/, '').trim();
    if (firstLine.length >= 4 && firstLine.length <= 72 && !/[。！？.!?]$/.test(firstLine)) return firstLine;
    var firstSentence = (chunk.match(/^.{4,88}?[。！？.!?](?:\s|$)/u) || [])[0];
    if (firstSentence) return firstSentence.trim();
    return (title ? title + '：' : '文件內容：') + '第 ' + (index + 1) + ' 段';
  }

  function makeKeywords(text, title) {
    var seen = Object.create(null), out = [];
    var source = cleanText((title || '') + ' ' + text.slice(0, 500)).toLowerCase();
    var latin = source.match(/[a-z0-9][a-z0-9_-]{1,30}/g) || [];
    var cjk = source.match(/[\u3400-\u9fff]{2,8}/g) || [];
    latin.concat(cjk).forEach(function (token) {
      if (!seen[token] && out.length < 24) { seen[token] = true; out.push(token); }
    });
    return out.join(' ').slice(0, 600);
  }

  function safeSource(input) {
    input = input || {};
    var type = /^(pdf|url|text|json)$/.test(input.type) ? input.type : 'text';
    var source = { type:type, title:String(input.title || '未命名來源').trim().slice(0, 160) };
    if (input.url) source.url = String(input.url).slice(0, 1200);
    return source;
  }

  function buildEntries(options) {
    options = options || {};
    var source = safeSource(options.source);
    return chunkText(options.text, options).map(function (chunk, index) {
      return {
        q: makeQuestion(chunk, index, source.title),
        kw: makeKeywords(chunk, source.title),
        a: chunk.slice(0, 4000),
        source: source
      };
    });
  }

  function mergeEntries(existing, imported) {
    var out = [], seen = Object.create(null);
    (existing || []).concat(imported || []).forEach(function (item) {
      if (!item || typeof item.q !== 'string' || typeof item.a !== 'string') return;
      var key = (item.q.trim() + '\n' + item.a.trim()).toLowerCase();
      if (!seen[key]) { seen[key] = true; out.push(item); }
    });
    return out.slice(0, 1000);
  }

  return { cleanText:cleanText, chunkText:chunkText, buildEntries:buildEntries, mergeEntries:mergeEntries };
});
