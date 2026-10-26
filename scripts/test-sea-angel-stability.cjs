/* Dynamic regression checks for the shared steering and shoulder rig. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {settings,createSchool}=require('../landing-sea-angels'),Rig=require('../brand/sea-angel/rig');
const layout=require('./sea-angel-layouts.json').find(l=>l.width===1440),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../brand/sea-angel/shape'),'utf8'),ctx);
const shape=ctx.window.seaAngelShape,school=createSchool({...layout,settings,shape,population:6});
let shoulderChecks=0,tailChecks=0;
for(let f=0;f<3600;f++){
 const angular=school.fish.map(a=>a.angularVelocity);school.step(1/60);
 school.fish.forEach((a,i)=>{assert.ok(Math.abs(a.angularVelocity-angular[i])<=.8/60+1e-10);assert.ok(Math.abs(a.turn)<=.55+1e-10);assert.ok(a.speed>=16);});
 if(f%90)continue;
 const a=school.fish[1],savedPhase=a.phase,savedTurn=a.turn;
 let reference, envelope;
 for(const phase of [0,1,2,3,4,5]){
  a.phase=phase;school.pose(a);
  if(!reference){reference=a.shoulder.slice();envelope=school.strokeEnvelope(a);}
  assert.deepEqual(school.strokeEnvelope(a),envelope,'early obstacle envelope is independent of stroke and tail phase');
  assert.ok(a.bounds.left>=envelope.left&&a.bounds.right<=envelope.right&&a.bounds.top>=envelope.top&&a.bounds.bottom<=envelope.bottom,'stroke envelope contains complete deformed outline');
  assert.deepEqual(a.shoulder,reference,'tail and stroke cannot rock shoulder frame');
  for(const y of [-38,-24,0,20,53,60]){const frame=Rig.frame(a,y,new Float64Array(4));assert.equal(frame[2],a.shoulder[2]);assert.equal(frame[3],a.shoulder[3]);shoulderChecks++;}
  // Independent reconstruction of the previous tail transform; identical inputs.
  [...shape.body,...shape.highlight].flat().forEach(([x,y],i)=>{
   if(y<100)return;
   const t=(y+80)/32.5,j=Math.max(0,Math.min(7,Math.floor(t))),u=t-j,u2=u*u,u3=u2*u;
   const h0=2*u3-3*u2+1,h1=-2*u3+3*u2,m0=(u3-2*u2+u)*32.5*a.scale,m1=(u3-u2)*32.5*a.scale;
   const nx=a.normals[j*2]*(1-u)+a.normals[(j+1)*2]*u,ny=a.normals[j*2+1]*(1-u)+a.normals[(j+1)*2+1]*u;
   const px=h0*a.spine[j*2]+h1*a.spine[(j+1)*2]-m0*a.normals[j*2+1]-m1*a.normals[(j+1)*2+1]+nx*x*a.scale;
   const py=h0*a.spine[j*2+1]+h1*a.spine[(j+1)*2+1]+m0*a.normals[j*2]+m1*a.normals[(j+1)*2]+ny*x*a.scale;
   assert.equal(a.points[i*2],Math.fround(px));assert.equal(a.points[i*2+1],Math.fround(py));tailChecks++;
  });
 }
 a.phase=savedPhase;a.turn=savedTurn;school.pose(a);
}
const ordered=createSchool({...layout,settings,shape,population:6}),reversed=createSchool({...layout,settings,shape,population:6});reversed.fish.reverse();
for(let f=0;f<600;f++){ordered.step(1/60);reversed.step(1/60)}
ordered.fish.forEach(a=>assert.deepEqual(a.points,reversed.fish.find(b=>a.id===b.id).points,'same beginning-of-step snapshot independent of update order'));
console.log(JSON.stringify({passed:true,angularAccelerationChecks:3600*school.fish.length,shoulderChecks,tailChecks,orderIndependent:true}));
