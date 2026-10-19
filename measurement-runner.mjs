import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import vm from 'node:vm';
import {evaluateAll} from './dist/measurement-core.mjs';
import {renderMeasurementHTML} from './measurement-render.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const digest=text=>createHash('sha256').update(text).digest('hex');

export function loadSiteEvaluator(source) {
  const elements=new Map();
  const element=id=>{
    if (!elements.has(id)) elements.set(id,{addEventListener(){},getBoundingClientRect(){return {width:0,height:0}}});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element,querySelectorAll(selector){
      if(selector==='.butterfly') return Array.from({length:5},()=>({style:{}}));
      return [];
    }},
    matchMedia(){return {matches:true,addEventListener(){}}},
    requestAnimationFrame(){throw new Error('Unexpected animation in measurement sandbox')}
  });
  vm.runInContext(`${source}\n;globalThis.__measurementCandidate = evaluateCase;`,context,{filename:'dist/app.js',timeout:1000});
  if (typeof context.__measurementCandidate!=='function') throw new Error('evaluateCase missing from site app.js');
  return messages=>{
    const result=context.__measurementCandidate(messages);
    return JSON.parse(JSON.stringify(result));
  };
}

export function runMeasurement({write=true}={}) {
  const appSource=readFileSync(join(root,'dist','app.js'),'utf8');
  const coreSource=readFileSync(join(root,'dist','measurement-core.mjs'),'utf8');
  const candidate=loadSiteEvaluator(appSource);
  const result=evaluateAll(candidate);
  result.provenance={candidateFile:'app.js',candidateSha256:digest(appSource),
    coreFile:'measurement-core.mjs',coreSha256:digest(coreSource),
    runner:'measurement-runner.mjs',generatedAt:new Date().toISOString(),
    runtime:'Node VM with inert DOM stubs; no browser UI, network, sensor or external actor'};
  if(write){
    writeFileSync(join(root,'dist','measurement-results.json'),JSON.stringify(result,null,2)+'\n');
    writeFileSync(join(root,'dist','measurement-lab.html'),renderMeasurementHTML(result));
  }
  return result;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=runMeasurement();
  const {metrics,gates}=result;
  process.stdout.write(`C-DROHNE synthetic measurement: candidate ${metrics.candidateMatchesExpected}/${metrics.syntheticCases}, checklist ${metrics.checklistMatchesExpected}/${metrics.syntheticCases}; invalid accepted ${metrics.candidateInvalidAccepted}; state ${gates.currentVerdict}.\n`);
  for(const row of result.rows.filter(row=>!row.candidateCheck.pass)) process.stdout.write(`  ${row.id}: ${row.candidateCheck.failure}\n`);
  process.stdout.write('Wrote dist/measurement-results.json and dist/measurement-lab.html.\n');
}
