const assert=require('node:assert/strict');
const fs=require('node:fs');
const {test}=require('node:test');
const {runtime}=require('./helpers/i18nRuntime.cjs');
const {buildMapLinks,openMapLinks}=runtime().load('src/lib/mapDirections.ts');
const destination={latitude:37.54,longitude:127.05,name:'팝업 & 日本語',address:'서울 성수',countryCode:'KR'};
const id=require('../app.json').expo.ios.bundleIdentifier;

test('Google/Apple URLs encode the actual destination and omit origin and API keys on all platforms',()=>{
  for(const platform of ['ios','android','web']) for(const service of ['google','apple']) {
    const links=buildMapLinks(service,destination,platform,id),url=new URL(links.webUrl);
    assert.equal(url.searchParams.get('destination'),'37.54,127.05');
    assert.equal(url.searchParams.has('origin'),false);assert.equal(url.searchParams.has('source'),false);
    assert.equal(url.searchParams.has('key'),false);assert.ok(links.webUrl.includes('37.54%2C127.05'));
    if(service==='google'){assert.equal(url.searchParams.get('api'),'1');assert.equal(links.appUrl,
      platform==='ios'?'comgooglemaps://?daddr=37.54%2C127.05':null);}
    else{assert.equal(url.pathname,'/directions');assert.equal(links.appUrl,null);}
  }
});
test('NAVER Korean app routes use the real identifier and current-location default, Japan never gets a route',()=>{
  for(const platform of ['ios','android']){
    const links=buildMapLinks('naver',destination,platform,id),url=new URL(links.appUrl);
    assert.equal(url.host,'route');assert.equal(url.pathname,'/public');
    assert.equal(url.searchParams.get('dlat'),'37.54');assert.equal(url.searchParams.get('dlng'),'127.05');
    assert.equal(url.searchParams.get('dname'),destination.name);assert.equal(url.searchParams.get('appname'),id);
    assert.equal(url.searchParams.has('slat'),false);assert.equal(url.searchParams.has('slng'),false);
  }
  for(const place of [{...destination,countryCode:'JP',latitude:35.68,longitude:139.76},
    {...destination,latitude:45}, {...destination,longitude:133}]){
    const links=buildMapLinks('naver',place,'ios',id);assert.equal(links.appUrl,null);
    assert.equal(links.webUrl,'https://map.naver.com/');assert.equal(links.naverWeb,true);
  }
  assert.equal(buildMapLinks('naver',destination,'web',id).appUrl,null);
  assert.equal(buildMapLinks('naver',destination,'ios').appUrl,null);
});
test('invalid/missing coordinates fall back to an encoded address; no destination never creates a link',()=>{
  for(const latitude of [undefined,null,NaN,Infinity,91,'37']){
    for(const service of ['google','apple','naver']){
      assert.equal(buildMapLinks(service,{latitude,longitude:127},'ios',id),null);
      const place={...destination,latitude,address:'서울 & 渋谷 #1'},links=buildMapLinks(service,place,'ios',id);
      const url=new URL(service==='naver'?links.appUrl:links.webUrl);
      assert.equal(url.searchParams.get(service==='naver'?'query':'destination'),place.address);
    }
  }
  assert.equal(buildMapLinks('google',{latitude:0,longitude:0},'web').destination,'0,0');
  assert.equal(buildMapLinks('apple',{latitude:37,longitude:181},'web'),null);
});
test('NAVER launches directly even when availability queries would return false or reject',async()=>{
  for(const platform of ['ios','android']) for(const queryResult of [true,false,'reject']){
    const links=buildMapLinks('naver',destination,platform,id),calls=[];
    const result=await openMapLinks(links,{
      canOpenURL:async url=>{calls.push(['query',url]);if(queryResult==='reject')throw Error('query restricted');return queryResult;},
      openURL:async url=>{calls.push(['open',url]);},
    },platform);
    assert.equal(result,'app');assert.deepEqual(calls,[['open',links.appUrl]]);
  }
});
test('NAVER missing app or launch failure falls back once; web failure is handled safely',async()=>{
  for(const platform of ['ios','android']) for(const webFails of [false,true]){
    const links=buildMapLinks('naver',destination,platform,id),calls=[];
    const result=await openMapLinks(links,{
      canOpenURL:async()=>{assert.fail('NAVER launch must not depend on a query');},
      openURL:async url=>{calls.push(url);if(url===links.appUrl||webFails)throw Error('unable to open URL');},
    },platform);
    assert.equal(result,webFails?'failed':'web');assert.deepEqual(calls,[links.appUrl,links.webUrl]);
  }
});
test('Web and unsupported NAVER destinations open only the official website',async()=>{
  for(const platform of ['ios','android','web']){
    for(const place of [destination,{...destination,countryCode:'JP',latitude:35.68,longitude:139.76}]){
      if(platform!=='web'&&place.countryCode==='KR')continue;
      const links=buildMapLinks('naver',place,platform,id),calls=[];
      assert.equal(await openMapLinks(links,{
        canOpenURL:async()=>{assert.fail('no native query');},openURL:async url=>{calls.push(url);},
      },platform),'web');
      assert.deepEqual(calls,['https://map.naver.com/']);
    }
  }
});
test('Google keeps its existing availability query and fallback behavior',async()=>{
  const links=buildMapLinks('google',destination,'ios',id);
  for(const mode of ['installed','absent','queryFailure','appFailure','allFailure']){
    const calls=[];
    const result=await openMapLinks(links,{
      canOpenURL:async url=>{calls.push(['query',url]);if(mode==='queryFailure')throw Error('query');return mode!=='absent';},
      openURL:async url=>{calls.push(['open',url]);if(mode==='allFailure'||(mode==='appFailure'&&url===links.appUrl))throw Error('open');},
    },'ios');
    assert.equal(result,mode==='installed'?'app':mode==='allFailure'?'failed':'web');
    const opened=mode==='installed'?[links.appUrl]:mode==='appFailure'||mode==='allFailure'?[links.appUrl,links.webUrl]:[links.webUrl];
    assert.deepEqual(calls,[['query',links.appUrl],...opened.map(url=>['open',url])]);
  }
});
test('native queries are limited to required apps and Android plugin preserves existing queries idempotently',()=>{
  assert.deepEqual(require('../app.json').expo.ios.infoPlist.LSApplicationQueriesSchemes,['nmap','comgooglemaps']);
  const module={exports:{}};let modifier;
  new Function('require','module',fs.readFileSync('plugins/withMapAppQueries.js','utf8'))(name=>{
    assert.equal(name,'expo/config-plugins');return {withAndroidManifest:(config,fn)=>{modifier=fn;return config;}};
  },module);
  const config={modResults:{manifest:{queries:[{package:[{$:{'android:name':'existing.app'}}]}]}}};
  module.exports(config);modifier(config);modifier(config);
  assert.deepEqual(config.modResults.manifest.queries[0].package.map(p=>p.$['android:name']),['existing.app','com.nhn.android.nmap']);
});
