import{H as O,C,a as Y,g as N,b as U,c as z,e as $,d as S,s as G,r as tt,u as et,i as L,q as V,f as nt,h as b,j as st,k as g,B as x,p as A,l as W,m as P,n as y,o as B,t as it,v as F,w as J,x as at,y as rt,z as D,A as M,D as ot,E as lt,F as ht,G as ct,I as j,J as ut,K as ft,L as dt,M as pt,N as _t,O as mt,P as gt,Q as vt,R as yt,S as bt,T as wt,U as kt}from"./index2.js";import{d as K,a as Et,s as xt}from"./context.js";import"clsx";import"./environment.js";let Tt={};function Jt(s){}function Kt(s){Tt=s}function Q(s){console.warn("https://svelte.dev/e/hydration_mismatch")}function Rt(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}let m=!1;function T(s){m=s}let u;function k(s){if(s===null)throw Q(),O;return u=s}function Ot(){return k(N(u))}function St(s=1){if(m){for(var t=s,n=u;t--;)n=N(n);u=n}}function Pt(s=!0){for(var t=0,n=u;;){if(n.nodeType===C){var a=n.data;if(a===Y){if(t===0)return n;t-=1}else(a===U||a===z)&&(t+=1)}var r=N(n);s&&n.remove(),n=r}}function Ct(s){let t=0,n=G(0),a;return()=>{$()&&(S(n),tt(()=>(t===0&&(a=et(()=>s(()=>L(n)))),t+=1,()=>{V(()=>{t-=1,t===0&&(a?.(),a=void 0,L(n))})})))}}var Nt=lt|ht|ct;function At(s,t,n){new Dt(s,t,n)}class Dt{parent;#e=!1;#t;#m=m?u:null;#i;#u;#a;#s=null;#n=null;#r=null;#o=null;#l=null;#f=0;#h=0;#d=!1;#c=null;#y=()=>{this.#c&&nt(this.#c,this.#f)};#b=Ct(()=>(this.#c=G(this.#f),()=>{this.#c=null}));constructor(t,n,a){this.#t=t,this.#i=n,this.#u=a,this.parent=b.b,this.#e=!!this.#i.pending,this.#a=st(()=>{if(b.b=this,m){const e=this.#m;Ot(),e.nodeType===C&&e.data===z?this.#k():this.#w()}else{var r=this.#g();try{this.#s=g(()=>a(r))}catch(e){this.error(e)}this.#h>0?this.#_():this.#e=!1}return()=>{this.#l?.remove()}},Nt),m&&(this.#t=u)}#w(){try{this.#s=g(()=>this.#u(this.#t))}catch(t){this.error(t)}this.#e=!1}#k(){const t=this.#i.pending;t&&(this.#n=g(()=>t(this.#t)),x.enqueue(()=>{var n=this.#g();this.#s=this.#p(()=>(x.ensure(),g(()=>this.#u(n)))),this.#h>0?this.#_():(A(this.#n,()=>{this.#n=null}),this.#e=!1)}))}#g(){var t=this.#t;return this.#e&&(this.#l=W(),this.#t.before(this.#l),t=this.#l),t}is_pending(){return this.#e||!!this.parent&&this.parent.is_pending()}has_pending_snippet(){return!!this.#i.pending}#p(t){var n=b,a=F,r=J;P(this.#a),y(this.#a),B(this.#a.ctx);try{return t()}catch(e){return it(e),null}finally{P(n),y(a),B(r)}}#_(){const t=this.#i.pending;this.#s!==null&&(this.#o=document.createDocumentFragment(),this.#o.append(this.#l),at(this.#s,this.#o)),this.#n===null&&(this.#n=g(()=>t(this.#t)))}#v(t){if(!this.has_pending_snippet()){this.parent&&this.parent.#v(t);return}this.#h+=t,this.#h===0&&(this.#e=!1,this.#n&&A(this.#n,()=>{this.#n=null}),this.#o&&(this.#t.before(this.#o),this.#o=null))}update_pending_count(t){this.#v(t),this.#f+=t,rt.add(this.#y)}get_effect_pending(){return this.#b(),S(this.#c)}error(t){var n=this.#i.onerror;let a=this.#i.failed;if(this.#d||!n&&!a)throw t;this.#s&&(D(this.#s),this.#s=null),this.#n&&(D(this.#n),this.#n=null),this.#r&&(D(this.#r),this.#r=null),m&&(k(this.#m),St(),k(Pt()));var r=!1,e=!1;const i=()=>{if(r){Rt();return}r=!0,e&&ot(),x.ensure(),this.#f=0,this.#r!==null&&A(this.#r,()=>{this.#r=null}),this.#e=this.has_pending_snippet(),this.#s=this.#p(()=>(this.#d=!1,g(()=>this.#u(this.#t)))),this.#h>0?this.#_():this.#e=!1};var l=F;try{y(null),e=!0,n?.(t,i),e=!1}catch(c){M(c,this.#a&&this.#a.parent)}finally{y(l)}a&&V(()=>{this.#r=this.#p(()=>{x.ensure(),this.#d=!0;try{return g(()=>{a(this.#t,()=>t,()=>i)})}catch(c){return M(c,this.#a.parent),null}finally{this.#d=!1}})})}}const Ft=new Set,q=new Set;let H=null;function R(s){var t=this,n=t.ownerDocument,a=s.type,r=s.composedPath?.()||[],e=r[0]||s.target;H=s;var i=0,l=H===s&&s.__root;if(l){var c=r.indexOf(l);if(c!==-1&&(t===document||t===window)){s.__root=t;return}var f=r.indexOf(t);if(f===-1)return;c<=f&&(i=c)}if(e=r[i]||s.target,e!==t){K(s,"currentTarget",{configurable:!0,get(){return e||n}});var w=F,d=b;y(null),P(null);try{for(var h,o=[];e!==null;){var p=e.assignedSlot||e.parentNode||e.host||null;try{var _=e["__"+a];_!=null&&(!e.disabled||s.target===e)&&_.call(e,s)}catch(E){h?o.push(E):h=E}if(s.cancelBubble||p===t||p===null)break;e=p}if(h){for(let E of o)queueMicrotask(()=>{throw E});throw h}}finally{s.__root=t,delete s.currentTarget,y(w),P(d)}}}function jt(s,t){var n=b;n.nodes_start===null&&(n.nodes_start=s,n.nodes_end=t)}function X(s,t){return Z(s,t)}function It(s,t){j(),t.intro=t.intro??!1;const n=t.target,a=m,r=u;try{for(var e=ut(n);e&&(e.nodeType!==C||e.data!==U);)e=N(e);if(!e)throw O;T(!0),k(e);const i=Z(s,{...t,anchor:e});return T(!1),i}catch(i){if(i instanceof Error&&i.message.split(`
`).some(l=>l.startsWith("https://svelte.dev/e/")))throw i;return i!==O&&console.warn("Failed to hydrate: ",i),t.recover===!1&&ft(),j(),dt(n),T(!1),X(s,t)}finally{T(a),k(r)}}const v=new Map;function Z(s,{target:t,anchor:n,props:a={},events:r,context:e,intro:i=!0}){j();var l=new Set,c=d=>{for(var h=0;h<d.length;h++){var o=d[h];if(!l.has(o)){l.add(o);var p=_t(o);t.addEventListener(o,R,{passive:p});var _=v.get(o);_===void 0?(document.addEventListener(o,R,{passive:p}),v.set(o,1)):v.set(o,_+1)}}};c(Et(Ft)),q.add(c);var f=void 0,w=pt(()=>{var d=n??t.appendChild(W());return At(d,{pending:()=>{}},h=>{if(e){mt({});var o=J;o.c=e}if(r&&(a.$$events=r),m&&jt(h,null),f=s(h,a)||{},m&&(b.nodes_end=u,u===null||u.nodeType!==C||u.data!==Y))throw Q(),O;e&&gt()}),()=>{for(var h of l){t.removeEventListener(h,R);var o=v.get(h);--o===0?(document.removeEventListener(h,R),v.delete(h)):v.set(h,o)}q.delete(c),d!==n&&d.parentNode?.removeChild(d)}});return I.set(f,w),f}let I=new WeakMap;function Lt(s,t){const n=I.get(s);return n?(I.delete(s),n(t)):Promise.resolve()}function Bt(s){return class extends Mt{constructor(t){super({component:s,...t})}}}class Mt{#e;#t;constructor(t){var n=new Map,a=(e,i)=>{var l=wt(i,!1,!1);return n.set(e,l),l};const r=new Proxy({...t.props||{},$$events:{}},{get(e,i){return S(n.get(i)??a(i,Reflect.get(e,i)))},has(e,i){return i===yt?!0:(S(n.get(i)??a(i,Reflect.get(e,i))),Reflect.has(e,i))},set(e,i,l){return vt(n.get(i)??a(i,l),l),Reflect.set(e,i,l)}});this.#t=(t.hydrate?It:X)(t.component,{target:t.target,anchor:t.anchor,props:r,context:t.context,intro:t.intro??!1,recover:t.recover}),(!t?.props?.$$host||t.sync===!1)&&bt(),this.#e=r.$$events;for(const e of Object.keys(this.#t))e==="$set"||e==="$destroy"||e==="$on"||K(this,e,{get(){return this.#t[e]},set(i){this.#t[e]=i},enumerable:!0});this.#t.$set=e=>{Object.assign(r,e)},this.#t.$destroy=()=>{Lt(this.#t)}}$set(t){this.#t.$set(t)}$on(t,n){this.#e[t]=this.#e[t]||[];const a=(...r)=>n.call(this,...r);return this.#e[t].push(a),()=>{this.#e[t]=this.#e[t].filter(r=>r!==a)}}$destroy(){this.#t.$destroy()}}let qt=null;function Qt(s){qt=s}function Xt(s){}function Ht(s){const t=Bt(s),n=(a,{context:r}={})=>{const e=kt(s,{props:a,context:r}),i=Object.defineProperties({},{css:{value:{code:"",map:null}},head:{get:()=>e.head},html:{get:()=>e.body},then:{value:(l,c)=>{{const f=l({css:i.css,head:i.head,html:i.html});return Promise.resolve(f)}}}});return i};return t.render=n,t}function Yt(s,t){s.component(n=>{let{stores:a,page:r,constructors:e,components:i=[],form:l,data_0:c=null,data_1:f=null,data_2:w=null}=t;xt("__svelte__",a),a.page.set(r);const d=e[2];if(e[1]){n.push("<!--[-->");const h=e[0];n.push("<!---->"),h(n,{data:c,form:l,params:r.params,children:o=>{if(e[2]){o.push("<!--[-->");const p=e[1];o.push("<!---->"),p(o,{data:f,form:l,params:r.params,children:_=>{_.push("<!---->"),d(_,{data:w,form:l,params:r.params}),_.push("<!---->")},$$slots:{default:!0}}),o.push("<!---->")}else{o.push("<!--[!-->");const p=e[1];o.push("<!---->"),p(o,{data:f,form:l,params:r.params}),o.push("<!---->")}o.push("<!--]-->")},$$slots:{default:!0}}),n.push("<!---->")}else{n.push("<!--[!-->");const h=e[0];n.push("<!---->"),h(n,{data:c,form:l,params:r.params}),n.push("<!---->")}n.push("<!--]--> "),n.push("<!--[!-->"),n.push("<!--]-->")})}const Ut=Ht(Yt),Zt={app_template_contains_nonce:!1,async:!1,csp:{mode:"auto",directives:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1},reportOnly:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1}},csrf_check_origin:!0,csrf_trusted_origins:[],embedded:!1,env_public_prefix:"PUBLIC_",env_private_prefix:"",hash_routing:!1,hooks:null,preload_strategy:"modulepreload",root:Ut,service_worker:!1,service_worker_options:void 0,templates:{app:({head:s,body:t,assets:n,nonce:a,env:r})=>`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
		<link rel="icon" href="/favicon.ico" sizes="any" />
		<link rel="icon" type="image/png" href="/favicon.png" />
		<link rel="manifest" href="/manifest.json" />
		<meta name="theme-color" content="#faf6f0" />
		<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Outfit:wght@400;600;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
		`+s+`
		<script type="text/javascript">
			function googleTranslateElementInit() {
				new google.translate.TranslateElement(
					{
						pageLanguage: "en",
						includedLanguages: "en,vi",
						autoDisplay: false,
					},
					"google_translate_element",
				);
			}
		<\/script>
		<script
			type="text/javascript"
			src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
		><\/script>
		<style>
			body > .skiptranslate {
				display: none !important;
			}
			body {
				top: 0 !important;
			}
		</style>
	</head>
	<script>
		(function() {
			var t = localStorage.getItem('vma-theme');
			if (t) document.documentElement.setAttribute('data-theme', t);
		})();
	<\/script>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">`+t+`</div>
	</body>
</html>
`,error:({status:s,message:t})=>`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>`+t+`</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">`+s+`</span>
			<div class="message">
				<h1>`+t+`</h1>
			</div>
		</div>
	</body>
</html>
`},version_hash:"3rbils"};async function $t(){let s,t,n,a,r;return{handle:s,handleFetch:t,handleError:n,handleValidationError:a,init:r}=await import("./hooks.server.js"),{handle:s,handleFetch:t,handleError:n,handleValidationError:a,init:r,reroute:void 0,transport:void 0}}export{Kt as a,Qt as b,Xt as c,$t as g,Zt as o,Tt as p,qt as r,Jt as s};
