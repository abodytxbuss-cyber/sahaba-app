import test from 'node:test';
import assert from 'node:assert/strict';
import {isArabic,arabicAudio,rankSubtitles,toVtt,decodeSubtitle} from '../js/languages.js';
import {initializeArabicSubtitles,ARABIC_SUBTITLE_ADDON} from '../js/subtitle-addon.js';
import {getAddons,saveAddons} from '../js/store.js';

test('يميّز العربية الإقليمية والدبلجة عن الترجمة العربية فقط',()=>{
  for(const value of ['ar','ara','ar-SA','arb','Arabic','العربية',{language:'ar-EG'},{name:'Arabic Stereo'}])assert.equal(isArabic(value),true);
  assert.equal(isArabic('French'),false);
  assert.equal(arabicAudio({title:'1080p Arabic subtitles'}),false);
  assert.equal(arabicAudio({title:'1080p Arabic Dubbed'}),true);
  assert.equal(arabicAudio({title:'نسخة مدبلجة'}),true);
  assert.equal(arabicAudio({audioLanguages:['en','ara']}),true);
});
test('يرتب العربية أولاً ويطابق نسخة الإصدار عند توفر الاسم',()=>{
  const list=[{lang:'eng',subtitleFileName:'Film.WEBRip.XYZ'},{lang:'ara',subtitleFileName:'Film.BluRay.ABC'},{lang:'ar',subtitleFileName:'Film.WEBRip.XYZ'}];
  const sorted=rankSubtitles(list,{behaviorHints:{filename:'Film.WEBRip.XYZ.mp4'}});
  assert.equal(sorted[0],list[2]);assert.equal(sorted[1],list[1]);assert.equal(list[0].lang,'eng');
});
test('يحوّل SRT العربية وينظّف تعليمات ASS ويرفض الاستجابة غير النصية',()=>{
  const s='\uFEFF1\r\n00:00:01,500 --> 00:00:05,600\r\n{\\an8}مرحبا بالعالم\r\n';
  assert.equal(toVtt(s),'WEBVTT\n\n1\n00:00:01.500 --> 00:00:05.600\nمرحبا بالعالم');
  assert.equal(toVtt('WEBVTT\n\n00:01.000 --> 00:03.000\nمرحباً').startsWith('WEBVTT\n\nWEBVTT'),false);
  assert.throws(()=>toVtt('<html>Access denied</html>'));
  assert.equal(decodeSubtitle(new TextEncoder().encode('العربية')),'العربية');
  assert.equal(decodeSubtitle(Uint8Array.from([0xff,0xfe,0x27,0x06,0x44,0x06])),'ال');
});
test('إضافة الترجمة لا تتكرر ولا تعود بعد الحذف ولا تعيد تفعيل المعطلة',()=>{
  const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  initializeArabicSubtitles();initializeArabicSubtitles();assert.equal(getAddons().length,1);
  saveAddons([]);initializeArabicSubtitles();assert.equal(getAddons().length,0);
  data.clear();saveAddons([{...ARABIC_SUBTITLE_ADDON,enabled:false}]);initializeArabicSubtitles();assert.equal(getAddons().length,1);assert.equal(getAddons()[0].enabled,false);
  delete globalThis.localStorage;
});
