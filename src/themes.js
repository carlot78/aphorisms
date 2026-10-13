// Themes: subject-matter filters across every author in the catalog, as an
// alternative to choosing authors. A quote belongs to a theme when it matches
// the theme's keyword pattern; a quote can belong to several themes.
// Used by scripts/themes.mjs (builds data/themes/<id>.json weekly) and by the
// app (own lines and "My collection" are matched in the browser).

export const THEMES = [
  { id: 'resilience', icon: '🌊', name: 'Resilience', blurb: 'Adversity, hardship, enduring and getting up again',
    re: /\b(advers\w*|hardships?|obstacles?|endur\w*|misfortunes?|suffer\w*|struggl\w*|persever\w*|setbacks?|failures?|fail(ed|s|ing)?|calamit\w*|trials?|storms?|resilien\w*|wounds?)\b/i },
  { id: 'happiness', icon: '☀️', name: 'Happiness', blurb: 'Joy, contentment and what a good life feels like',
    re: /\b(happ(y|ier|iest|iness)|joy\w*|content(ed|ment)?|cheerful\w*|delight\w*|gladness|bliss\w*|well-being|flourish\w*|gratitude|grateful)\b/i },
  { id: 'love', icon: '❤️', name: 'Love & kindness', blurb: 'Love, friendship, compassion and kindness',
    re: /\b(lov(e|es|ed|ing)|friends?(hip)?|kind(ness)?|compassion\w*|tender\w*|affection\w*|forgiv\w*|mercy|merciful|generos\w*|charity)\b/i },
  { id: 'mortality', icon: '⏳', name: 'Death & time', blurb: 'Mortality, the shortness of life and using time well',
    re: /\b(death|dead|die|dies|dying|mortal\w*|graves?|brevity|shortness of life|life is short|short life|(waste|use|value|loss|lose|lost|spend|spent) (of )?(your |our |his )?time|time (is|flies|passes)|present moment|old age|aging|ageing|transien\w*|impermanen\w*)\b/i },
  { id: 'courage', icon: '🦁', name: 'Courage & action', blurb: 'Fear, daring and the deed that follows the thought',
    re: /\b(courage\w*|brave\w*|bravery|fears?|fearless\w*|feared|afraid|dar(e|es|ed|ing)|bold(ly|ness)?|valou?r|cowar\w*|heroi\w*|hero|risks?)\b/i },
  { id: 'mind', icon: '🧘', name: 'Calm mind', blurb: 'Emotions, anger, anxiety and inner peace',
    re: /\b(anger|angry|wrath|emotions?|passions?|calm\w*|peace of mind|inner peace|tranquil\w*|serenit\w*|anxi\w*|worr\w*|stillness|equanimity|desires?|state of mind|mind)\b/i },
  { id: 'wisdom', icon: '📚', name: 'Wisdom & learning', blurb: 'Knowledge, truth, ignorance and learning',
    re: /\b(wisdom|wise\w*|knowledge|know(ing)? thyself|learn\w*|ignoran\w*|truths?|understand\w*|stud(y|ies|ying)|teach\w*|philosoph\w*|reason)\b/i },
  { id: 'discipline', icon: '🎯', name: 'Habits & discipline', blurb: 'Practice, effort, patience and self-mastery',
    re: /\b(habits?|discipline\w*|practi[cs]e[sd]?|practi[cs]ing|efforts?|patien(ce|t)|persist\w*|self-control|self-discipline|master(y| of himself| of yourself| of oneself)|diligen\w*|routines?|hard work|daily|every day|perseverance)\b/i },
  { id: 'self', icon: '🪞', name: 'Being yourself', blurb: 'Character, authenticity, conscience and the soul',
    re: /\b(yourself|himself|thyself|character|soul|authentic\w*|conscience|integrity|virtue\w*|self-reliance|individual\w*|nature of man|own nature)\b/i },
  { id: 'simplicity', icon: '🍃', name: 'Simplicity & nature', blurb: 'Wanting less, wealth and poverty, the natural world',
    re: /\b(simpl(e|icity|y)|nature|natural|wealth\w*|rich(es)?|poor|poverty|possessions?|luxur\w*|frugal\w*|enough|needs?|money|woods?|trees?)\b/i },
  { id: 'purpose', icon: '🧭', name: 'Purpose & meaning', blurb: 'Meaning, goals, success and a life worth living',
    re: /\b(purpose\w*|meaning\w*|goals?|success\w*|achiev\w*|ambition\w*|calling|destin(y|ies)|vocation|mission|aims?|worth living)\b/i },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const themeById = (id) => THEMES.find((t) => t.id === id);

/**
 * How strongly a text belongs to a theme: the number of distinct theme words
 * it contains. 0 means not in the theme.
 */
export function themeScore(theme, text) {
  const words = String(text).toLowerCase().match(new RegExp(theme.re.source, 'gi')) || [];
  return new Set(words).size;
}

/** Theme ids a text belongs to. */
export function themesOf(text) {
  return THEMES.filter((t) => t.re.test(text)).map((t) => t.id);
}
