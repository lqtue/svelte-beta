import{H as O,C as P,a as Y,g as N,b as U,c as z,e as $,d as S,s as G,r as tt,u as et,i as L,q as V,f as nt,h as y,j as st,k as _,B as x,p as A,l as W,m as C,n as v,o as q,t as rt,v as F,w as J,x as it,y as at,z as D,A as B,D as ot,E as lt,F as ct,G as ht,I as j,J as ft,K as ut,L as dt,M as pt,N as _t,O as gt,P as mt,Q as vt,R as yt,S as bt,T as wt,U as kt}from"./index2.js";import{d as K,a as Et,s as xt}from"./context.js";import"clsx";import"./environment.js";let Tt={};function Jt(s){}function Kt(s){Tt=s}function Q(s){console.warn("https://svelte.dev/e/hydration_mismatch")}function Rt(){console.warn("https://svelte.dev/e/svelte_boundary_reset_noop")}let p=!1;function T(s){p=s}let u;function k(s){if(s===null)throw Q(),O;return u=s}function Ot(){return k(N(u))}function St(s=1){if(p){for(var t=s,e=u;t--;)e=N(e);u=e}}function Ct(s=!0){for(var t=0,e=u;;){if(e.nodeType===P){var i=e.data;if(i===Y){if(t===0)return e;t-=1}else(i===U||i===z)&&(t+=1)}var a=N(e);s&&e.remove(),e=a}}function Pt(s){let t=0,e=G(0),i;return()=>{$()&&(S(e),tt(()=>(t===0&&(i=et(()=>s(()=>L(e)))),t+=1,()=>{V(()=>{t-=1,t===0&&(i?.(),i=void 0,L(e))})})))}}var Nt=lt|ct|ht;function At(s,t,e){new Dt(s,t,e)}class Dt{parent;#e=!1;#t;#g=p?u:null;#r;#f;#i;#s=null;#n=null;#a=null;#o=null;#l=null;#u=0;#c=0;#d=!1;#h=null;#y=()=>{this.#h&&nt(this.#h,this.#u)};#b=Pt(()=>(this.#h=G(this.#u),()=>{this.#h=null}));constructor(t,e,i){this.#t=t,this.#r=e,this.#f=i,this.parent=y.b,this.#e=!!this.#r.pending,this.#i=st(()=>{if(y.b=this,p){const n=this.#g;Ot(),n.nodeType===P&&n.data===z?this.#k():this.#w()}else{var a=this.#m();try{this.#s=_(()=>i(a))}catch(n){this.error(n)}this.#c>0?this.#_():this.#e=!1}return()=>{this.#l?.remove()}},Nt),p&&(this.#t=u)}#w(){try{this.#s=_(()=>this.#f(this.#t))}catch(t){this.error(t)}this.#e=!1}#k(){const t=this.#r.pending;t&&(this.#n=_(()=>t(this.#t)),x.enqueue(()=>{var e=this.#m();this.#s=this.#p(()=>(x.ensure(),_(()=>this.#f(e)))),this.#c>0?this.#_():(A(this.#n,()=>{this.#n=null}),this.#e=!1)}))}#m(){var t=this.#t;return this.#e&&(this.#l=W(),this.#t.before(this.#l),t=this.#l),t}is_pending(){return this.#e||!!this.parent&&this.parent.is_pending()}has_pending_snippet(){return!!this.#r.pending}#p(t){var e=y,i=F,a=J;C(this.#i),v(this.#i),q(this.#i.ctx);try{return t()}catch(n){return rt(n),null}finally{C(e),v(i),q(a)}}#_(){const t=this.#r.pending;this.#s!==null&&(this.#o=document.createDocumentFragment(),this.#o.append(this.#l),it(this.#s,this.#o)),this.#n===null&&(this.#n=_(()=>t(this.#t)))}#v(t){if(!this.has_pending_snippet()){this.parent&&this.parent.#v(t);return}this.#c+=t,this.#c===0&&(this.#e=!1,this.#n&&A(this.#n,()=>{this.#n=null}),this.#o&&(this.#t.before(this.#o),this.#o=null))}update_pending_count(t){this.#v(t),this.#u+=t,at.add(this.#y)}get_effect_pending(){return this.#b(),S(this.#h)}error(t){var e=this.#r.onerror;let i=this.#r.failed;if(this.#d||!e&&!i)throw t;this.#s&&(D(this.#s),this.#s=null),this.#n&&(D(this.#n),this.#n=null),this.#a&&(D(this.#a),this.#a=null),p&&(k(this.#g),St(),k(Ct()));var a=!1,n=!1;const r=()=>{if(a){Rt();return}a=!0,n&&ot(),x.ensure(),this.#u=0,this.#a!==null&&A(this.#a,()=>{this.#a=null}),this.#e=this.has_pending_snippet(),this.#s=this.#p(()=>(this.#d=!1,_(()=>this.#f(this.#t)))),this.#c>0?this.#_():this.#e=!1};var o=F;try{v(null),n=!0,e?.(t,r),n=!1}catch(h){B(h,this.#i&&this.#i.parent)}finally{v(o)}i&&V(()=>{this.#a=this.#p(()=>{x.ensure(),this.#d=!0;try{return _(()=>{i(this.#t,()=>t,()=>r)})}catch(h){return B(h,this.#i.parent),null}finally{this.#d=!1}})})}}const Ft=new Set,M=new Set;let H=null;function R(s){var t=this,e=t.ownerDocument,i=s.type,a=s.composedPath?.()||[],n=a[0]||s.target;H=s;var r=0,o=H===s&&s.__root;if(o){var h=a.indexOf(o);if(h!==-1&&(t===document||t===window)){s.__root=t;return}var d=a.indexOf(t);if(d===-1)return;h<=d&&(r=h)}if(n=a[r]||s.target,n!==t){K(s,"currentTarget",{configurable:!0,get(){return n||e}});var b=F,f=y;v(null),C(null);try{for(var l,c=[];n!==null;){var g=n.assignedSlot||n.parentNode||n.host||null;try{var w=n["__"+i];w!=null&&(!n.disabled||s.target===n)&&w.call(n,s)}catch(E){l?c.push(E):l=E}if(s.cancelBubble||g===t||g===null)break;n=g}if(l){for(let E of c)queueMicrotask(()=>{throw E});throw l}}finally{s.__root=t,delete s.currentTarget,v(b),C(f)}}}function jt(s,t){var e=y;e.nodes_start===null&&(e.nodes_start=s,e.nodes_end=t)}function X(s,t){return Z(s,t)}function It(s,t){j(),t.intro=t.intro??!1;const e=t.target,i=p,a=u;try{for(var n=ft(e);n&&(n.nodeType!==P||n.data!==U);)n=N(n);if(!n)throw O;T(!0),k(n);const r=Z(s,{...t,anchor:n});return T(!1),r}catch(r){if(r instanceof Error&&r.message.split(`
`).some(o=>o.startsWith("https://svelte.dev/e/")))throw r;return r!==O&&console.warn("Failed to hydrate: ",r),t.recover===!1&&ut(),j(),dt(e),T(!1),X(s,t)}finally{T(i),k(a)}}const m=new Map;function Z(s,{target:t,anchor:e,props:i={},events:a,context:n,intro:r=!0}){j();var o=new Set,h=f=>{for(var l=0;l<f.length;l++){var c=f[l];if(!o.has(c)){o.add(c);var g=_t(c);t.addEventListener(c,R,{passive:g});var w=m.get(c);w===void 0?(document.addEventListener(c,R,{passive:g}),m.set(c,1)):m.set(c,w+1)}}};h(Et(Ft)),M.add(h);var d=void 0,b=pt(()=>{var f=e??t.appendChild(W());return At(f,{pending:()=>{}},l=>{if(n){gt({});var c=J;c.c=n}if(a&&(i.$$events=a),p&&jt(l,null),d=s(l,i)||{},p&&(y.nodes_end=u,u===null||u.nodeType!==P||u.data!==Y))throw Q(),O;n&&mt()}),()=>{for(var l of o){t.removeEventListener(l,R);var c=m.get(l);--c===0?(document.removeEventListener(l,R),m.delete(l)):m.set(l,c)}M.delete(h),f!==e&&f.parentNode?.removeChild(f)}});return I.set(d,b),d}let I=new WeakMap;function Lt(s,t){const e=I.get(s);return e?(I.delete(s),e(t)):Promise.resolve()}function qt(s){return class extends Bt{constructor(t){super({component:s,...t})}}}class Bt{#e;#t;constructor(t){var e=new Map,i=(n,r)=>{var o=wt(r,!1,!1);return e.set(n,o),o};const a=new Proxy({...t.props||{},$$events:{}},{get(n,r){return S(e.get(r)??i(r,Reflect.get(n,r)))},has(n,r){return r===yt?!0:(S(e.get(r)??i(r,Reflect.get(n,r))),Reflect.has(n,r))},set(n,r,o){return vt(e.get(r)??i(r,o),o),Reflect.set(n,r,o)}});this.#t=(t.hydrate?It:X)(t.component,{target:t.target,anchor:t.anchor,props:a,context:t.context,intro:t.intro??!1,recover:t.recover}),(!t?.props?.$$host||t.sync===!1)&&bt(),this.#e=a.$$events;for(const n of Object.keys(this.#t))n==="$set"||n==="$destroy"||n==="$on"||K(this,n,{get(){return this.#t[n]},set(r){this.#t[n]=r},enumerable:!0});this.#t.$set=n=>{Object.assign(a,n)},this.#t.$destroy=()=>{Lt(this.#t)}}$set(t){this.#t.$set(t)}$on(t,e){this.#e[t]=this.#e[t]||[];const i=(...a)=>e.call(this,...a);return this.#e[t].push(i),()=>{this.#e[t]=this.#e[t].filter(a=>a!==i)}}$destroy(){this.#t.$destroy()}}let Mt=null;function Qt(s){Mt=s}function Xt(s){}function Ht(s){const t=qt(s),e=(i,{context:a}={})=>{const n=kt(s,{props:i,context:a}),r=Object.defineProperties({},{css:{value:{code:"",map:null}},head:{get:()=>n.head},html:{get:()=>n.body},then:{value:(o,h)=>{{const d=o({css:r.css,head:r.head,html:r.html});return Promise.resolve(d)}}}});return r};return t.render=e,t}function Yt(s,t){s.component(e=>{let{stores:i,page:a,constructors:n,components:r=[],form:o,data_0:h=null,data_1:d=null}=t;xt("__svelte__",i),i.page.set(a);const b=n[1];if(n[1]){e.push("<!--[-->");const f=n[0];e.push("<!---->"),f(e,{data:h,form:o,params:a.params,children:l=>{l.push("<!---->"),b(l,{data:d,form:o,params:a.params}),l.push("<!---->")},$$slots:{default:!0}}),e.push("<!---->")}else{e.push("<!--[!-->");const f=n[0];e.push("<!---->"),f(e,{data:h,form:o,params:a.params}),e.push("<!---->")}e.push("<!--]--> "),e.push("<!--[!-->"),e.push("<!--]-->")})}const Ut=Ht(Yt),Zt={app_template_contains_nonce:!1,async:!1,csp:{mode:"auto",directives:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1},reportOnly:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1}},csrf_check_origin:!0,csrf_trusted_origins:[],embedded:!1,env_public_prefix:"PUBLIC_",env_private_prefix:"",hash_routing:!1,hooks:null,preload_strategy:"modulepreload",root:Ut,service_worker:!1,service_worker_options:void 0,templates:{app:({head:s,body:t,assets:e,nonce:i,env:a})=>`<!doctype html>
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
`},version_hash:"1tbqq2h"};async function $t(){let s,t,e,i,a;return{handle:s,handleFetch:t,handleError:e,handleValidationError:i,init:a}=await import("./hooks.server.js"),{handle:s,handleFetch:t,handleError:e,handleValidationError:i,init:a,reroute:void 0,transport:void 0}}export{Kt as a,Qt as b,Xt as c,$t as g,Zt as o,Tt as p,Mt as r,Jt as s};
