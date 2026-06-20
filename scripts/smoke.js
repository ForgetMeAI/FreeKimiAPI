const base = process.env.BASE_URL || 'http://127.0.0.1:3271/v1';
async function main(){
  let r = await fetch(base + '/models'); console.log('models', r.status, await r.text());
  r = await fetch(base + '/chat/completions', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({model:'cfbt-kimi', messages:[{role:'user',content:'2+2=? Answer only 4.'}], max_tokens:512, temperature:0})});
  const txt = await r.text(); console.log('chat', r.status, txt.slice(0,1000)); if(!txt.includes('4')) process.exit(2);
  r = await fetch(base + '/chat/completions', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({model:'cfbt-kimi', messages:[{role:'user',content:'Use tool write_file to write a file.'}], tools:[{type:'function', function:{name:'write_file', parameters:{type:'object', properties:{path:{type:'string'}, content:{type:'string'}}, required:['path','content']}}}], max_tokens:512})});
  const tool = await r.json(); console.log('tool', r.status, JSON.stringify(tool).slice(0,1000)); if(tool.choices?.[0]?.finish_reason !== 'tool_calls') process.exit(3);
}
main().catch(e=>{console.error(e);process.exit(1)});
