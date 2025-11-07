/* ===== APP.JS – versión robusta ===== */
(() => {
  // --- Fallbacks de fecha si dayjs no está disponible ---
  const hasDayjs = typeof window.dayjs === 'function';
  const D = {
    todayISO: () => {
      if (hasDayjs) return dayjs().format('YYYY-MM-DD');
      const d = new Date(); return d.toISOString().slice(0,10);
    },
    plusDaysISO: (days) => {
      if (hasDayjs) return dayjs().add(days,'day').format('YYYY-MM-DD');
      const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10);
    },
    ymd: (dateStr) => {
      if (hasDayjs) return dayjs(dateStr || undefined).format('YYYY-MM-DD');
      return (dateStr ? new Date(dateStr) : new Date()).toISOString().slice(0,10);
    },
    dmY: (dateStr) => {
      if (hasDayjs) return dayjs(dateStr).format('DD/MM/YYYY');
      const d = dateStr ? new Date(dateStr) : new Date();
      return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
    },
    monthKey: (dateStr) => {
      if (hasDayjs) return dayjs(dateStr || undefined).format('YYYY-MM');
      const d = dateStr ? new Date(dateStr) : new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    },
    monthLabel: (key) => {
      if (hasDayjs) return dayjs(key + '-01').locale('es').format('MMMM YYYY');
      const [y,m] = key.split('-').map(Number);
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return `${meses[(m-1)||0]} ${y}`;
    }
  };
  if (hasDayjs && dayjs.locale) { try { dayjs.locale('es'); } catch{} }

  // --- Helpers DOM / formato ---
  const $  = (q,root=document) => root.querySelector(q);
  const $$ = (q,root=document) => root.querySelectorAll(q);
  const fmt = (n) => '$' + Number(n || 0).toFixed(2);

  // --- Storage seguro ---
  const LS = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    rawGet: (k) => localStorage.getItem(k),
    rawSet: (k, v) => localStorage.setItem(k, v),
  };
  const KEY_INV='oasis_invoices', KEY_CLI='oasis_clients', KEY_LOGO='oasis_logo', KEY_CFG='oasis_company', KEY_PL='oasis_paylinks';

  // --- Estado ---
  let invoices = LS.get(KEY_INV, []);
  let clients  = LS.get(KEY_CLI, []);
  let company  = LS.get(KEY_CFG, {name:'Mi Empresa', email:'correo@empresa.com'});
  let logoData = LS.rawGet(KEY_LOGO) || '';
  let payLinks = LS.get(KEY_PL, {links:[], defaultId:null}); // {links:[{id,name,url}], defaultId}

  // --- Navegación robusta (sin delegación) ---
  function show(id){
    $$('.view').forEach(v => {
      const active = v.id === id;
      v.classList.toggle('active', active);
      v.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.target === id));
  }
  function safeBindClick(sel, fn){
    const el = $(sel); if (el) el.addEventListener('click', fn, {passive:true});
  }

  // --- Marca / Config ---
  function refreshBrand(){
    $('#brandName') && ($('#brandName').textContent  = company.name || 'Mi Empresa');
    $('#brandEmail') && ($('#brandEmail').textContent = company.email || 'correo@empresa.com');
    const img = $('#brandLogo'); if (img) img.src = logoData ? logoData : 'assets/logo-placeholder.png';
  }
  function renderPayLinks(){
    payLinks = LS.get(KEY_PL, {links:[], defaultId:null});
    const wrap = $('#payLinksList'); if (!wrap) return;
    wrap.innerHTML = '';
    if (!payLinks.links.length){
      wrap.innerHTML = '<p class="muted">Sin enlaces guardados.</p>'; return;
    }
    payLinks.links.forEach(pl => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <b>${pl.name}</b>
          <small class="muted">${pl.url}</small>
          ${payLinks.defaultId === pl.id ? '<small style="color:#0c4a6e">Predeterminado</small>' : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" data-def="${pl.id}" type="button">Predeterminar</button>
          <button class="btn ghost" data-del="${pl.id}" type="button">Eliminar</button>
        </div>`;
      row.querySelector('[data-def]').addEventListener('click', () => {
        payLinks.defaultId = pl.id; LS.set(KEY_PL, payLinks); renderPayLinks();
      });
      row.querySelector('[data-del]').addEventListener('click', () => {
        payLinks.links = payLinks.links.filter(x => x.id !== pl.id);
        if (payLinks.defaultId === pl.id) payLinks.defaultId = null;
        LS.set(KEY_PL, payLinks); renderPayLinks();
      });
      wrap.appendChild(row);
    });
  }
  function getDefaultPayLink(){
    if (!payLinks.defaultId) return null;
    return payLinks.links.find(x => x.id === payLinks.defaultId) || null;
  }
  function autoFillDefaultPayLink(){
    const input = $('#payLink');
    if (input && !input.value){
      const d = getDefaultPayLink();
      if (d) input.value = d.url;
    }
  }

  // --- Clientes ---
  function renderClientSelect(){
    const sel = $('#clientSelect'); if (!sel) return;
    sel.innerHTML = '';
    const o0 = document.createElement('option'); o0.value=''; o0.textContent='— Selecciona cliente —';
    sel.appendChild(o0);
    clients.forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  }
  function renderClients(){
    renderClientSelect();
    const wrap = $('#clientsList'); if (!wrap) return;
    wrap.innerHTML = '';
    if (!clients.length){ wrap.innerHTML = '<p class="muted">Sin clientes guardados.</p>'; return; }
    [...clients].reverse().forEach(c => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <b>${c.name}</b>
          <small>${c.email||''} ${c.phone? '· '+c.phone : ''}</small>
          <small class="muted">${c.address||''}</small>
        </div>
        <div><button class="btn ghost" data-del="${c.id}" type="button">Eliminar</button></div>`;
      row.querySelector('[data-del]').addEventListener('click', () => {
        clients = clients.filter(x => x.id !== c.id);
        LS.set(KEY_CLI, clients);
        renderClients();
      });
      wrap.appendChild(row);
    });
  }

  // --- vCard (.vcf) ---
  function parseVCardText(vcfText) {
    const unfolded = vcfText.replace(/\r?\n[ \t]/g, '');
    const cards = unfolded.split(/BEGIN:VCARD/i).slice(1).map(c => 'BEGIN:VCARD' + c);
    const results = [];
    for (const card of cards) {
      const pick = (re) => { const m = card.match(re); return m ? m[1].trim() : ''; };
      const FN    = pick(/(?:^|\n)FN:(.+)/i);
      const EMAIL = pick(/(?:^|\n)EMAIL[^:]*:(.+)/i);
      const TEL   = pick(/(?:^|\n)TEL[^:]*:(.+)/i);
      const ADR   = pick(/(?:^|\n)ADR[^:]*:(.+)/i);
      let address = '';
      if (ADR) {
        const p = ADR.split(';');
        const street = [p[2]].filter(Boolean).join(' ');
        const city   = p[3] || ''; const region = p[4] || '';
        const zip    = p[5] || ''; const country= p[6] || '';
        address = [street, city, region, zip, country].filter(Boolean).join(', ');
      }
      const contact = { name: FN || '', email: EMAIL || '', phone: TEL || '', address };
      if (contact.name || contact.email || contact.phone) results.push(contact);
    }
    return results;
  }

  // --- Historial + resumen mensual ---
  function buildMonthOptions() {
    const set = new Set(invoices.map(inv => D.monthKey(inv.date)));
    set.add(D.monthKey()); // mes actual
    return [...set].sort().reverse();
  }
  function calcMonthTotal(key) {
    let total = 0;
    invoices.forEach(inv => {
      if (D.monthKey(inv.date) === key) total += (inv.totals?.total || 0);
    });
    return total;
  }
  function renderHistorySummary() {
    const sel = $('#histMonth');
    const tot = $('#histTotal');
    if (!sel || !tot) return;

    const keys = buildMonthOptions();
    // repinta siempre (simple y seguro)
    sel.innerHTML = '';
    keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = D.monthLabel(k);
      sel.appendChild(opt);
    });
    const nowK = D.monthKey();
    sel.value = keys.includes(nowK) ? nowK : keys[0];
    tot.value = fmt(calcMonthTotal(sel.value));
  }
  function renderHistory(){
    const wrap = $('#historyList'); if (!wrap) return;
    wrap.innerHTML = '';

    if (!invoices.length){
      wrap.innerHTML = '<p class="muted">Sin facturas guardadas.</p>';
      renderHistorySummary();
      return;
    }
    const sorted = [...invoices].sort((a,b)=> new Date(b.date) - new Date(a.date));
    sorted.forEach(inv => {
      const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <b>${code} · ${inv.clientName || 'Cliente'}</b>
          <small>${D.dmY(inv.date)} · Total ${fmt(inv.totals?.total || 0)}</small>
          <small class="muted">${inv.payLink ? 'Pago: ' + inv.payLink : 'Sin enlace de pago'}</small>
        </div>
        <div>
          <button class="btn" data-pdf="${inv.id}" type="button">PDF</button>
          <button class="btn ghost" data-del="${inv.id}" type="button">Eliminar</button>
        </div>`;
      row.querySelector('[data-del]').addEventListener('click', () => {
        invoices = invoices.filter(x => x.id !== inv.id);
        LS.set(KEY_INV, invoices);
        renderHistory();
        renderHistorySummary();
      });
      row.querySelector('[data-pdf]').addEventListener('click', () => exportPDF(inv));
      wrap.appendChild(row);
    });
    renderHistorySummary();
  }

  // --- Factura / líneas ---
  const linesBody = $('#linesBody');
  function addLine(desc='', qty=1, price=0){
    if (!linesBody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="desc" placeholder="Descripción" value="${desc}"/></td>
      <td class="n"><input class="qty" type="number" min="0" step="0.01" value="${qty}"/></td>
      <td class="n"><input class="price" type="number" min="0" step="0.01" value="${price}"/></td>
      <td class="n"><span class="ltotal">$0.00</span></td>
      <td><button class="btn ghost del" type="button">×</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => { tr.remove(); recalc(); });
    tr.addEventListener('input', recalc);
    linesBody.appendChild(tr);
    recalc();
  }
  function collectLines(){
    if (!linesBody) return [];
    return [...linesBody.querySelectorAll('tr')].map(r => {
      const desc  = r.querySelector('.desc').value.trim();
      const qty   = parseFloat(r.querySelector('.qty').value)   || 0;
      const price = parseFloat(r.querySelector('.price').value) || 0;
      const total = qty * price;
      return { desc, qty, price, total };
    }).filter(x => x.desc || x.qty || x.price);
  }
  function recalc(){
    const lines = collectLines();
    let sub = lines.reduce((a,b)=>a+b.total,0);
    const discPct = parseFloat($('#discPct')?.value||0)||0;
    const taxPct  = parseFloat($('#taxPct')?.value||0)||0;
    const discount = sub*(discPct/100);
    const taxed    = (sub - discount)*(taxPct/100);
    const total    = sub - discount + taxed;

    if (linesBody){
      [...linesBody.querySelectorAll('tr')].forEach((r,i) => {
        r.querySelector('.ltotal').textContent = fmt(lines[i]?.total || 0);
      });
    }
    $('#tSubtotal') && ($('#tSubtotal').textContent = fmt(sub));
    $('#tDiscount') && ($('#tDiscount').textContent = fmt(discount));
    $('#tTax')      && ($('#tTax').textContent      = fmt(taxed));
    $('#tTotal')    && ($('#tTotal').textContent    = fmt(total));
    return { sub, discount, taxed, total };
  }
  function getInvoiceFromForm(){
    const inv = {
      id:'i_'+Date.now(),
      prefix: ($('#invPrefix')?.value||'FAC-').trim() || 'FAC-',
      number: parseInt($('#invNumber')?.value||'1') || 1,
      date: $('#invDate')?.value || D.todayISO(),
      due:  $('#invDue')?.value  || D.plusDaysISO(7),
      clientId: $('#clientSelect')?.value || null,
      clientName: $('#clientSelect')?.selectedOptions?.[0]?.textContent || '',
      notes: ($('#invNotes')?.value||'').trim(),
      payLink: ($('#payLink')?.value||'').trim(),
      discPct: parseFloat($('#discPct')?.value||0) || 0,
      taxPct:  parseFloat($('#taxPct')?.value||0)  || 0,
      lines: collectLines(),
    };
    inv.totals = recalc();
    return inv;
  }

  // --- PDF (jsPDF) ---
  function exportPDF(invOverride=null){
    const inv = invOverride || getInvoiceFromForm();
    if (!inv.lines.length){ alert('Agrega al menos una línea.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF){ alert('jsPDF no cargó. Revisa la conexión.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 40; let y = margin;

    if (logoData){ try{ doc.addImage(logoData, 'PNG', margin, y, 80, 80); }catch{} }
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text(company.name || 'Mi Empresa', margin + (logoData? 90:0), y+20);
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text(company.email || '', margin + (logoData? 90:0), y+38);

    const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
    doc.setFont('helvetica','bold'); doc.setFontSize(20);
    doc.setTextColor(3,105,161);
    doc.text('FACTURA', 460, y+20, {align:'right'});
    doc.setTextColor(0,0,0); doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.text(`No: ${code}`, 460, y+40, {align:'right'});
    doc.text(`Fecha: ${D.dmY(inv.date)}`, 460, y+56, {align:'right'});
    doc.text(`Vence: ${D.dmY(inv.due)}`, 460, y+72, {align:'right'});

    y += 100;

    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Facturar a', margin, y);
    doc.setFont('helvetica','normal');
    const c = clients.find(x => x.id === inv.clientId) || {};
    const cName=c.name || inv.clientName || '', cEmail=c.email||'', cPhone=c.phone||'', cAddr=c.address||'';
    y+=16; doc.text(cName, margin, y); y+=14;
    if(cEmail){ doc.text(cEmail, margin, y); y+=14; }
    if(cPhone){ doc.text(cPhone, margin, y); y+=14; }
    if(cAddr){  doc.text(cAddr,  margin, y); y+=16; }

    // Encabezado tabla celeste
    y += 4;
    doc.setFillColor(224,247,255);
    doc.rect(margin, y, 515, 22, 'F');
    doc.setFont('helvetica','bold'); doc.setTextColor(3,105,161);
    doc.text('Descripción', margin+8, y+15);
    doc.text('Cant.',  margin+330, y+15, {align:'right'});
    doc.text('Precio', margin+420, y+15, {align:'right'});
    doc.text('Total',  margin+510, y+15, {align:'right'});
    doc.setTextColor(0,0,0); y += 28;

    // Líneas
    doc.setFont('helvetica','normal');
    inv.lines.forEach(line => {
      doc.text(line.desc || '-', margin+8, y);
      doc.text(String((line.qty||0).toFixed(2)), margin+330, y, {align:'right'});
      doc.text('$'+(line.price||0).toFixed(2),   margin+420, y, {align:'right'});
      doc.text('$'+(line.total||0).toFixed(2),   margin+510, y, {align:'right'});
      y += 18;
    });

    // Totales
    y += 8; const xBox = margin+315;
    doc.setDrawColor(180); doc.rect(xBox, y, 200, 80);
    doc.setFont('helvetica','normal');
    doc.text('Subtotal', xBox+10, y+18); doc.text(fmt(inv.totals.sub), xBox+190, y+18, {align:'right'});
    doc.text(`Descuento (${inv.discPct}%)`, xBox+10, y+36); doc.text(fmt(inv.totals.discount), xBox+190, y+36, {align:'right'});
    doc.text(`Impuesto (${inv.taxPct}%)`,   xBox+10, y+54); doc.text(fmt(inv.totals.taxed),    xBox+190, y+54, {align:'right'});
    doc.setFont('helvetica','bold');
    doc.text('TOTAL', xBox+10, y+74); doc.text(fmt(inv.totals.total), xBox+190, y+74, {align:'right'});

    y += 100;
    if (inv.payLink){
      doc.setFont('helvetica','bold'); doc.text('Paga tu factura:', margin, y);
      doc.setFont('helvetica','normal'); y += 16;
      doc.setTextColor(0,102,204);
      try { doc.textWithLink(inv.payLink, margin, y, { url: inv.payLink }); } catch { doc.text(inv.payLink, margin, y); }
      doc.setTextColor(0,0,0); y += 14;
    }
    if (inv.notes){
      doc.setFont('helvetica','bold'); doc.text('Notas:', margin, y);
      doc.setFont('helvetica','normal'); y += 14;
      doc.text(doc.splitTextToSize(inv.notes, 515), margin, y);
    }
    doc.save(`${code}.pdf`);
  }

  // --- Contact Picker (opcional) + fallback vCard ---
  async function supportsContactPicker(){
    try { return 'contacts' in navigator && 'select' in navigator.contacts; } catch { return false; }
  }
  function normalizeContact(c){
    const name  = Array.isArray(c?.name)  ? c.name[0]  : (c?.name || '');
    const email = Array.isArray(c?.email) ? c.email[0] : (c?.email || '');
    const tel   = Array.isArray(c?.tel)   ? c.tel[0]   : (c?.tel || '');
    const addr  = Array.isArray(c?.address) ? [
      c.address[0]?.addressLine?.join(' '),
      c.address[0]?.city, c.address[0]?.region, c.address[0]?.postalCode,
      c.address[0]?.country
    ].filter(Boolean).join(', ') : '';
    return { name: name || '', email: email || '', phone: tel || '', address: addr || '' };
  }
  async function pickContactsAndSave({selectFor='clients'}){
    if (!(await supportsContactPicker())) {
      alert('El Contact Picker no está disponible en este navegador.');
      return;
    }
    try{
      const results = await navigator.contacts.select(['name','email','tel','address','icon'], { multiple:false });
      if (!results || !results.length) return;
      const nc = normalizeContact(results[0]);
      const client = { id:'c_'+Date.now(), ...nc };
      clients.push(client); LS.set(KEY_CLI, clients);
      renderClients();
      if (selectFor === 'invoice') {
        const sel = $('#clientSelect');
        if (sel){
          const opt = document.createElement('option');
          opt.value = client.id; opt.textContent = client.name || 'Cliente';
          sel.appendChild(opt); sel.value = client.id;
        }
      }
      alert('Cliente importado desde contactos.');
    }catch(err){
      console.error(err); alert('No se pudo acceder a los contactos.');
    }
  }

  // --- Binds explícitos (evitan fallos de delegación) ---
  // Top bar & home cards
  safeBindClick('#btnHomeTop', () => show('view-home'));
  safeBindClick('#goNewInvoice', () => { autoFillDefaultPayLink(); show('view-invoice'); });
  safeBindClick('#goHistory',    () => { renderHistory(); show('view-history'); });
  safeBindClick('#goClients',    () => { renderClients(); show('view-clients'); });
  safeBindClick('#goConfig',     () => { renderPayLinks(); show('view-config'); });
  // Bottom nav
  $$('.bottom-nav button').forEach(btn => {
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const t = btn.dataset.target;
      if (t === 'view-history') renderHistory();
      if (t === 'view-clients') renderClients();
      if (t === 'view-config')  renderPayLinks();
      show(t);
    }, {passive:true});
  });
  // Back buttons
  $$('.backHome').forEach(b => b.addEventListener('click', () => show('view-home'), {passive:true}));

  // Config
  refreshBrand();
  safeBindClick('#saveConfig', () => {
    company = { name: $('#cfgName')?.value.trim() || '', email: $('#cfgEmail')?.value.trim() || '' };
    LS.set(KEY_CFG, company); refreshBrand(); alert('Configuración guardada.');
  });
  const cfgLogo = $('#cfgLogo');
  if (cfgLogo){
    cfgLogo.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { logoData = r.result; LS.rawSet(KEY_LOGO, logoData); refreshBrand(); };
      r.readAsDataURL(f);
    });
  }

  // Enlaces de pago
  safeBindClick('#addPayLink', () => {
    const name = $('#plName')?.value.trim();
    const url  = $('#plUrl')?.value.trim();
    if (!name || !url){ alert('Completa nombre y URL.'); return; }
    const id = 'pl_' + Date.now();
    payLinks.links.push({ id, name, url });
    if (!payLinks.defaultId) payLinks.defaultId = id;
    LS.set(KEY_PL, payLinks);
    if ($('#plName')) $('#plName').value = '';
    if ($('#plUrl'))  $('#plUrl').value  = '';
    renderPayLinks();
  });
  const modalPL = $('#modalPL'), modalPLList = $('#modalPLList');
  safeBindClick('#btnPickPayLink', () => {
    payLinks = LS.get(KEY_PL, {links:[], defaultId:null});
    if (!payLinks.links.length){ alert('No hay enlaces. Ve a Configuración → Enlaces de pago.'); return; }
    if (modalPLList) modalPLList.innerHTML = '';
    payLinks.links.forEach(pl => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <b>${pl.name}</b>
          <small class="muted">${pl.url}</small>
        </div>
        <div><button class="btn" data-pick="${pl.id}" type="button">Usar</button></div>`;
      row.querySelector('[data-pick]').addEventListener('click', () => {
        const inp = $('#payLink'); if (inp) inp.value = pl.url;
        if (modalPL) modalPL.style.display = 'none';
      });
      modalPLList && modalPLList.appendChild(row);
    });
    if (modalPL) modalPL.style.display = 'flex';
  });
  safeBindClick('#modalPLClose', () => { if (modalPL) modalPL.style.display = 'none'; });

  // Clientes CRUD
  safeBindClick('#saveClient', () => {
    const c = {
      id:'c_'+Date.now(),
      name: ($('#cName')?.value||'').trim(),
      email: ($('#cEmail')?.value||'').trim(),
      phone: ($('#cPhone')?.value||'').trim(),
      address: ($('#cAddress')?.value||'').trim(),
    };
    if (!c.name){ alert('Nombre es requerido.'); return; }
    clients.push(c); LS.set(KEY_CLI, clients);
    renderClients(); renderClientSelect();
    $('#clientForm')?.reset();
    alert('Cliente guardado.');
  });

  // Importar contacto nativo (si existe soporte)
  safeBindClick('#importFromContacts', () => pickContactsAndSave({selectFor:'clients'}));
  safeBindClick('#pickContactInline',  () => pickContactsAndSave({selectFor:'invoice'}));

  // Fallback vCard
  safeBindClick('#importVCF', () => $('#vcfInput') && $('#vcfInput').click());
  const vcfInput = $('#vcfInput');
  if (vcfInput){
    vcfInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try{
        const text = await file.text();
        const parsed = parseVCardText(text);
        if (!parsed.length){ alert('No se encontró ningún contacto válido en el .vcf'); e.target.value=''; return; }
        parsed.forEach(nc => {
          const client = { id:'c_'+Date.now()+Math.floor(Math.random()*1000), ...nc };
          clients.push(client);
          const sel = $('#clientSelect');
          if (sel){
            const opt = document.createElement('option');
            opt.value = client.id; opt.textContent = client.name || 'Cliente';
            sel.appendChild(opt);
          }
        });
        LS.set(KEY_CLI, clients);
        renderClients();
        const last = clients[clients.length-1]; if (last && $('#clientSelect')) $('#clientSelect').value = last.id;
        alert(`Importados ${parsed.length} contacto(s) desde vCard.`);
      }catch(err){
        console.error(err); alert('No se pudo leer el archivo .vcf');
      }finally{ e.target.value=''; }
    });
  }

  // Líneas / totales
  safeBindClick('#addLine', () => addLine());

  // Fechas por defecto + 1ª línea si no hay
  if ($('#invDate')) $('#invDate').value = D.todayISO();
  if ($('#invDue'))  $('#invDue').value  = D.plusDaysISO(7);
  if ($$('#linesBody tr').length === 0) addLine();

  // Guardar / Limpiar / PDF
  safeBindClick('#btnSave', () => {
    const inv = getInvoiceFromForm();
    if (!inv.lines.length){ alert('Agrega al menos una línea.'); return; }
    invoices.push(inv); LS.set(KEY_INV, invoices);
    if ($('#invNumber')) $('#invNumber').value = (inv.number + 1);
    renderHistory(); renderHistorySummary();
    alert('Factura guardada.');
  });
  safeBindClick('#btnClear', () => {
    $('#invoiceForm')?.reset();
    if (linesBody) linesBody.innerHTML = '';
    addLine();
    if ($('#invDate')) $('#invDate').value = D.todayISO();
    if ($('#invDue'))  $('#invDue').value  = D.plusDaysISO(7);
    autoFillDefaultPayLink(); recalc();
  });
  safeBindClick('#btnPDF', () => exportPDF(null));

  // Historial: cambio de mes
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'histMonth') renderHistorySummary();
  }, {passive:true});

  // Ajuste de UI de Contact Picker vs vCard
  (async () => {
    const hasPicker = await supportsContactPicker();
    const btnContacts  = $('#importFromContacts');
    const btnContacts2 = $('#pickContactInline');
    const btnVCF       = $('#importVCF');
    const hint         = $('#contactSupportHint');

    if (!hasPicker) {
      if (btnContacts){ btnContacts.classList.add('ghost'); btnContacts.setAttribute('disabled','true'); }
      if (btnContacts2){ btnContacts2.classList.add('ghost'); btnContacts2.setAttribute('disabled','true'); }
      if (btnVCF){ btnVCF.classList.remove('ghost'); }
      if (hint){ hint.classList.remove('muted'); }
    } else {
      if (btnVCF){ btnVCF.classList.add('ghost'); }
    }
  })();

  // Inicial
  renderClients();
  renderHistory();
  renderHistorySummary();
  renderPayLinks();

  console.log('Factura Móvil: app inicializada correctamente.');
})();
