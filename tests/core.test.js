import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {server} from '../server.js';
import {resourceURL,supports,safeURL} from '../js/api.js';
import {partition,library,markWatched,xp,stageStatus} from '../js/store.js';

test('يبني مسارات البروتوكول مع الحفاظ على إعداد الإضافة',()=>{
  assert.equal(resourceURL('https://example.org/token/manifest.json','stream','series','tt123:1:2'),'https://example.org/token/stream/series/tt123%3A1%3A2.json');
  assert.equal(resourceURL('https://example.org/manifest.json','catalog','movie','top',{search:'a & b',skip:100}),'https://example.org/catalog/movie/top/search=a%20%26%20b&skip=100.json');
  assert.equal(safeURL('javascript:alert(1)'),'');
});
test('يحترم أنواع وبوادئ الموارد والتعطيل',()=>{
  const a={enabled:true,manifest:{types:['movie'],idPrefixes:['tt'],resources:['stream',{name:'meta',types:['series'],idPrefixes:['custom:']}]}};
  assert.equal(supports(a,'stream','movie','tt123'),true);
  assert.equal(supports(a,'stream','series','tt123'),false);
  assert.equal(supports(a,'meta','series','custom:1'),true);
  assert.equal(supports({...a,enabled:false},'stream','movie','tt1'),false);
});
test('46 عنواناً فريداً مع نسخة احتياطية ومراحل من 10 إلى 15',async()=>{
  const movies=JSON.parse(await readFile(new URL('../data/movies.json',import.meta.url),'utf8'));
  const descriptions=JSON.parse(await readFile(new URL('../data/ar-descriptions.json',import.meta.url),'utf8'));
  assert.equal(movies.length,46);assert.equal(new Set(movies.map(m=>m.id)).size,46);
  assert.ok(movies.every(m=>/^tt\d+$/.test(m.id)&&m.name&&descriptions[m.id]?.ar));
  assert.ok(partition(movies).every(s=>s.length>=10&&s.length<=15));
});
test('لا تتكرر نقاط المشاهدة وتفتح المرحلة التالية بعد اكتمال السابقة',()=>{
  const m={id:'test-one',type:'movie'},n={id:'test-two',type:'movie'},stages=[{items:[m]},{items:[n]}],initial=xp();
  assert.equal(stageStatus(stages,1).unlocked,false);
  assert.equal(markWatched(m).first,true);assert.equal(xp(),initial+50);
  assert.equal(markWatched(m).first,false);assert.equal(xp(),initial+50);
  assert.equal(stageStatus(stages,1).unlocked,true);
  markWatched({id:'test-series',type:'series'},'test-series:1:1',false);
  assert.equal(library.watched['test-series'],undefined);
});
test('يخدم الملفات العامة ويمنع الملفات الخاصة والوكيل المفتوح',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await fetch(origin)).status,200);
    assert.equal((await fetch(origin+'/js/api.js')).status,200);
    assert.equal((await fetch(origin+'/server.js')).status,404);
    assert.equal((await fetch(origin+'/.git/config')).status,404);
    assert.equal((await fetch(origin+'/api/proxy?url='+encodeURIComponent('http://127.0.0.1/manifest.json'))).status,403);
    assert.equal((await fetch(origin+'/api/proxy?url='+encodeURIComponent('https://example.org/manifest.json'))).status,403);
    assert.equal((await fetch(origin+'/api/proxy?url=no')).status,400);
    assert.equal((await fetch(origin,{method:'POST'})).status,405);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
