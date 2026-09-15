const vm=require('vm'),fs=require('fs'),assert=require('assert');
async function scenario(existing,cart,used=false){
 const nodes=new Map();const context=new Proxy({},{get:(o,k)=>o[k]||(()=>{})});
 for(const id of ['roletaDialog','girarRoleta','roletaResultado','roletaCanvas','roletaWheelView','roletaPrizeView','roletaPrizeTitle','roletaPrizeDescription','roletaUsePrize','roletaBack','roletaConfetti','abrirRoleta','fecharRoleta','roletaBanner'])nodes.set(id,{style:{},classList:{toggle(){}},textContent:'',hidden:false,focus(){},addEventListener(){},getContext(){return context},clientWidth:380,clientHeight:600,showModal(){this.open=true},close(){this.open=false}});
 const launcher={textContent:''};let posts=0,timing=[];
 const prize={ativa:true,premio:existing?'off10':null,indice:existing?1:null,utilizado:used};
 const sandbox={document:{getElementById:id=>nodes.get(id)||null,querySelector:()=>launcher,addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:k=>k==='clientToken'?'token':k==='fp_fitness_cart'?JSON.stringify(cart):null},sessionStorage:{getItem(){return null}},fetch:async(url,options)=>{if(options.method==='POST'){posts++;prize.premio='brinde';prize.indice=4;}return {ok:true,status:200,json:async()=>({...prize})}},matchMedia:()=>({matches:false}),setInterval(){return 1},clearInterval(){},setTimeout:(fn,ms)=>{timing.push(ms);fn();},clearTimeout(){},requestAnimationFrame(){},devicePixelRatio:1,performance:{now:()=>0},console,Date,Math,location:{pathname:'/store'}};
 vm.runInNewContext(fs.readFileSync('frontend/js/roleta.js','utf8'),sandbox);
 await new Promise(setImmediate);await nodes.get('abrirRoleta').onclick();
 await nodes.get('girarRoleta').onclick();
 assert.equal(nodes.get('roletaPrizeView').hidden,false);
 assert.equal(nodes.get('roletaUsePrize').href,used?'/store/conta':cart.length?'/store/checkout':'/store/produtos');
 assert.equal(posts,existing?0:1);
 if(!existing)assert(timing.includes(7100));
 nodes.get('roletaBack').onclick();assert.equal(nodes.get('roletaWheelView').hidden,false);
 await nodes.get('girarRoleta').onclick();assert.equal(posts,existing?0:1);
 console.log('PASS',existing?'prêmio salvo':'novo giro',cart.length?'com carrinho':'sem carrinho',used?'usado':'disponível');
}
(async()=>{await scenario(true,[]);await scenario(true,[{id:1}]);await scenario(true,[],true);await scenario(false,[]);})();
