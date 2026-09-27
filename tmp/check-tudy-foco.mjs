import { chromium } from '../backend/node_modules/playwright/index.mjs';
import sharp from '../backend/node_modules/sharp/lib/index.js';
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page = await browser.newPage({viewport:{width:420,height:525},deviceScaleFactor:1080/420});
const url='file://' + process.cwd() + '/backend/src/templates/elevepic/tudy-foco.html';
await page.goto(url);
await page.evaluate(()=>document.fonts.ready);
await page.addStyleTag({content:'.nav-dots{display:none}body{display:block;min-height:0}'});
const problems=[];
for(let i=0;i<7;i++){
 await page.evaluate(i=>{document.querySelectorAll('.slide').forEach((s,n)=>s.style.display=n===i?'flex':'none');document.querySelector('.carousel').scrollLeft=0},i);
 problems.push(...await page.evaluate(()=>Array.from(document.querySelectorAll('.slide')).filter(s=>s.style.display!=='none').flatMap(s=>Array.from(s.querySelectorAll('h1,h2,h3,p,.footer,.route-label,.product')).filter(e=>{let r=e.getBoundingClientRect();return r.bottom>525||r.right>420||e.scrollWidth>e.clientWidth+1}).map(e=>({text:e.textContent,tag:e.className,rect:e.getBoundingClientRect().toJSON()})))));
 await page.screenshot({path:`output/tudy-foco/slide-${i+1}.png`});
}
await page.goto(url);
await page.setViewportSize({width:375,height:650});
await page.locator('#next').click();await page.waitForFunction(()=>document.getElementById('position').textContent==='2 / 7');
await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.getElementById('position').textContent==='1 / 7');
console.log(JSON.stringify({problems,navigation:'OK',mobileOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));
await browser.close();
const thumbs=await Promise.all(Array.from({length:7},(_,i)=>sharp(`output/tudy-foco/slide-${i+1}.png`).resize(336,420).toBuffer()));
await sharp({create:{width:1384,height:880,channels:3,background:'#242830'}}).composite(thumbs.map((input,i)=>({input,left:10+(i%4)*346,top:10+Math.floor(i/4)*440}))).png().toFile('output/tudy-foco/preview.png');
