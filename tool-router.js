(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvatarToolRouter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function text(value, max) { return String(value || '').trim().slice(0, max || 240); }
  function normal(value) { return text(value, 1200).toLowerCase().replace(/[\s，。、！？,.!?：:；;()（）]+/g, ''); }
  function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function bigrams(value) {
    var input = normal(value), out = [];
    if (input.length === 1) return [input];
    for (var i = 0; i < input.length - 1; i++) out.push(input.slice(i, i + 2));
    return out;
  }

  function similarity(a, b) {
    var aa = bigrams(a), bb = new Set(bigrams(b));
    if (!aa.length || !bb.size) return 0;
    var hits = 0;
    aa.forEach(function (item) { if (bb.has(item)) hits++; });
    return hits / Math.sqrt(aa.length * bb.size);
  }

  function normaliseSchema(schema) {
    if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return { type:'object', properties:{}, required:[] };
    var properties = {};
    Object.keys(schema.properties).slice(0, 20).forEach(function (name) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name)) return;
      var raw = schema.properties[name] || {};
      var type = /^(string|number|integer|boolean)$/.test(raw.type) ? raw.type : 'string';
      var property = {
        type:type, title:text(raw.title || name, 80), description:text(raw.description, 160),
        contextKey:text(raw.contextKey, 60), format:/^(email|url|phone|contact)$/.test(raw.format) ? raw.format : '',
        prefixes:Array.isArray(raw.prefixes) ? raw.prefixes.slice(0, 8).map(function (item) { return text(item, 30); }).filter(Boolean) : []
      };
      if (Array.isArray(raw.enum)) property.enum = raw.enum.slice(0, 20).map(function (item) { return text(item, 80); }).filter(Boolean);
      if (Number.isFinite(Number(raw.minimum))) property.minimum = Number(raw.minimum);
      if (Number.isFinite(Number(raw.maximum))) property.maximum = Number(raw.maximum);
      property.maxLength = Math.max(1, Math.min(Number(raw.maxLength) || 300, 1000));
      properties[name] = property;
    });
    var required = Array.isArray(schema.required) ? schema.required.filter(function (name) { return properties[name]; }).slice(0, 20) : [];
    return { type:'object', properties:properties, required:required };
  }

  function normaliseTool(tool) {
    tool = tool || {};
    return {
      name:text(tool.name, 64).replace(/[^a-zA-Z0-9_.-]/g, ''),
      label:text(tool.label || tool.name, 80), description:text(tool.description, 240),
      keywords:Array.isArray(tool.keywords) ? tool.keywords.slice(0, 30).map(function (item) { return text(item, 60).toLowerCase(); }).filter(Boolean) : [],
      examples:Array.isArray(tool.examples) ? tool.examples.slice(0, 20).map(function (item) { return text(item, 160); }).filter(Boolean) : [],
      excludeKeywords:Array.isArray(tool.excludeKeywords) ? tool.excludeKeywords.slice(0, 20).map(function (item) { return text(item, 60).toLowerCase(); }).filter(Boolean) : [],
      priority:Math.max(-10, Math.min(Number(tool.priority) || 0, 10)),
      routeThreshold:Math.max(0.15, Math.min(Number(tool.routeThreshold) || 0.34, 0.95)),
      requiresConfirmation:tool.requiresConfirmation !== false,
      inputSchema:normaliseSchema(tool.inputSchema)
    };
  }

  function scoreTool(tool, query) {
    var q = normal(query);
    if (!q || tool.excludeKeywords.some(function (item) { return item && q.includes(normal(item)); })) return { score:0, reason:'excluded' };
    var score = 0, reason = '';
    tool.keywords.forEach(function (keyword) {
      var key = normal(keyword); if (!key) return;
      var current = q.includes(key) ? Math.min(0.92, 0.62 + key.length * 0.035) : similarity(q, key) * 0.62;
      if (current > score) { score = current; reason = q.includes(key) ? 'keyword:' + keyword : 'keyword-similarity'; }
    });
    tool.examples.forEach(function (example) {
      var sim = similarity(q, example), current = 0.18 + sim * 0.72;
      if (sim >= 0.28 && current > score) { score = current; reason = 'example'; }
    });
    var labelSimilarity = similarity(q, tool.label);
    if (labelSimilarity >= 0.3 && 0.16 + labelSimilarity * 0.65 > score) { score = 0.16 + labelSimilarity * 0.65; reason = 'label'; }
    var descriptionSimilarity = similarity(q, tool.description);
    if (descriptionSimilarity >= 0.34 && 0.1 + descriptionSimilarity * 0.52 > score) { score = 0.1 + descriptionSimilarity * 0.52; reason = 'description'; }
    score = Math.max(0, Math.min(1, score + tool.priority * 0.012));
    return { score:score, reason:reason || 'none' };
  }

  function route(tools, query) {
    var candidates = (Array.isArray(tools) ? tools : []).map(normaliseTool).filter(function (tool) { return tool.name; }).map(function (tool) {
      var scored = scoreTool(tool, query); return { tool:tool, score:scored.score, reason:scored.reason };
    }).filter(function (item) { return item.score >= item.tool.routeThreshold; }).sort(function (a, b) { return b.score - a.score || b.tool.priority - a.tool.priority; });
    var top = candidates[0] || null, second = candidates[1] || null;
    var ambiguous = !!(top && second && top.score - second.score < 0.09);
    return { match:ambiguous ? null : top, ambiguous:ambiguous ? candidates.slice(0, 3) : [], candidates:candidates };
  }

  function findPrefixed(query, prefixes) {
    for (var i = 0; i < prefixes.length; i++) {
      var re = new RegExp(escapeRegExp(prefixes[i]) + '\\s*(?:是|為|=|:|：)?\\s*([^，。！？,!?]{1,120})', 'i');
      var match = re.exec(query); if (match) return match[1].trim();
    }
    return '';
  }

  function valueForProperty(name, property, query, context, allowWhole) {
    if (property.contextKey && context && context[property.contextKey] != null) return context[property.contextKey];
    if (context && context[name] != null) return context[name];
    var value = findPrefixed(query, property.prefixes.concat([property.title]).filter(Boolean));
    if (property.enum) {
      var selected = property.enum.find(function (item) { return normal(query).includes(normal(item)); });
      if (selected) return selected;
    }
    if (property.format === 'email') { var email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(query); if (email) return email[0]; }
    if (property.format === 'url') { var url = /https?:\/\/[^\s，。]+/i.exec(query); if (url) return url[0]; }
    if (property.format === 'phone') { var phone = /(?:\+?\d[\s().-]*){8,18}/.exec(query); if (phone) return phone[0].trim(); }
    if (property.format === 'contact') {
      var contactEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(query); if (contactEmail) return contactEmail[0];
      var contactPhone = /(?:\+?\d[\s().-]*){8,18}/.exec(query); if (contactPhone) return contactPhone[0].trim();
    }
    if (property.type === 'boolean') {
      if (/(不同意|不要|不用|否|不需要|false|no)/i.test(query)) return false;
      if (/(同意|要|需要|可以|是|true|yes)/i.test(query)) return true;
    }
    if (property.type === 'number' || property.type === 'integer') {
      var number = /-?\d+(?:\.\d+)?/.exec(value || query);
      if (number) return property.type === 'integer' ? Math.round(Number(number[0])) : Number(number[0]);
    }
    if (value) return value.slice(0, property.maxLength);
    if (allowWhole && property.type === 'string') return text(query, property.maxLength);
    return undefined;
  }

  function extract(tool, query, context, existing, onlyNames, allowWhole) {
    tool = normaliseTool(tool); existing = existing && typeof existing === 'object' ? existing : {};
    var args = {}, properties = tool.inputSchema.properties;
    Object.keys(properties).forEach(function (name) { if (existing[name] != null) args[name] = existing[name]; });
    var names = Array.isArray(onlyNames) && onlyNames.length ? onlyNames : Object.keys(properties);
    names.forEach(function (name) {
      if (!properties[name] || args[name] != null) return;
      var value = valueForProperty(name, properties[name], String(query || ''), context || {}, !!allowWhole && names.length === 1);
      if (value !== undefined && value !== '') args[name] = value;
    });
    var validation = validate(tool.inputSchema, args);
    var invalid = validation.errors.map(function (error) { return String(error).split(' ')[0]; });
    invalid.forEach(function (name) { delete validation.args[name]; });
    return { args:validation.args, missing:tool.inputSchema.required.filter(function (name) { return validation.args[name] == null || validation.args[name] === ''; }), errors:validation.errors };
  }

  function validate(schema, input) {
    schema = normaliseSchema(schema); input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var args = {}, errors = [];
    Object.keys(schema.properties).forEach(function (name) {
      if (input[name] == null || input[name] === '') return;
      var property = schema.properties[name], value = input[name];
      if (property.type === 'integer' && (!Number.isInteger(Number(value)))) { errors.push(name + ' 必須是整數'); return; }
      if (property.type === 'number' && !Number.isFinite(Number(value))) { errors.push(name + ' 必須是數字'); return; }
      if (property.type === 'boolean' && typeof value !== 'boolean') { errors.push(name + ' 必須是布林值'); return; }
      if (property.type === 'integer' || property.type === 'number') {
        value = Number(value);
        if (property.minimum != null && value < property.minimum) errors.push(name + ' 不得小於 ' + property.minimum);
        if (property.maximum != null && value > property.maximum) errors.push(name + ' 不得大於 ' + property.maximum);
      } else if (property.type === 'string') {
        value = text(value, property.maxLength);
        if (property.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(name + ' 電子郵件格式無效');
        if (property.format === 'url' && !/^https?:\/\//i.test(value)) errors.push(name + ' 網址格式無效');
        if (property.format === 'phone' && !/(?:\d[^\d]*){8,18}/.test(value)) errors.push(name + ' 電話格式無效');
        if (property.format === 'contact' && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^(?:\+?\d[\s().-]*){8,18}$/.test(value))) errors.push(name + ' 必須是電子郵件或電話');
      }
      if (property.enum && property.enum.indexOf(String(value)) < 0) errors.push(name + ' 不在允許選項內');
      args[name] = value;
    });
    schema.required.forEach(function (name) { if (args[name] == null || args[name] === '') errors.push(name + ' 為必填'); });
    return { ok:errors.length === 0, args:args, errors:errors };
  }

  function argumentSummary(tool, args) {
    tool = normaliseTool(tool); args = args || {};
    return Object.keys(args).map(function (name) {
      var property = tool.inputSchema.properties[name] || {};
      return (property.title || name) + '：' + String(args[name]);
    }).join('、');
  }

  return { normaliseSchema:normaliseSchema, normaliseTool:normaliseTool, similarity:similarity, scoreTool:scoreTool, route:route, extract:extract, validate:validate, argumentSummary:argumentSummary };
});
