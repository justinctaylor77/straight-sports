// offline matcher tests for public/fuzzy.js + public/aliases.js (v1.5.0 search)
import assert from 'node:assert';
import { fold, scoreName, search, dist } from '../public/fuzzy.js';
import { aliasesOf } from '../public/aliases.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(fold('Ludvig Åberg') === 'ludvig aberg', 'fold strips accents'); ok(fold('Nikola Jokić') === 'nikola jokic', 'fold ć');
ok(fold('Højgaard') === 'hojgaard', 'fold ø'); ok(fold("Ja'Marr Chase") === 'jamarr chase', 'fold apostrophe'); ok(fold('Texas A&M') === 'texas aandm' || fold('Texas A&M').includes('and'), 'fold &');
ok(dist('mcelroy', 'mcilroy', 2) === 1, 'one edit'); ok(dist('djokovich', 'djokovic', 2) === 1, 'one edit tail');
const yes = [['McElroy', 'Rory McIlroy'], ['Aberg', 'Ludvig Åberg'], ['Djokovich', 'Novak Djokovic'], ['otani', 'Shohei Ohtani'], ['jamarr chase', "Ja'Marr Chase"], ['scheffler', 'Scottie Scheffler'], ['swiatek', 'Iga Świątek'], ['mbappe', 'Kylian Mbappé'], ['doncic', 'Luka Dončić'], ['st johns', "St. John's Red Storm"]];
for (const [q, name] of yes) ok(scoreName(q, name) >= 0.6, `${q} → ${name} (${scoreName(q, name)})`);
const no = [['boston', 'Houston Rockets'], ['mahomes', 'Marvin Mims'], ['korda', 'Rickie Fowler'], ['utah', 'Chicago Bandits'], ['rory', 'Gary Woodland']];
for (const [q, name] of no) ok(scoreName(q, name) < 0.6, `${q} ≠ ${name} (${scoreName(q, name)})`);
ok(scoreName('rory mcilroy', 'Rory McIlroy') > scoreName('mcilroy', 'Rory McIlroy') - 0.2, 'full name scores high');
const L = [{ name: 'Dermot Mcelroy' }, { name: 'Rory McIlroy' }, { name: 'Jamie McLeary' }];
ok(search(L, 'mcilroy', { key: (p) => p.name })[0].name === 'Rory McIlroy', 'exact beats fuzzy');
ok(aliasesOf('San Francisco 49ers').some((a) => /niners/i.test(a)), 'niners alias'); ok(aliasesOf('Utah Talons').some((a) => /talons/i.test(a)), 'talons alias');
ok(scoreName('niners', 'San Francisco 49ers', aliasesOf('San Francisco 49ers')) >= 1, 'alias exact');
console.log(`fuzzy.test.mjs: ${n} assertions passed`);
