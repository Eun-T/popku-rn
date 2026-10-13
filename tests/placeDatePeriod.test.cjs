const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runtime,nodes}=require('./helpers/i18nRuntime.cjs');

test('local defaults and seven-day presets keep inclusive dates and validate real calendar days',()=>{
  const ui=runtime(),lib=ui.load('src/lib/placeDatePeriod.ts');
  assert.deepEqual(lib.presetDatePeriod('sevenDays',new Date(2026,11,28,23)),
    {mode:'sevenDays',startDate:'2026-12-28',endDate:'2027-01-03'});
  assert.deepEqual(lib.presetDatePeriod('today',new Date(2026,9,10)),
    {mode:'today',startDate:'2026-10-10',endDate:'2026-10-10'});
  assert.equal(lib.dateAfterDays(7,new Date(2026,11,28,23)),'2027-01-04');
  for(const text of ['2026.02.29','2026.13.01','0000.01.01','2026.10','2026.10.0',''])assert.equal(lib.parseDateInput(text),null);
  assert.equal(lib.parseDateInput('2028.02.29'),'2028-02-29');
  assert.equal(lib.parseDateInput('2026.10.10'),'2026-10-10');
  assert.equal(lib.isValidDateRange('2026-10-10','2026-10-10'),true);
  assert.equal(lib.isValidDateRange('2026-10-12','2026-10-10'),false);
  ui.dispose();
});

test('date mask handles progressive input, paste, eight-digit limit and cursor-aware middle edits/deletion',()=>{
  const ui=runtime(),lib=ui.load('src/lib/placeDatePeriod.ts');
  for(const [raw,formatted] of [['2','2'],['2026','2026'],['20261','2026.1'],['202610','2026.10'],['2026101','2026.10.1'],['20261017','2026.10.17'],['2026-10-17','2026.10.17'],['20261017999','2026.10.17']])
    assert.equal(lib.formatDateInput(raw),formatted);
  const edit=(before,after,start,end=start)=>lib.editDateInput(before,after,{start,end});
  assert.deepEqual(edit('2026','20261',4),{text:'2026.1',selection:{start:6,end:6}});
  assert.deepEqual(edit('2026.10.17','2026.11.17',6,7),{text:'2026.11.17',selection:{start:8,end:8}});
  assert.deepEqual(edit('2026.10.17','202610.17',5),{text:'2021.01.7',selection:{start:3,end:3}});
  assert.deepEqual(edit('2026.10.17','202610.17',4),{text:'2026.01.7',selection:{start:5,end:5}});
  assert.deepEqual(edit('2026.10.17','2026.10.1',10),{text:'2026.10.1',selection:{start:9,end:9}});
  assert.deepEqual(edit('2026.10.11','2026.10.1',9),{text:'2026.10.1',selection:{start:8,end:8}});
  assert.deepEqual(edit('2026.10.17','',0,10),{text:'',selection:{start:0,end:0}});
  assert.equal(edit('','2026-10-17',0).text,'2026.10.17');
  ui.dispose();
});

test('two direct date inputs separate raw edits from validated draft dates and restore external applied/reset values',()=>{
  const ui=runtime({
    'react-native':{View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',Keyboard:{dismiss(){}},StyleSheet:{create:s=>s}},
    'lucide-react-native':{CalendarDays:'CalendarDays'},
    'src/hooks/useTranslation.ts':{useTranslation:()=>({t:key=>key,resolvedLanguage:'ko'})},
  });
  const lib=ui.load('src/lib/placeDatePeriod.ts'),Picker=ui.load('src/components/place/PlacePeriodPicker.tsx').default;
  let value=lib.emptyDatePeriod(),visible=true;const changes=[];
  const root=ui.mount(()=>Picker({value,visible,onChange:next=>{changes.push(next);value=next;}}));
  const input=field=>nodes(root.tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===`place.all.period.${field}`);
  const focus=field=>{input(field).props.onFocus();ui.renderAll();};
  const selection=(field,start,end=start)=>{input(field).props.onSelectionChange({nativeEvent:{selection:{start,end}}});ui.renderAll();};
  const edit=(field,text)=>{
    const pending=input(field).props.selection;
    if(pending)selection(field,pending.start,pending.end);
    input(field).props.onChangeText(text);ui.renderAll();
  };
  assert.equal(nodes(root.tree).filter(n=>n.type==='TextInput').length,2);
  assert.equal(nodes(root.tree).filter(n=>n.type==='CalendarDays').length,2);
  assert.equal(nodes(root.tree).filter(n=>n.type==='Pressable').length,3); // presets only, no panel
  for(const field of ['start','end']) {
    assert.equal(input(field).props.keyboardType,'number-pad');assert.equal(input(field).props.style.height,44);
    assert.equal(input(field).props.placeholder,`place.all.period.${field}`);
  }
  const containers=nodes(root.tree).filter(n=>Array.isArray(n.props.style)&&n.props.style[0]?.height===44);
  assert.equal(containers.length,2);for(const container of containers)assert.equal(container.props.style[0].flex,1);
  focus('start');assert.equal(value.startDate,'2026-10-09');assert.equal(input('start').props.value,'2026.10.09');
  focus('end');assert.equal(value.endDate,'2026-10-16');assert.equal(input('end').props.value,'2026.10.16');
  const count=changes.length;focus('end');assert.equal(changes.length,count);
  edit('end','2026.10.1');assert.equal(value.endDate,null);assert.equal(input('end').props.value,'2026.10.1');
  focus('end');assert.equal(input('end').props.value,'2026.10.1');assert.equal(value.endDate,null);
  edit('end','2028.02.29');assert.equal(value.endDate,'2028-02-29');
  edit('end','2026.02.29');assert.equal(value.endDate,null);assert.equal(input('end').props.value,'2026.02.29');
  edit('end','2026.10.08');assert.equal(value.endDate,'2026-10-08');assert.equal(lib.isValidDateRange(value.startDate,value.endDate),false);
  edit('end','2026.10.09');assert.equal(lib.isValidDateRange(value.startDate,value.endDate),true);
  const beforeBlur=changes.length;input('end').props.onBlur?.();ui.renderAll();assert.equal(changes.length,beforeBlur);
  assert.equal(nodes(root.tree).filter(n=>n.type==='Pressable').some(n=>n.props.accessibilityState.selected),false);
  nodes(root.tree).find(n=>n.key==='sevenDays').props.onPress();ui.renderAll();
  assert.equal(value.endDate,'2026-10-15');assert.equal(input('end').props.value,'2026.10.15');
  edit('start','20261017');assert.equal(value.mode,'custom');assert.equal(value.startDate,'2026-10-17');
  const applied={mode:'custom',startDate:'2026-10-10',endDate:'2026-10-12'};
  value=applied;visible=false;ui.renderAll();visible=true;ui.renderAll();
  assert.equal(input('start').props.value,'2026.10.10');assert.equal(input('end').props.value,'2026.10.12');
  edit('end','2026.10');assert.equal(value.endDate,null);
  value=lib.emptyDatePeriod();ui.renderAll();
  assert.equal(input('start').props.value,'');assert.equal(input('end').props.value,'');
  ui.dispose();
});
