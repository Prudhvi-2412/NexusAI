'use client';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
const Player = dynamic(() => import('@lottiefiles/dotlottie-react').then(m => { m.setWasmUrl('/animations/dotlottie-player.wasm'); return m.DotLottieReact; }), {ssr:false});
// Original grayscale Lottie composition. Plays once when a connection is established.
const animation = {
  v:'5.7.4',fr:30,ip:0,op:45,w:96,h:96,nm:'Nexus connection',ddd:0,assets:[],
  layers:[{ddd:0,ind:1,ty:4,nm:'Connection ring',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[48,48,0]},a:{a:0,k:[0,0,0]},s:{a:1,k:[{t:0,s:[70,70,100],e:[100,100,100],o:{x:.2,y:.8},i:{x:.2,y:1}},{t:20,s:[100,100,100]}]}},shapes:[{ty:'el',p:{a:0,k:[0,0]},s:{a:0,k:[54,54]},nm:'Ring'},{ty:'st',c:{a:0,k:[.72,.72,.72,1]},o:{a:0,k:100},w:{a:0,k:2},lc:2,lj:2},{ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}],ip:0,op:45,st:0,bm:0},
  {ddd:0,ind:2,ty:4,nm:'Check',sr:1,ks:{o:{a:1,k:[{t:0,s:[0],e:[100],o:{x:.2,y:.8},i:{x:.2,y:1}},{t:12,s:[100]}]},r:{a:0,k:0},p:{a:0,k:[48,48,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},shapes:[{ty:'sh',ks:{a:0,k:{i:[[0,0],[0,0],[0,0]],o:[[0,0],[0,0],[0,0]],v:[[-12,0],[-3,9],[14,-9]],c:false}}},{ty:'st',c:{a:0,k:[.94,.94,.94,1]},o:{a:0,k:100},w:{a:0,k:3},lc:2,lj:2}],ip:0,op:45,st:0,bm:0}]
};
export function ConnectionAnimation() {
  const reduced = useReducedMotion();
  return <span aria-hidden="true" className="block w-12 h-12">{reduced ? <CheckCircle2 className="w-8 h-8 m-2 text-slate-300"/> : <Player data={JSON.stringify(animation)} autoplay loop={false} className="w-12 h-12" />}</span>;
}
