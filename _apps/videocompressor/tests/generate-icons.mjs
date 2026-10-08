import {chromium} from '@playwright/test';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {const p=await browser.newPage();const svg=await readFile('public/icons/icon.svg','utf8');for(const size of [192,512]){await p.setViewportSize({width:size,height:size});await p.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh}</style>${svg}`);await p.screenshot({path:`public/icons/icon-${size}.png`,omitBackground:true});}}finally{await browser.close();}
await copyFile('public/manifest.webmanifest','public/manifest_BU.webmanifest');const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));manifest.icons=[192,512].map(size=>({src:`./icons/icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'}));await writeFile('public/manifest.webmanifest',JSON.stringify(manifest,null,2));
