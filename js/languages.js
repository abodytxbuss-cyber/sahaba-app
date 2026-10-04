import {t} from './i18n.js';

// أسماء اللغات تختلف بين إضافات Stremio وقوائم HLS.
export function isArabic(value='') {
  if(typeof value==='object'&&value)return [value.lang,value.language,value.name,value.label].some(isArabic);
  return /^(ar|ara|arb)([-_].*)?$/i.test(String(value).trim())||/\barabic\b|العربية|عربي|عربى/i.test(String(value));
}
export function arabicAudio(stream) {
  const languages=stream.audioLanguages||stream.behaviorHints?.audioLanguages||[];
  return (Array.isArray(languages)?languages:[languages]).some(isArabic)||/مدبلج|دبلجة|(?:arabic|\bara\b)[ ._-]*(?:dub|audio)|(?:dub|audio)[ ._-]*arabic/i.test([stream.name,stream.title,stream.description].join(' '));
}
export function languageName(track) {
  if(isArabic(track))return t('lang.arabic');
  const code=String(track.lang||track.language||'').toLowerCase();
  return ({en:t('lang.english'),eng:t('lang.english'),fr:t('lang.french'),fra:t('lang.french'),fre:t('lang.french'),es:t('lang.spanish'),spa:t('lang.spanish'),de:t('lang.german'),deu:t('lang.german'),tr:t('lang.turkish'),tur:t('lang.turkish'),ja:t('lang.japanese'),jpn:t('lang.japanese'),hi:t('lang.hindi'),hin:t('lang.hindi')})[code]||track.name||track.label||code||t('lang.unspecified');
}
export function rankSubtitles(list,stream={}) {
  const release=String(stream.behaviorHints?.filename||stream.title||'').toLowerCase();
  const score=s=>{
    const words=String(s.movieReleaseName||s.subtitleFileName||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2);
    return (isArabic(s)?10000:0)+words.filter(w=>release.includes(w)).length;
  };
  return [...list].sort((a,b)=>score(b)-score(a));
}
export function decodeSubtitle(bytes) {
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
  const utf8=new TextDecoder().decode(bytes);
  return utf8.includes('\uFFFD')?new TextDecoder('windows-1256').decode(bytes):utf8;
}
export function toVtt(input) {
  const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!/(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}/.test(text))throw Error('الملف لا يحتوي ترجمة موقّتة صالحة بصيغة SRT أو VTT.');
  const clean=text.replace(/\{\\[^}]*\}/g,'').replace(/(\d{2}:\d{2}),(\d{3})/g,'$1.$2');
  return /^WEBVTT(?:\s|$)/.test(clean)?clean:'WEBVTT\n\n'+clean;
}
