export const YEAR_CATALOGS=[2026,2025,2024,2023,2022,2021,2020];

export const GENRE_DEFINITIONS=[
  {slug:'action',name:'أكشن وإثارة',genre:'Action',icon:'◇'},
  {slug:'adventure',name:'مغامرات',genre:'Adventure',icon:'◇'},
  {slug:'animation',name:'رسوم متحركة',genre:'Animation',icon:'◇'},
  {slug:'comedy',name:'كوميديا',genre:'Comedy',icon:'◇'},
  {slug:'crime',name:'جريمة وتحقيق',genre:'Crime',icon:'◇'},
  {slug:'drama',name:'دراما',genre:'Drama',icon:'◇'},
  {slug:'family',name:'أفلام عائلية',genre:'Family',icon:'◇'},
  {slug:'fantasy',name:'فانتازيا',genre:'Fantasy',icon:'◇'},
  {slug:'history',name:'تاريخ',genre:'History',icon:'◇'},
  {slug:'horror',name:'رعب',genre:'Horror',icon:'◇'},
  {slug:'music',name:'موسيقى',genre:'Music',icon:'◇'},
  {slug:'mystery',name:'غموض',genre:'Mystery',icon:'◇'},
  {slug:'romance',name:'رومانسية',genre:'Romance',icon:'◇'},
  {slug:'sci-fi',name:'خيال علمي',genre:'Sci-Fi',icon:'◇'},
  {slug:'sport',name:'رياضة',genre:'Sport',icon:'◇'},
  {slug:'thriller',name:'تشويق',genre:'Thriller',icon:'◇'},
  {slug:'documentary',name:'وثائقيات',genre:'Documentary',icon:'◇'},
  {slug:'war',name:'أفلام حربية',genre:'War',icon:'◇'},
  {slug:'biography',name:'سيرة ذاتية',genre:'Biography',icon:'◇'},
  {slug:'western',name:'غربية',genre:'Western',icon:'◇'},
];

const GENRE_ALIASES=new Map([
  ['scifi','Sci-Fi'],['sci fi','Sci-Fi'],['sci-fi','Sci-Fi'],['science fiction','Sci-Fi'],
  ['musical','Music'],['music','Music'],['biography','Biography'],['bio','Biography'],
  ['documentary','Documentary'],['doc','Documentary'],['western','Western'],
]);

const clean=value=>String(value||'').trim();
const genreKey=value=>clean(value).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();

export function normalizeGenre(value){
  const raw=clean(value);
  if(!raw)return '';
  const key=genreKey(raw);
  const alias=GENRE_ALIASES.get(key);
  if(alias)return alias;
  const known=GENRE_DEFINITIONS.find(g=>genreKey(g.genre)===key);
  return known?.genre||raw.replace(/\b\w/g,c=>c.toUpperCase());
}

export function itemGenres(item){
  const source=Array.isArray(item?.genres)?item.genres:Array.isArray(item?.genre)?item.genre:[];
  return [...new Set(source.map(normalizeGenre).filter(Boolean))];
}

export function itemYear(item){
  const direct=Number(item?.year);
  if(Number.isInteger(direct)&&direct>1880&&direct<2100)return direct;
  for(const value of [item?.releaseInfo,item?.released]){
    const match=String(value||'').match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
    const year=match?Number(match[1]):null;
    if(year&&year>1880&&year<2100)return year;
  }
  return null;
}

export function itemRating(item){
  const rating=Number(item?.imdbRating??item?.rating);
  return Number.isFinite(rating)&&rating>0&&rating<=10?rating:null;
}

export function collectionKey(definition){
  return [definition.type,definition.id,...Object.entries(definition.extra||{}).map(([key,value])=>key+'='+value)].join('/');
}

export function builtInCollections(){
  return [
    {slug:'top-rated',name:'الأعلى تقييماً',type:'movie',id:'imdbRating',icon:'★'},
    {slug:'popular',name:'الأكثر رواجاً الآن',type:'movie',id:'top',icon:'✦'},
    ...YEAR_CATALOGS.map(year=>({slug:'year-'+year,name:'أفلام '+year,type:'movie',id:'year',extra:{genre:String(year)},icon:'◷'})),
    ...GENRE_DEFINITIONS.map(({slug,name,genre,icon})=>({slug,name,type:'movie',id:'top',extra:{genre},icon})),
    {slug:'series-rated',name:'المسلسلات الأعلى تقييماً',type:'series',id:'imdbRating',icon:'★'},
    {slug:'series',name:'مسلسلات تستحق وقتك',type:'series',id:'top',icon:'▤'},
  ].map(definition=>({...definition,key:collectionKey(definition)}));
}

export function normalizeCatalogItem(item,fallbackType='movie'){
  const year=itemYear(item);
  const rating=itemRating(item);
  return {
    ...item,
    type:item?.type||fallbackType,
    year,
    releaseInfo:item?.releaseInfo||year||item?.released||'',
    imdbRating:rating,
    genres:itemGenres(item),
    description:typeof item?.description==='string'?item.description.replace(/\s+/g,' ').trim().slice(0,320):'',
  };
}

export function matchesCollection(item,definition){
  if(!item||!definition)return true;
  if((item.type||'movie')!==definition.type)return false;
  const expected=definition.extra?.genre;
  if(definition.id==='year'&&expected)return itemYear(item)===Number(expected);
  if(expected)return itemGenres(item).includes(normalizeGenre(expected));
  return true;
}

export function filterCollectionRows(rows,definition){
  return (Array.isArray(rows)?rows:[]).filter(item=>matchesCollection(item,definition));
}
