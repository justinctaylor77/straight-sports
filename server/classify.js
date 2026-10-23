// Heuristic "is this straight news?" classifier. Returns {type, reasons[]}.
// type: 'news' | 'opinion' | 'analysis' | 'betting' | 'media'
const RULES = [
  // [type, regex tested against title, regex tested against URL]
  ['opinion', /\b(opinion|column|columnist|commentary|editorial|hot takes?|my take|takes?:|\brant\b|mailbag|overreact\w*|sound off|i think|we think|my (picks|thoughts|ballot)|unpopular|bold (prediction|take)s?|letters?:)/i,
              /\/(opinion|opinions|column|columns|commentary|editorial|blogs?|mailbag|takes?)\//i],
  ['opinion', /\b(should|must|needs? to|has to|deserves?|why .{3,60} (is|are|will|won't|can't)|it's time|stop |enough with|overrated|underrated|embarrass\w*|disgrace\w*|pathetic|clown\w*|frauds?|winners and losers|grades?\b|report card)/i, null],
  ['analysis', /\b(predictions?|picks?\b|projections?|power rankings|bowl projections|playoff projections|takeaways|what we learned|things to know|storylines|observations|film (room|study|review)|best and worst|ranking (every|all)|tiers?\b|bracketology|stock (up|down)|predicts?|burning questions|biggest questions|landing spots|rumou?rs?|speculat\w*|could be in for|\d+ things|three things|keys to (the game|victory)|scouting report|what to watch)/i,
              /\/(analysis|predictions?|picks)\//i],
  ['betting', /\b(odds|betting|bets?\b|point spread|against the spread|ATS|over\/under|parlay|best bets|lines?\b.*\bpicks|sportsbook|promo code|bonus code|DFS)\b/i,
              /\/(betting|odds|sportsbook|gambling)\//i],
  ['media', /\b(podcast|video|watch:|how to (watch|attend|stream|listen)|listen|live stream|how to watch|tv channel|streaming|radio show|livestream|highlights)\b/i,
              /\/(video|videos|podcasts?|watch)\//i],
];

function classify(title = '', url = '', extra = '') {
  const reasons = [];
  let type = 'news';
  const reported = /\b(says|said|believes|told|tells|admits|explains|according to)\b|[“”"]/i.test(title);
  RULES.forEach(([t, titleRe, urlRe], i) => {
    // Rule 1 (should/must/etc.) is skipped for attributed quotes: "Coach says team must..." is reporting.
    let mt = titleRe && (title.match(titleRe));
    if (i === 1 && reported) mt = null;
    const mu = urlRe && url && url.match(urlRe);
    if (mt || mu) {
      if (type === 'news') type = t;
      reasons.push(`${t}: ${mt ? `"${mt[0].trim()}" in title` : `"${mu[0]}" in URL`}`);
    }
  });
  // categories from feeds, e.g. <category>Opinion</category>
  if (/\b(opinion|column|commentary|editorial)\b/i.test(extra)) {
    if (type === 'news') type = 'opinion';
    reasons.push('opinion: feed category');
  }
  // Question headlines are usually speculation/analysis, not reporting
  if (type === 'news' && /\?/.test(title.replace(/[“"][^”"]*[”"]/g, ''))) { type = 'analysis'; reasons.push('analysis: question headline'); }
  return { type, reasons };
}
module.exports = { classify };
