const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { runtime } = require('./helpers/i18nRuntime.cjs');

const read = path => fs.readFileSync(path, 'utf8');
const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
  if (entity.startsWith('#')) return String.fromCodePoint(entity[1].toLowerCase() === 'x'
    ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
});
const sectionBlocks = section => [
  ...(section.title ? [{ tag: 'h2', text: section.title }] : []),
  ...(section.blocks ?? []).map(block => ({ tag: { heading: 'h3', paragraph: 'p', bullet: 'li' }[block.kind], text: block.text })),
  ...(section.paragraphs ?? []).map(text => ({ tag: 'p', text })),
  ...(section.bullets ?? []).map(text => ({ tag: 'li', text })),
];
const cases = [
  { lang: 'ko', file: 'privacy.html', route: '/privacy', other: '/ja/privacy', date: '시행일: 2026년 10월 14일' },
  { lang: 'ja', file: 'privacy-ja.html', route: '/ja/privacy', other: '/privacy', date: '施行日：2026年10月14日' },
];

for (const entry of cases) {
  test(`public ${entry.lang} privacy: every section and text block matches the app, including the release date`, () => {
    const { policies, japanesePolicies } = runtime().load('src/content/policies.ts');
    const policy = (entry.lang === 'ko' ? policies : japanesePolicies).privacy;
    const html = read('public-legal/' + entry.file);
    const article = html.match(/<article>([\s\S]*?)<\/article>/)[1];
    const sections = [...article.matchAll(/<section>([\s\S]*?)<\/section>/g)].map(match =>
      [...match[1].matchAll(/<(h2|h3|p|li)>([\s\S]*?)<\/\1>/g)].map(block => ({ tag: block[1], text: decode(block[2]) })));
    assert.deepEqual(sections, policy.sections.map(sectionBlocks));
    assert.equal(policy.effectiveDate, entry.date);
    assert.equal(decode(html.match(/<p class="date">([^<]+)<\/p>/)[1]), entry.date);
    assert.ok(sections.at(-1).at(-1).text.includes(entry.lang === 'ko' ? '2026년 10월 14일부터 시행' : '2026年10月14日から施行'));
    assert.doesNotMatch(decode(article), /\[[^\]]+\]|YYYY|TODO|TBD|추후 확정|未定|今後確定|2026년 10월 13일|2026年10月13日/);
  });

  test(`public ${entry.lang} privacy: explicit HTML nesting, language, responsive metadata and existing links are valid`, () => {
    const html = read('public-legal/' + entry.file);
    assert.match(html, /^<!DOCTYPE html>/i);
    assert.ok(html.includes(`<html lang="${entry.lang}">`));
    assert.match(html, /<meta charset="UTF-8"\s*\/>/);
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
    assert.match(html, /@media \(min-width: 640px\)/);
    assert.match(html, /safe-area-inset/);
    const stack = [];
    for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
      const token = match[0], tag = match[1].toLowerCase();
      if (token.startsWith('</')) assert.equal(stack.pop(), tag, `mismatched closing ${tag}`);
      else if (!['meta', 'link'].includes(tag)) {
        if (tag === 'li') assert.equal(stack.at(-1), 'ul');
        if (tag === 'section') assert.equal(stack.at(-1), 'article');
        stack.push(tag);
      }
    }
    assert.deepEqual(stack, []);
    assert.equal((html.match(/<main>/g) ?? []).length, 1);
    assert.equal((html.match(/<article>/g) ?? []).length, 1);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)[1], 'https://popchive.com' + entry.route);
    assert.deepEqual([...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]), [
      'https://popchive.com' + entry.other, 'https://popchive.com/support', 'mailto:popchive.support@gmail.com',
    ]);
    assert.doesNotMatch(html, /<script\b|javascript:/i);
  });
}

test('public privacy pages retain the shared stylesheet and existing deployment routes', () => {
  const styles = cases.map(entry => read('public-legal/' + entry.file).match(/<style>([\s\S]*?)<\/style>/)[1]);
  assert.equal(styles[0], styles[1]);
  const deploy = read('deploy/public-legal/deploy.ps1');
  const nginx = read('deploy/public-legal/popchive-public.nginx.conf.example');
  assert.ok(deploy.includes("$names = @('privacy.html', 'privacy-ja.html', 'support.html')"));
  assert.ok(deploy.includes("$routes = @('/privacy', '/ja/privacy', '/support')"));
  assert.ok(deploy.includes("Join-Path $PSScriptRoot '../../public-legal'"));
  for (const entry of cases) {
    assert.ok(nginx.includes('location = ' + entry.route + ' {'));
    assert.ok(nginx.includes('alias /var/www/popchive-public/' + entry.file + ';'));
  }
});
