import { chromium } from "playwright-core";
const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const page=await browser.newPage({viewport:{width:390,height:780}});
page.setDefaultTimeout(2000);
const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.addInitScript(()=>{
  class U{constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;this.voice=null}}
  const voices=[{name:'Microsoft Xiaoxiao Online (Natural)',lang:'zh-CN',localService:false},{name:'普通话本地声音',lang:'zh-CN',localService:true}];
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:U,configurable:true});
  Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return voices},speak(u){setTimeout(()=>u.onend?.(),10)},pending:false,addEventListener(){},removeEventListener(){}},configurable:true});
  const d=new Date();const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  localStorage.setItem('everyday-3-characters-v1',JSON.stringify({version:1,date,courseIndex:0,stage:'settings',characterIndex:0,reviewIndex:0,answerStats:{},learnedIds:[],reviewIds:[],streak:0,lastOpenDate:date,completedToday:false,completedDates:[],settings:{dailyCount:3,speechRate:.78,voiceName:'Microsoft Xiaoxiao Online (Natural)',introPauseMs:600,characterPauseMs:900,autoPlay:false,fontScale:1,optionCount:2,reminderTime:'09:00',difficulty:1,enabledThemes:{防骗:true,医院:true,手机:true}}}));
});
await page.goto('http://127.0.0.1:5173');
await page.waitForTimeout(500);
console.log(JSON.stringify({body:(await page.locator('body').innerText()).slice(0,300),settingsCount:await page.locator('.settings').count(),storage:await page.evaluate(()=>localStorage.getItem('everyday-3-characters-v1'))}));
const voiceSelect=page.locator('.settings select').nth(1);
const optionCount=await voiceSelect.locator('option').count();
await voiceSelect.selectOption({index:1});const chosen=await voiceSelect.inputValue();
await page.getByRole('button',{name:/试听声音/}).click();await page.waitForTimeout(50);
const preview=await page.getByRole('status').filter({hasText:'正在使用'}).innerText();
await page.getByRole('button',{name:'保存设置'}).click();
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('everyday-3-characters-v1')).settings.voiceName);
console.log(JSON.stringify({optionCount,chosen,saved,preview,settingsVisibleAfterSave:await page.locator('.settings').count()>0,errors}));
await browser.close();
