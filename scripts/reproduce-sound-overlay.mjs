import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = process.argv.find((value) => /^https?:\/\//.test(value)) ?? 'http://127.0.0.1:5173';
const screenshotDir = resolve('work', 'mobile-qa');
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});

for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 780 }, { width: 430, height: 780 }, { width: 780, height: 360 }]) {
  const { width, height } = viewport;
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    class FailedUtterance { constructor(text){ this.text=text; this.lang=''; this.rate=1; this.pitch=1; this.volume=1; this.voice=null; } }
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:FailedUtterance,configurable:true});
    let playCount=0;
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[]},speak(u){playCount++;setTimeout(()=>playCount===1?u.onerror?.({error:'not-allowed'}):u.onend?.(),10)},pending:false,addEventListener(){},removeEventListener(){}},configurable:true});
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    localStorage.setItem('everyday-3-characters-v1', JSON.stringify({
      version:1,date:key,courseIndex:15,stage:'learn',characterIndex:0,reviewIndex:0,
      answerStats:{},learnedIds:[],reviewIds:[],streak:0,lastOpenDate:key,completedToday:false,completedDates:[],
      settings:{dailyCount:3,speechRate:.78,autoPlay:true,fontScale:1,optionCount:2,reminderTime:'09:00',difficulty:1,enabledThemes:{防骗:true,医院:true,手机:true}}
    }));
  });
  await page.goto(baseUrl);
  await page.waitForTimeout(1800);
  const positions = [];
  for (let sample = 0; sample < 8; sample++) {
    const overlay = page.locator('.sound-help');
    if (await overlay.count()) positions.push(await overlay.boundingBox());
    await page.waitForTimeout(300);
  }
  const card = await page.locator('.character-card').count() ? await page.locator('.character-card').boundingBox() : null;
  if (!card) {
    console.log(JSON.stringify({viewport, diagnosticText:(await page.locator('body').innerText()).slice(0,500),errors}));
    await page.close();
    continue;
  }
  const centers = positions.map(box=>({x:box.x+box.width/2,y:box.y+box.height/2}));
  await page.locator('.sound-help').click();
  await page.waitForTimeout(1800);
  const hiddenAfterUnlock = await page.locator('.sound-help-overlay').count()===0;
  const speaker=page.locator('.speaker').last();
  await speaker.click();await speaker.click();
  await page.waitForTimeout(1800);
  const hiddenAfterRepeat = await page.locator('.sound-help-overlay').count()===0;
  await page.screenshot({path:resolve(screenshotDir, `repro-fixed-${width}x${height}.png`),fullPage:true});
  console.log(JSON.stringify({viewport, centers, card, hiddenAfterUnlock, hiddenAfterRepeat, errors}));
  await page.close();
}

const voicePage=await browser.newPage({viewport:{width:390,height:780}});
await voicePage.addInitScript(()=>localStorage.clear());
await voicePage.goto(baseUrl);
await voicePage.waitForTimeout(1500);
const deviceVoice=await voicePage.evaluate(()=>({selected:JSON.parse(localStorage.getItem('everyday-3-characters-v1')||'{}')?.settings?.voiceName||'',available:speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('zh')).map(v=>({name:v.name,lang:v.lang}))}));
console.log(JSON.stringify({deviceVoice}));
await voicePage.close();
await browser.close();
