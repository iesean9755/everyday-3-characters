import { chromium } from "playwright-core";
const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const page=await browser.newPage({viewport:{width:390,height:780}});
await page.addInitScript(()=>{
  class U{constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;this.voice=null}}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:U,configurable:true});
  Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[]},speak(u){setTimeout(()=>u.onend?.(),5)},pending:false,addEventListener(){},removeEventListener(){}},configurable:true});
  const d=new Date();const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  localStorage.setItem('everyday-3-characters-v1',JSON.stringify({version:1,date,courseIndex:0,stage:'complete',characterIndex:2,reviewIndex:0,answerStats:{},learnedIds:['d1-1','d1-2','d1-3'],reviewIds:[],streak:1,lastOpenDate:date,completedToday:true,completedDates:[date],settings:{dailyCount:3,speechRate:.78,voiceName:'',introPauseMs:600,characterPauseMs:900,autoPlay:false,fontScale:1,optionCount:2,reminderTime:'09:00',difficulty:1,enabledThemes:{防骗:true,医院:true,手机:true}}}));
});
await page.goto('http://127.0.0.1:5173');await page.waitForTimeout(500);
const buttons=await page.getByRole('button').allTextContents();
console.log(JSON.stringify({heading:await page.locator('h1').innerText(),buttons,hasCloseCall:(await page.locator('.quiet-close').count())>0,url:page.url()}));
await page.screenshot({path:'C:/Users/18756/Documents/Codex/2026-07-15/files-mentioned-by-the-user-c/work/completion-before.png',fullPage:true});
await browser.close();
