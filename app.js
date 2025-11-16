/* ===== APP.JS con Firebase Auth + Firestore (realtime por usuario) ===== */
(() => {
  // ---------------- Utilidades base ----------------
  const hasDayjs = typeof window.dayjs === 'function';
  if (hasDayjs && dayjs.locale) try{ dayjs.locale('es'); }catch{}
  const D = {
    todayISO: () => hasDayjs ? dayjs().format('YYYY-MM-DD') : new Date().toISOString().slice(0,10),
    plusDaysISO: (n) => hasDayjs ? dayjs().add(n,'day').format('YYYY-MM-DD') : (()=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)})(),
    dmY: (s) => hasDayjs ? dayjs(s).format('DD/MM/YYYY') : (()=>{const d=new Date(s);return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()})(),
    monthKey: (s) => hasDayjs ? dayjs(s||undefined).format('YYYY-MM') : (()=>{const d=s?new Date(s):new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})(),
    monthLabel: (k) => hasDayjs ? dayjs(k+'-01').format('MMMM YYYY') : (()=>{const [y,m]=k.split('-').map(Number);const N=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];return `${N[(m-1)||0]} ${y}`})()
  };
  const $  = (q,root=document)=>root.querySelector(q);
  const $$ = (q,root=document)=>root.querySelectorAll(q);
  const fmt = (n)=>'$'+Number(n||0).toFixed(2);
  const LS = { get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d}}, set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)), rawGet:(k)=>localStorage.getItem(k), rawSet:(k,v)=>localStorage.setItem(k,v) };
  const norm = (s)=> (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  // ---------------- Claves de storage ----------------
  const KEY_INV='oasis_invoices', KEY_CLI='oasis_clients', KEY_LOGO='oasis_logo', KEY_CFG='oasis_company',
        KEY_PL='oasis_paylinks', KEY_PRD='oasis_products', KEY_TN='oasis_templates';

  // ---------------- Estado local ----------------
  let invoices=LS.get(KEY_INV,[]), clients=LS.get(KEY_CLI,[]), products=LS.get(KEY_PRD,[]);
  let templates=LS.get(KEY_TN,[]);
  let company=LS.get(KEY_CFG,{name:'Oasis Air Cleaner Services',email:'osiservicespr@gmail.com'});
  let logoData=LS.rawGet(KEY_LOGO)||'';
  let payLinks=LS.get(KEY_PL,{links:[],defaultId:null});
  let clientQuery='';

  // ---------------- Firebase ----------------
  const authStateEl = $('#authState');
  const btnSignIn = $('#btnSignIn');
  const btnSignOut = $('#btnSignOut');

  const firebaseConfig = {
    apiKey: "AIzaSyBt9G1cE4iB9fRBeWfw9HjXYGUOsjLGClI",
  authDomain: "nexus-erp-86bf6.firebaseapp.com",
  projectId: "nexus-erp-86bf6",
  storageBucket: "nexus-erp-86bf6.firebasestorage.app",
  messagingSenderId: "61036292897",
  appId: "1:61036292897:web:1a92796e0892fb2c23ac60"
};

  let app, auth, db, user = null;
  let unsubs = []; // para cerrar listeners al salir

  function fbInit(){
    if (!window.firebase) return;
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db   = firebase.firestore();
    db.settings({ignoreUndefinedProperties:true});
    // Auth state
    auth.onAuthStateChanged(u=>{
      user = u || null;
      if(user){
        authStateEl.textContent = `Conectado: ${user.displayName||user.email||user.uid}`;
        btnSignIn.style.display='none';
        btnSignOut.style.display='inline-block';
        startRealtime();   // escuchar colecciones del usuario
        pushLocalPending(); // primer sync (si había datos locales)
      }else{
        authStateEl.textContent = 'Offline';
        btnSignIn.style.display='inline-block';
        btnSignOut.style.display='none';
        stopRealtime();
      }
    });
  }

  // Helpers de rutas
  const rootDoc = () => db.collection('users').doc(user.uid);
  const col     = (name)=> rootDoc().collection(name);

  // --------- Sesión ----------
  btnSignIn?.addEventListener('click', async ()=>{
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    }catch(e){ alert('No se pudo iniciar sesión'); console.error(e); }
  });
  btnSignOut?.addEventListener('click', async ()=>{
    try{ await auth.signOut(); }catch(e){ console.error(e); }
  });

  // --------- Realtime listeners ----------
  function stopRealtime(){ unsubs.forEach(u=>{try{u()}catch{}}); unsubs=[]; }
  function startRealtime(){
    stopRealtime();
    // Empresa (un solo doc)
    unsubs.push(rootDoc().collection('meta').doc('company').onSnapshot(s=>{
      if(!s.exists) return;
      const d=s.data()||{};
      company = {name:d.name||'', email:d.email||''};
      LS.set(KEY_CFG, company);
      logoData = d.logoData || '';
      if(logoData) LS.rawSet(KEY_LOGO, logoData);
      refreshBrand();
    }));

    // Colecciones básicas
    const bindColl = (collName, key, setter)=>{
      const u = col(collName).onSnapshot(q=>{
        const arr=[]; q.forEach(doc=>arr.push(doc.data()));
        setter(arr); LS.set(key, arr);
        // refrescar vistas si procede
        if(key===KEY_CLI) renderClients();
        if(key===KEY_INV){ renderHistory(); renderHistorySummary(); renderWAList(); renderReports(); }
        if(key===KEY_PRD) renderProducts();
        if(key===KEY_TN)  renderTemplates();
        if(key===KEY_PL)  renderPayLinks();
      });
      unsubs.push(u);
    };
    bindColl('clients',  KEY_CLI, v=>clients=v);
    bindColl('invoices', KEY_INV, v=>invoices=v);
    bindColl('products', KEY_PRD, v=>products=v);
    bindColl('templates',KEY_TN,  v=>templates=v);
    // enlaces de pago como un doc único para mantener defaultId + array
    unsubs.push(rootDoc().collection('meta').doc('payLinks').onSnapshot(s=>{
      if(!s.exists) return;
      payLinks = s.data()||{links:[],defaultId:null};
      LS.set(KEY_PL, payLinks);
      renderPayLinks(); renderQuickPay();
    }));
  }

  // Primer push (si hay local sin nube)
  async function pushLocalPending(){
    if(!user) return;
    const batch = db.batch();
    // company
    batch.set(rootDoc().collection('meta').doc('company'), {name:company.name||'', email:company.email||'', logoData:logoData||''}, {merge:true});
    // payLinks
    batch.set(rootDoc().collection('meta').doc('payLinks'), payLinks||{links:[],defaultId:null}, {merge:true});
    // bulk collections: invoices, clients, products, templates
    const upsertMany = (name, arr)=>{
      arr.forEach(o=>{
        const id = o.id || `${name}_${Date.now()}`;
        batch.set(col(name).doc(id), {...o, id}, {merge:true});
      });
    };
    upsertMany('clients',  clients||[]);
    upsertMany('products', products||[]);
    upsertMany('templates',templates||[]);
    upsertMany('invoices', invoices||[]);
    try{ await batch.commit(); }catch(e){ console.error('Primer sync falló', e); }
  }

  // ---------------- UI y navegación (igual que antes) ----------------
  function show(id){
    $$('.view').forEach(v=>{const a=v.id===id;v.classList.toggle('active',a);v.setAttribute('aria-hidden',a?'false':'true')});
    $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.target===id));
  }
  const bind=(sel,fn)=>{const e=$(sel); if(e) e.addEventListener('click',fn,{passive:true});};
  bind('#btnHomeTop',()=>show('view-home'));
  [['#goNewInvoice','view-invoice'],['#goHistory','view-history'],['#goClients','view-clients'],['#goConfig','view-config'],
   ['#goCatalog','view-catalog'],['#goQuickPay','view-quickpay'],['#goReports','view-reports'],['#goTemplates','view-templates'],
   ['#goWhats','view-whats'],['#goBackup','view-backup']]
  .forEach(([btn,view])=>bind(btn,()=>{ if(view==='view-history') renderHistory();
                                        if(view==='view-clients') renderClients();
                                        if(view==='view-config') renderPayLinks();
                                        if(view==='view-catalog') renderProducts();
                                        if(view==='view-quickpay') renderQuickPay();
                                        if(view==='view-reports') renderReports();
                                        if(view==='view-templates') renderTemplates();
                                        if(view==='view-whats') renderWAList();
                                        show(view); }));
  $$('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{
    const t=b.dataset.target;
    if(t==='view-history') renderHistory();
    if(t==='view-clients') renderClients();
    if(t==='view-config')  renderPayLinks();
    show(t);
  },{passive:true}));
  $$('.backHome').forEach(b=>b.addEventListener('click',()=>show('view-home'),{passive:true}));

  // Marca/Config
  function refreshBrand(){
    $('#brandName').textContent=company.name||'Mi Empresa';
    $('#brandEmail').textContent=company.email||'';
    $('#brandLogo').src=logoData||'assets/logo-placeholder.png';
    $('#cfgName').value=company.name; $('#cfgEmail').value=company.email;
  }
  refreshBrand();
  bind('#saveConfig', async ()=>{
    company={name:($('#cfgName').value||'').trim(),email:($('#cfgEmail').value||'').trim()};
    LS.set(KEY_CFG,company); refreshBrand();
    if(user){ await rootDoc().collection('meta').doc('company').set({name:company.name,email:company.email,logoData:logoData||''},{merge:true}); }
    alert('Configuración guardada.');
  });
  bind('#syncNow', ()=>pushLocalPending());

  const cfgLogo=$('#cfgLogo');
  if(cfgLogo){
    cfgLogo.addEventListener('change',(e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      const r=new FileReader();
      r.onload=async()=>{
        logoData=r.result; LS.rawSet(KEY_LOGO,logoData); refreshBrand();
        if(user){ await rootDoc().collection('meta').doc('company').set({logoData},{merge:true}); }
      };
      r.readAsDataURL(f);
    });
  }

  // Enlaces de pago
  function renderPayLinks(){
    payLinks=LS.get(KEY_PL,{links:[],defaultId:null});
    const wrap=$('#payLinksList'); if(!wrap) return; wrap.innerHTML='';
    if(!payLinks.links.length){wrap.innerHTML='<p class="muted">Sin enlaces guardados.</p>'; return;}
    payLinks.links.forEach(pl=>{
      const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${pl.name}</b><small class="muted">${pl.url}</small>${payLinks.defaultId===pl.id?'<small style="color:#0c4a6e">Predeterminado</small>':''}</div>
                     <div style="display:flex;gap:6px"><button class="btn" data-def="${pl.id}" type="button">Predeterminar</button><button class="btn ghost" data-del="${pl.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-def]').addEventListener('click',async ()=>{
        payLinks.defaultId=pl.id; LS.set(KEY_PL,payLinks); renderPayLinks();
        if(user){ await rootDoc().collection('meta').doc('payLinks').set(payLinks,{merge:true}); }
      });
      row.querySelector('[data-del]').addEventListener('click',async ()=>{
        payLinks.links=payLinks.links.filter(x=>x.id!==pl.id);
        if(payLinks.defaultId===pl.id) payLinks.defaultId=null;
        LS.set(KEY_PL,payLinks); renderPayLinks();
        if(user){ await rootDoc().collection('meta').doc('payLinks').set(payLinks,{merge:true}); }
      });
      wrap.appendChild(row);
    });
  }
  bind('#addPayLink',async ()=>{
    const name=$('#plName').value.trim(), url=$('#plUrl').value.trim();
    if(!name||!url){alert('Completa nombre y URL.');return;}
    const id='pl_'+Date.now(); payLinks.links.push({id,name,url}); if(!payLinks.defaultId) payLinks.defaultId=id;
    LS.set(KEY_PL,payLinks); $('#plName').value=''; $('#plUrl').value=''; renderPayLinks();
    if(user){ await rootDoc().collection('meta').doc('payLinks').set(payLinks,{merge:true}); }
  });
  const getDefaultPayLink=()=> payLinks.defaultId ? (payLinks.links.find(x=>x.id===payLinks.defaultId)||null) : null;
  const autoFillDefaultPayLink=()=>{const i=$('#payLink'); if(i && !i.value){const d=getDefaultPayLink(); if(d) i.value=d.url;}};
  const modalPL=$('#modalPL'), modalPLList=$('#modalPLList');
  bind('#btnPickPayLink',()=>{
    payLinks=LS.get(KEY_PL,{links:[],defaultId:null});
    if(!payLinks.links.length){alert('No hay enlaces. Ve a Configuración → Enlaces de pago.');return;}
    modalPLList.innerHTML=''; payLinks.links.forEach(pl=>{
      const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${pl.name}</b><small class="muted">${pl.url}</small></div>
                     <div><button class="btn" data-pick="${pl.id}" type="button">Usar</button></div>`;
      row.querySelector('[data-pick]').addEventListener('click',()=>{$('#payLink').value=pl.url; modalPL.style.display='none';});
      modalPLList.appendChild(row);
    });
    modalPL.style.display='flex';
  });
  $('#modalPLClose')?.addEventListener('click',()=>modalPL.style.display='none');

  // Contact Picker + vCard (igual que antes)
  async function supportsContactPicker(){ try{return 'contacts' in navigator && 'select' in navigator.contacts;}catch{return false;} }
  function normalizeContact(c){
    const name=Array.isArray(c?.name)?c.name[0]:(c?.name||'');
    const email=Array.isArray(c?.email)?c.email[0]:(c?.email||'');
    const tel=Array.isArray(c?.tel)?c.tel[0]:(c?.tel||'');
    const addr=Array.isArray(c?.address)?[c.address[0]?.addressLine?.join(' '),c.address[0]?.city,c.address[0]?.region,c.address[0]?.postalCode,c.address[0]?.country].filter(Boolean).join(', '):'';
    return {name,email,phone:tel,address:addr};
  }
  async function pickContactsAndSave({selectFor='clients'}){
    if(!(await supportsContactPicker())){alert('El Contact Picker no está disponible. Usa vCard en iOS/HTTPS.');return;}
    try{
      const results=await navigator.contacts.select(['name','email','tel','address'],{multiple:false});
      if(!results?.length) return;
      const nc=normalizeContact(results[0]); const client={id:'c_'+Date.now(),...nc};
      clients.push(client); LS.set(KEY_CLI,clients);
      if(user){ await col('clients').doc(client.id).set(client,{merge:true}); }
      renderClients();
      if(selectFor==='invoice'){ const sel=$('#clientSelect'); const opt=document.createElement('option'); opt.value=client.id; opt.textContent=client.name||'Cliente'; sel.appendChild(opt); sel.value=client.id; }
      alert('Cliente importado desde contactos.');
    }catch(e){console.error(e); alert('No se pudo acceder a los contactos.');}
  }
  $('#importFromContacts')?.addEventListener('click',()=>pickContactsAndSave({selectFor:'clients'}));
  $('#pickContactInline')?.addEventListener('click', ()=>pickContactsAndSave({selectFor:'invoice'}));
  function parseVCardText(v){const u=v.replace(/\r?\n[ \t]/g,''); const cards=u.split(/BEGIN:VCARD/i).slice(1).map(c=>'BEGIN:VCARD'+c); const out=[];
    for(const card of cards){const pick=re=>{const m=card.match(re);return m?m[1].trim():''};
      const FN=pick(/(?:^|\n)FN:(.+)/i), EMAIL=pick(/(?:^|\n)EMAIL[^:]*:(.+)/i), TEL=pick(/(?:^|\n)TEL[^:]*:(.+)/i), ADR=pick(/(?:^|\n)ADR[^:]*:(.+)/i);
      let address=''; if(ADR){const p=ADR.split(';'); address=[p[2]||'',p[3]||'',p[4]||'',p[5]||'',p[6]||''].filter(Boolean).join(', ');}
      const c={name:FN||'',email:EMAIL||'',phone:TEL||'',address}; if(c.name||c.email||c.phone) out.push(c);
    } return out;
  }
  $('#importVCF')?.addEventListener('click',()=>$('#vcfInput').click());
  $('#vcfInput')?.addEventListener('change',async(e)=>{const f=e.target.files?.[0]; if(!f) return;
    try{
      const text=await f.text(); const parsed=parseVCardText(text); if(!parsed.length){alert('No se encontró ningún contacto válido.'); e.target.value=''; return;}
      for(const nc of parsed){
        const c={id:'c_'+Date.now()+Math.floor(Math.random()*1000),...nc};
        clients.push(c);
        if(user){ await col('clients').doc(c.id).set(c,{merge:true}); }
      }
      LS.set(KEY_CLI,clients); renderClients();
      const last=clients[clients.length-1]; if(last && $('#clientSelect')) $('#clientSelect').value=last.id;
      alert(`Importados ${parsed.length} contacto(s).`);
    }catch{alert('No se pudo leer el archivo .vcf');} finally{e.target.value='';}
  });

  // Clientes + buscador
  function renderClientSelect(){
    const sel=$('#clientSelect'); if(!sel) return; sel.innerHTML='';
    const o0=document.createElement('option'); o0.value=''; o0.textContent='— Selecciona cliente —'; sel.appendChild(o0);
    clients.forEach(c=>{const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o);});
  }
  function renderClients(){
    renderClientSelect();
    const w=$('#clientsList'); const hint=$('#clientCountHint'); if(!w) return;
    const q=norm(clientQuery);
    const list = q ? clients.filter(c=>[c.name,c.email,c.phone,c.address].map(norm).join(' ').includes(q)) : clients.slice();
    w.innerHTML=''; if(hint) hint.textContent=`${list.length} cliente${list.length===1?'':'s'}${q?' (filtrado)':''}`;
    if(!list.length){w.innerHTML='<p class="muted">Sin clientes para mostrar.</p>'; return;}
    list.slice().reverse().forEach(c=>{const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${c.name}</b><small>${c.email||''} ${c.phone?('· '+c.phone):''}</small><small class="muted">${c.address||''}</small></div>
                     <div><button class="btn ghost" data-del="${c.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-del]').addEventListener('click',async ()=>{
        clients=clients.filter(x=>x.id!==c.id); LS.set(KEY_CLI,clients); renderClients();
        if(user){ await col('clients').doc(c.id).delete().catch(()=>{}); }
      });
      w.appendChild(row);
    });
  }
  $('#clientSearch')?.addEventListener('input',(e)=>{ clearTimeout(window.__cst); window.__cst=setTimeout(()=>{clientQuery=e.target.value||''; renderClients();},120);});
  $('#clientClearSearch')?.addEventListener('click',()=>{const i=$('#clientSearch'); if(i) i.value=''; clientQuery=''; renderClients();});
  $('#saveClient')?.addEventListener('click', async ()=>{
    const c={id:'c_'+Date.now(),name:($('#cName').value||'').trim(),email:($('#cEmail').value||'').trim(),phone:($('#cPhone').value||'').trim(),address:($('#cAddress').value||'').trim()};
    if(!c.name){alert('Nombre es requerido.');return;}
    clients.push(c); LS.set(KEY_CLI,clients); renderClients(); $('#clientForm').reset(); alert('Cliente guardado.');
    if(user){ await col('clients').doc(c.id).set(c,{merge:true}); }
  });
  $('#addClientInline')?.addEventListener('click',()=>{$('#quickClientForm').reset?.(); $('#modalClient').style.display='flex'; setTimeout(()=>$('#qcName')?.focus(),50);});
  $('#qcCancel')?.addEventListener('click',()=>$('#modalClient').style.display='none');
  $('#qcSave')?.addEventListener('click', async ()=>{
    const c={id:'c_'+Date.now(),name:($('#qcName').value||'').trim(),email:($('#qcEmail').value||'').trim(),phone:($('#qcPhone').value||'').trim(),address:($('#qcAddress').value||'').trim()};
    if(!c.name){alert('Nombre es requerido.');return;}
    clients.push(c); LS.set(KEY_CLI,clients); renderClients();
    const sel=$('#clientSelect'); const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); sel.value=c.id; $('#modalClient').style.display='none';
    if(user){ await col('clients').doc(c.id).set(c,{merge:true}); }
  });

  // Factura
  const linesBody=$('#linesBody');
  function addLine(desc='',qty=1,price=0){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input class="desc" placeholder="Descripción" value="${desc}"/></td>
                  <td class="n"><input class="qty" type="number" min="0" step="0.01" value="${qty}"/></td>
                  <td class="n"><input class="price" type="number" min="0" step="0.01" value="${price}"/></td>
                  <td class="n"><span class="ltotal">$0.00</span></td>
                  <td><button class="btn ghost del" type="button">×</button></td>`;
    tr.querySelector('.del').addEventListener('click',()=>{tr.remove(); recalc();});
    tr.addEventListener('input',recalc);
    linesBody.appendChild(tr); recalc();
  }
  function collectLines(){return [...linesBody.querySelectorAll('tr')].map(r=>{const d=r.querySelector('.desc').value.trim();const q=parseFloat(r.querySelector('.qty').value)||0;const p=parseFloat(r.querySelector('.price').value)||0;return {desc:d,qty:q,price:p,total:q*p}}).filter(x=>x.desc||x.qty||x.price);}
  function recalc(){
    const L=collectLines(); const sub=L.reduce((a,b)=>a+b.total,0); const dp=parseFloat($('#discPct').value)||0; const tp=parseFloat($('#taxPct').value)||0;
    const discount=sub*(dp/100); const taxed=(sub-discount)*(tp/100); const total=sub-discount+taxed;
    [...linesBody.querySelectorAll('tr')].forEach((r,i)=>r.querySelector('.ltotal').textContent=fmt(L[i]?.total||0));
    $('#tSubtotal').textContent=fmt(sub); $('#tDiscount').textContent=fmt(discount); $('#tTax').textContent=fmt(taxed); $('#tTotal').textContent=fmt(total);
    return {sub,discount,taxed,total};
  }
  $('#addLine')?.addEventListener('click',()=>addLine());
  $('#invDate').value=D.todayISO(); $('#invDue').value=D.plusDaysISO(7); addLine();
  $('#fromCatalog')?.addEventListener('click',()=>{ if(!products.length){alert('No hay productos en el catálogo.'); return;} show('view-catalog'); });

  function getInvoiceFromForm(){
    const inv={id:'i_'+Date.now(),prefix:($('#invPrefix').value||'FAC-').trim()||'FAC-',number:parseInt($('#invNumber').value)||1,date:$('#invDate').value,due:$('#invDue').value,
      clientId:$('#clientSelect').value||null, clientName:$('#clientSelect').selectedOptions[0]?.textContent||'', notes:($('#invNotes').value||'').trim(), payLink:($('#payLink').value||'').trim(),
      discPct:parseFloat($('#discPct').value)||0, taxPct:parseFloat($('#taxPct').value)||0, lines:collectLines() };
    inv.totals=recalc(); return inv;
  }
  $('#btnSave')?.addEventListener('click', async ()=>{
    const inv=getInvoiceFromForm(); if(!inv.lines.length){alert('Agrega al menos una línea.');return;}
    invoices.push(inv); LS.set(KEY_INV,invoices); $('#invNumber').value=inv.number+1; renderHistory(); renderHistorySummary(); alert('Factura guardada.');
    if(user){ await col('invoices').doc(inv.id).set(inv,{merge:true}); }
  });
  $('#btnClear')?.addEventListener('click',()=>{
    $('#invoiceForm').reset(); linesBody.innerHTML=''; addLine(); $('#invDate').value=D.todayISO(); $('#invDue').value=D.plusDaysISO(7); autoFillDefaultPayLink(); recalc();
  });

  // PDF
  function exportPDF(invOverride=null){
    const inv=invOverride||getInvoiceFromForm(); if(!inv.lines.length){alert('Agrega al menos una línea.');return;}
    if(!window.jspdf||!window.jspdf.jsPDF){alert('jsPDF no cargó.');return;}
    const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'}); const m=40; let y=m;
    if(logoData){try{doc.addImage(logoData,'PNG',m,y,80,80);}catch{}}
    doc.setFont('helvetica','bold').setFontSize(16).text(company.name||'Mi Empresa',m+(logoData?90:0),y+20);
    doc.setFont('helvetica','normal').setFontSize(10).text(company.email||'',m+(logoData?90:0),y+38);
    const code=`${inv.prefix}${String(inv.number).padStart(4,'0')}`;
    doc.setFont('helvetica','bold').setFontSize(20).setTextColor(3,105,161).text('FACTURA',460,y+20,{align:'right'});
    doc.setTextColor(0,0,0).setFontSize(11).setFont('helvetica','normal');
    doc.text(`No: ${code}`,460,y+40,{align:'right'}); doc.text(`Fecha: ${D.dmY(inv.date)}`,460,y+56,{align:'right'}); doc.text(`Vence: ${D.dmY(inv.due)}`,460,y+72,{align:'right'});
    y+=100; doc.setFont('helvetica','bold').setFontSize(12).text('Facturar a',m,y);
    const c=clients.find(x=>x.id===inv.clientId)||{}; y+=16; doc.setFont('helvetica','normal').text(c.name||inv.clientName||'',m,y); y+=14;
    if(c.email){doc.text(c.email,m,y); y+=14;} if(c.phone){doc.text(c.phone,m,y); y+=14;} if(c.address){doc.text(c.address,m,y); y+=16;}
    y+=4; doc.setFillColor(224,247,255).rect(m,y,515,22,'F'); doc.setFont('helvetica','bold').setTextColor(3,105,161);
    doc.text('Descripción',m+8,y+15); doc.text('Cant.',m+330,y+15,{align:'right'}); doc.text('Precio',m+420,y+15,{align:'right'}); doc.text('Total',m+510,y+15,{align:'right'});
    doc.setTextColor(0,0,0); y+=28; doc.setFont('helvetica','normal');
    inv.lines.forEach(l=>{doc.text(l.desc||'-',m+8,y); doc.text(String((l.qty||0).toFixed(2)),m+330,y,{align:'right'}); doc.text('$'+(l.price||0).toFixed(2),m+420,y,{align:'right'}); doc.text('$'+(l.total||0).toFixed(2),m+510,y,{align:'right'}); y+=18;});
    y+=8; const x=m+315; doc.setDrawColor(180).rect(x,y,200,80); doc.setFont('helvetica','normal');
    doc.text('Subtotal',x+10,y+18); doc.text(fmt(inv.totals.sub),x+190,y+18,{align:'right'});
    doc.text(`Descuento (${inv.discPct}%)`,x+10,y+36); doc.text(fmt(inv.totals.discount),x+190,y+36,{align:'right'});
    doc.text(`Impuesto (${inv.taxPct}%)`,x+10,y+54); doc.text(fmt(inv.totals.taxed),x+190,y+54,{align:'right'});
    doc.setFont('helvetica','bold').text('TOTAL',x+10,y+74); doc.text(fmt(inv.totals.total),x+190,y+74,{align:'right'});
    y+=100;
    if(inv.payLink){doc.setFont('helvetica','bold').text('Paga tu factura:',m,y); y+=16; doc.setFont('helvetica','normal').setTextColor(0,102,204); try{doc.textWithLink(inv.payLink,m,y,{url:inv.payLink});}catch{doc.text(inv.payLink,m,y);} doc.setTextColor(0,0,0); y+=14;}
    if(inv.notes){doc.setFont('helvetica','bold').text('Notas:',m,y); y+=14; doc.setFont('helvetica','normal').text(doc.splitTextToSize(inv.notes,515),m,y);}
    doc.save(`${code}.pdf`);
  }
  $('#btnPDF')?.addEventListener('click',()=>exportPDF(null));

  // Historial + resumen mensual
  function buildMonthOptions(){const set=new Set(invoices.map(i=>D.monthKey(i.date))); set.add(D.monthKey()); return [...set].sort().reverse();}
  function calcMonthTotal(k){let t=0; invoices.forEach(i=>{if(D.monthKey(i.date)===k) t+=(i.totals?.total||0)}); return t;}
  function renderHistorySummary(){const sel=$('#histMonth'), tot=$('#histTotal'); if(!sel||!tot) return; const keys=buildMonthOptions(); sel.innerHTML=''; keys.forEach(k=>{const o=document.createElement('option'); o.value=k; o.textContent=D.monthLabel(k); sel.appendChild(o);}); const now=D.monthKey(); sel.value=keys.includes(now)?now:keys[0]; tot.value=fmt(calcMonthTotal(sel.value));}
  document.addEventListener('change',(e)=>{if(e.target?.id==='histMonth'){ $('#histTotal').value=fmt(calcMonthTotal(e.target.value)); }},{passive:true});
  function renderHistory(){
    const w=$('#historyList'); w.innerHTML='';
    if(!invoices.length){w.innerHTML='<p class="muted">Sin facturas guardadas.</p>'; renderHistorySummary(); return;}
    const sorted=[...invoices].sort((a,b)=>new Date(b.date)-new Date(a.date));
    sorted.forEach(inv=>{const code=`${inv.prefix}${String(inv.number).padStart(4,'0')}`; const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${code} · ${inv.clientName||'Cliente'}</b><small>${D.dmY(inv.date)} · Total ${fmt(inv.totals?.total||0)}</small><small class="muted">${inv.payLink?'Pago: '+inv.payLink:'Sin enlace de pago'}</small></div>
                     <div><button class="btn" data-pdf="${inv.id}" type="button">PDF</button><button class="btn ghost" data-del="${inv.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-del]').addEventListener('click',async ()=>{
        invoices=invoices.filter(x=>x.id!==inv.id); LS.set(KEY_INV,invoices); renderHistory(); renderHistorySummary();
        if(user){ await col('invoices').doc(inv.id).delete().catch(()=>{}); }
      });
      row.querySelector('[data-pdf]').addEventListener('click',()=>exportPDF(inv));
      w.appendChild(row);
    });
    renderHistorySummary();
  }

  // Catálogo
  function renderProducts(){
    const w=$('#productList'); w.innerHTML='';
    if(!products.length){w.innerHTML='<p class="muted">Sin productos/servicios.</p>'; return;}
    [...products].reverse().forEach(p=>{const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${p.name}</b><small>Precio ${fmt(p.price)}</small></div>
                     <div style="display:flex;gap:6px"><button class="btn" data-add="${p.id}" type="button">Añadir a factura</button><button class="btn ghost" data-del="${p.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-add]').addEventListener('click',()=>{ show('view-invoice'); addLine(p.name,1,p.price); });
      row.querySelector('[data-del]').addEventListener('click',async ()=>{
        products=products.filter(x=>x.id!==p.id); LS.set(KEY_PRD,products); renderProducts();
        if(user){ await col('products').doc(p.id).delete().catch(()=>{}); }
      });
      w.appendChild(row);
    });
  }
  $('#addProduct')?.addEventListener('click', async ()=>{
    const name=$('#pName').value.trim(); const price=parseFloat($('#pPrice').value)||0; if(!name){alert('Nombre requerido.');return;}
    const p={id:'p_'+Date.now(),name,price}; products.push(p); LS.set(KEY_PRD,products); $('#pName').value=''; $('#pPrice').value=''; renderProducts(); alert('Guardado en catálogo.');
    if(user){ await col('products').doc(p.id).set(p,{merge:true}); }
  });

  // Pagos rápidos
  function renderQuickPay(){
    payLinks=LS.get(KEY_PL,{links:[],defaultId:null});
    const sel=$('#qpLink'); const info=$('#qpInfo'); if(!sel||!info) return; sel.innerHTML='';
    if(!payLinks.links.length){ info.innerHTML='<p class="muted">No hay enlaces guardados. Agrega en Configuración.</p>'; sel.innerHTML='<option value="">(sin enlaces)</option>'; return; }
    payLinks.links.forEach(pl=>{const o=document.createElement('option'); o.value=pl.id; o.textContent=pl.name; sel.appendChild(o);});
    sel.value=payLinks.defaultId || payLinks.links[0].id;
    info.innerHTML='<p class="muted">Selecciona un enlace, escribe el monto (opcional) y abre la página de pago.</p>';
  }
  $('#qpOpen')?.addEventListener('click',()=>{const id=$('#qpLink').value; const pl=payLinks.links.find(x=>x.id===id); if(!pl){alert('Elige un enlace');return;} window.open(pl.url,'_blank');});
  $('#qpCopy')?.addEventListener('click',async()=>{const id=$('#qpLink').value; const pl=payLinks.links.find(x=>x.id===id); if(!pl) return; try{await navigator.clipboard.writeText(pl.url); alert('Enlace copiado.');}catch{alert('No se pudo copiar.');}});

  // Reportes
  function renderReports(){
    const wm=$('#repMonths'); if(!wm) return; wm.innerHTML='';
    const byMonth={}; invoices.forEach(i=>{const k=D.monthKey(i.date); byMonth[k]=(byMonth[k]||0)+(i.totals?.total||0);});
    const keys=Object.keys(byMonth).sort().reverse(); if(!keys.length){wm.innerHTML='<p class="muted">Sin datos.</p>';} else {keys.forEach(k=>{const row=document.createElement('div'); row.className='item'; row.innerHTML=`<div class="meta"><b>${D.monthLabel(k)}</b><small>Total ${fmt(byMonth[k])}</small></div>`; wm.appendChild(row);});}
    const wc=$('#repClients'); if(!wc) return; wc.innerHTML=''; const byClient={}; invoices.forEach(i=>{const name=i.clientName||'Cliente'; byClient[name]=(byClient[name]||0)+(i.totals?.total||0);});
    const arr=Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,10); if(!arr.length){wc.innerHTML='<p class="muted">Sin datos.</p>';} else {arr.forEach(([n,t])=>{const row=document.createElement('div'); row.className='item'; row.innerHTML=`<div class="meta"><b>${n}</b><small>Total ${fmt(t)}</small></div>`; wc.appendChild(row);});}
  }

  // Notas
  function renderTemplates(){
    const w=$('#tnList'); if(!w) return; w.innerHTML=''; if(!templates.length){w.innerHTML='<p class="muted">Sin notas guardadas.</p>'; return;}
    [...templates].reverse().forEach(t=>{const row=document.createElement('div'); row.className='item';
      row.innerHTML=`<div class="meta"><b>${t.title}</b><small class="muted">${(t.body||'').slice(0,80)}${t.body.length>80?'…':''}</small></div>
                     <div style="display:flex;gap:6px"><button class="btn" data-ins="${t.id}" type="button">Insertar</button><button class="btn ghost" data-del="${t.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-ins]').addEventListener('click',()=>{ show('view-invoice'); const ta=$('#invNotes'); ta.value=(ta.value?ta.value+'\n\n':'')+t.body; });
      row.querySelector('[data-del]').addEventListener('click',async ()=>{
        templates=templates.filter(x=>x.id!==t.id); LS.set(KEY_TN,templates); renderTemplates();
        if(user){ await col('templates').doc(t.id).delete().catch(()=>{}); }
      });
      w.appendChild(row);
    });
  }
  $('#tnSave')?.addEventListener('click', async ()=>{
    const title=$('#tnTitle').value.trim(), body=$('#tnBody').value.trim(); if(!title||!body){alert('Título y contenido requeridos.'); return;}
    const t={id:'tn_'+Date.now(), title, body}; templates.push(t); LS.set(KEY_TN,templates); $('#tnTitle').value=''; $('#tnBody').value=''; renderTemplates(); alert('Nota guardada.');
    if(user){ await col('templates').doc(t.id).set(t,{merge:true}); }
  });

  // WhatsApp
  function renderWAList(){
    const sel = $('#waInvoice'); if(!sel) return;
    sel.innerHTML = '<option value="">(Sin selección)</option>';
    invoices.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(inv=>{
      const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
      const o = document.createElement('option'); o.value = inv.id; o.textContent = `${code} · ${inv.clientName||'Cliente'} · ${fmt(inv.totals?.total||0)}`; sel.appendChild(o);
    });
    $('#waAmount').value=''; $('#waLink').value=''; $('#waText').value='';
  }
  function buildWAText(){
    const invId = $('#waInvoice').value;
    let total = $('#waAmount').value ? Number($('#waAmount').value) : null;
    let link  = ($('#waLink').value||'').trim();
    let clientName = '';
    if(invId){
      const inv = invoices.find(i=>i.id===invId);
      if(inv){
        clientName = inv.clientName||'';
        if(total===null) total = inv.totals?.total||0;
        if(!link && inv.payLink) link = inv.payLink;
      }
    }
    const empresa = company?.name || 'Mi Empresa';
    const montoTxt = total!=null ? `Total: ${fmt(total)}\n` : '';
    const linkTxt  = link ? `Paga aquí: ${link}\n` : '';
    const cuerpo = `Hola ${clientName||''},\n${montoTxt}${linkTxt}Gracias por su preferencia.\n${empresa}`;
    $('#waText').value = cuerpo; return cuerpo;
  }
  function openWhatsApp(){
    const phone = ($('#waPhone').value||'').replace(/[^0-9]/g,'');
    const text  = $('#waText').value || buildWAText();
    const url   = `https://wa.me/${phone?phone:''}?text=${encodeURIComponent(text)}`;
    window.open(url,'_blank');
  }
  const copyText=(t)=>{ if(!t) t=$('#waText').value; if(!t) return alert('No hay mensaje.'); navigator.clipboard?.writeText(t).then(()=>alert('Mensaje copiado.')).catch(()=>{prompt('Copia manual:',t)}); };
  $('#waBuild')?.addEventListener('click',()=>buildWAText());
  $('#waOpen')?.addEventListener('click',()=>openWhatsApp());
  $('#waCopy')?.addEventListener('click',()=>copyText());

  // Respaldo
  function snapshotData(){ return {version:1,exportedAt:new Date().toISOString(), company,invoices,clients,products,templates,payLinks, logoData:LS.rawGet(KEY_LOGO)||null}; }
  function downloadJSON(obj, filename='respaldo-factura-movil.json'){
    const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }
  $('#bkExport')?.addEventListener('click',()=>downloadJSON(snapshotData()));
  $('#bkImportBtn')?.addEventListener('click',()=>$('#bkFile').click());
  $('#bkFile')?.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const text = await f.text(); const data = JSON.parse(text);
      company   = data.company   || company;   LS.set(KEY_CFG, company);
      invoices  = data.invoices  || invoices;  LS.set(KEY_INV, invoices);
      clients   = data.clients   || clients;   LS.set(KEY_CLI, clients);
      products  = data.products  || products;  LS.set(KEY_PRD, products);
      templates = data.templates || templates; LS.set(KEY_TN,  templates);
      payLinks  = data.payLinks  || payLinks;  LS.set(KEY_PL,  payLinks);
      if(data.logoData) LS.rawSet(KEY_LOGO, data.logoData);
      refreshBrand(); renderHistory(); renderHistorySummary(); renderClients(); renderPayLinks(); renderProducts(); renderTemplates();
      if(user) await pushLocalPending();
      alert('Datos restaurados correctamente.');
    }catch(err){ console.error(err); alert('No se pudo importar el archivo.'); }
    e.target.value='';
  });

  // Inicial
  (function init(){
    renderClients(); renderHistory(); renderHistorySummary(); renderPayLinks(); renderProducts(); renderQuickPay(); renderReports(); renderTemplates();
    $('#invDate').value=D.todayISO(); $('#invDue').value=D.plusDaysISO(7);
    autoFillDefaultPayLink();
    fbInit(); // <-- arranca Firebase
  })();

  console.log('Factura Móvil — lista con Firebase.');
})();
