// Proyecto nuevo: Facturación local + jsPDF + Gestión de enlaces (sin Firebase)
window.addEventListener('DOMContentLoaded', () => {
  // ===== Utils =====
  dayjs.locale('es');
  const $  = (q) => document.querySelector(q);
  const $$ = (q) => document.querySelectorAll(q);
  const fmt = (n) => '$' + Number(n || 0).toFixed(2);

  // ===== Navegación por delegación (robusta) =====
  const views = $$('.view');
  function show(id){
    views.forEach(v => {
      const active = v.id === id;
      v.classList.toggle('active', active);
      v.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    // activar botón nav
    $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.target === id));
  }
  // Botón superior
  $('#btnHomeTop')?.addEventListener('click', () => show('view-home'));
  // Delegación global
  document.addEventListener('click', (e) => {
    // bottom-nav
    const targetBtn = e.target.closest('[data-target]');
    if (targetBtn){
      const t = targetBtn.dataset.target;
      if (t === 'view-history') renderHistory();
      if (t === 'view-clients') renderClients();
      if (t === 'view-config')  renderPayLinks();
      show(t);
      return;
    }
    // cards home
    if (e.target.closest('#goNewInvoice')) { autoFillDefaultPayLink(); show('view-invoice'); }
    if (e.target.closest('#goHistory'))    { renderHistory(); show('view-history'); }
    if (e.target.closest('#goClients'))    { renderClients(); show('view-clients'); }
    if (e.target.closest('#goConfig'))     { renderPayLinks(); show('view-config'); }
    // volver
    if (e.target.closest('.backHome')) { show('view-home'); }
  });

  // ===== LocalStorage =====
  const LS = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    rawGet: (k) => localStorage.getItem(k),
    rawSet: (k, v) => localStorage.setItem(k, v),
  };
  const KEY_INV='oasis_invoices', KEY_CLI='oasis_clients', KEY_LOGO='oasis_logo', KEY_CFG='oasis_company', KEY_PL='oasis_paylinks';

  // ===== Estado =====
  let invoices = LS.get(KEY_INV, []);
  let clients  = LS.get(KEY_CLI, []);
  let company  = LS.get(KEY_CFG, {name:'Mi Empresa', email:'correo@empresa.com'});
  let logoData = LS.rawGet(KEY_LOGO) || '';
  let payLinks = LS.get(KEY_PL, {links:[], defaultId:null}); // {links:[{id,name,url}], defaultId}

  // ===== Marca / Config =====
  function refreshBrand(){
    $('#brandName').textContent  = company.name || 'Mi Empresa';
    $('#brandEmail').textContent = company.email || 'correo@empresa.com';
    $('#brandLogo').src = logoData ? logoData : 'assets/logo-placeholder.png';
  }
  refreshBrand();

  $('#cfgName').value = company.name;
  $('#cfgEmail').value = company.email;
  $('#saveConfig')?.addEventListener('click', () => {
    company = { name: $('#cfgName').value.trim(), email: $('#cfgEmail').value.trim() };
    LS.set(KEY_CFG, company);
    refreshBrand();
    alert('Configuración guardada.');
  });
  $('#cfgLogo')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { logoData = r.result; LS.rawSet(KEY_LOGO, logoData); refreshBrand(); };
    r.readAsDataURL(f);
  });

  // ===== Enlaces de pago =====
  function renderPayLinks(){
    payLinks = LS.get(KEY_PL, {links:[], defaultId:null});
    const wrap = $('#payLinksList'); wrap.innerHTML = '';
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
  $('#addPayLink')?.addEventListener('click', () => {
    const name = $('#plName').value.trim();
    const url  = $('#plUrl').value.trim();
    if (!name || !url){ alert('Completa nombre y URL.'); return; }
    const id = 'pl_' + Date.now();
    payLinks.links.push({ id, name, url });
    if (!payLinks.defaultId) payLinks.defaultId = id;
    LS.set(KEY_PL, payLinks);
    $('#plName').value = ''; $('#plUrl').value = '';
    renderPayLinks();
  });
  function getDefaultPayLink(){
    if (!payLinks.defaultId) return null;
    return payLinks.links.find(x => x.id === payLinks.defaultId) || null;
  }
  function autoFillDefaultPayLink(){
    const input = $('#payLink');
    if (!input.value){
      const d = getDefaultPayLink();
      if (d) input.value = d.url;
    }
  }

  // Modal selector
  const modalPL = $('#modalPL'), modalPLList = $('#modalPLList');
  $('#btnPickPayLink')?.addEventListener('click', () => {
    payLinks = LS.get(KEY_PL, {links:[], defaultId:null});
    if (!payLinks.links.length){ alert('No hay enlaces. Ve a Configuración → Enlaces de pago.'); return; }
    modalPLList.innerHTML = '';
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
        $('#payLink').value = pl.url;
        modalPL.style.display = 'none';
      });
      modalPLList.appendChild(row);
    });
    modalPL.style.display = 'flex';
  });
  $('#modalPLClose')?.addEventListener('click', () => modalPL.style.display = 'none');

  // ===== Clientes =====
  function renderClientSelect(){
    const sel = $('#clientSelect'); sel.innerHTML = '';
    const o0 = document.createElement('option'); o0.value=''; o0.textContent='— Selecciona cliente —';
    sel.appendChild(o0);
    clients.forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  }
  function renderClients(){
    renderClientSelect();
    const wrap = $('#clientsList'); wrap.innerHTML = '';
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
  $('#saveClient')?.addEventListener('click', () => {
    const c = {
      id:'c_'+Date.now(),
      name: $('#cName').value.trim(),
      email: $('#cEmail').value.trim(),
      phone: $('#cPhone').value.trim(),
      address: $('#cAddress').value.trim(),
    };
    if (!c.name){ alert('Nombre es requerido.'); return; }
    clients.push(c); LS.set(KEY_CLI, clients);
    renderClients(); renderClientSelect();
    $('#clientForm').reset();
    alert('Cliente guardado.');
  });
  $('#addClientInline')?.addEventListener('click', () => show('view-clients'));

  // ===== Líneas y totales =====
  const linesBody = $('#linesBody');
  function addLine(desc='', qty=1, price=0){
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
    const discPct = parseFloat($('#discPct').value)||0;
    const taxPct  = parseFloat($('#taxPct').value)||0;
    const discount = sub*(discPct/100);
    const taxed    = (sub - discount)*(taxPct/100);
    const total    = sub - discount + taxed;

    [...linesBody.querySelectorAll('tr')].forEach((r,i) => {
      r.querySelector('.ltotal').textContent = fmt(lines[i]?.total || 0);
    });
    $('#tSubtotal').textContent = fmt(sub);
    $('#tDiscount').textContent = fmt(discount);
    $('#tTax').textContent      = fmt(taxed);
    $('#tTotal').textContent    = fmt(total);
    return { sub, discount, taxed, total };
  }

  // Fechas default + 1ª línea
  $('#invDate').value = dayjs().format('YYYY-MM-DD');
  $('#invDue').value  = dayjs().add(7,'day').format('YYYY-MM-DD');
  addLine();
  $('#addLine')?.addEventListener('click', () => addLine());

  // ===== Factura =====
  function getInvoiceFromForm(){
    const inv = {
      id:'i_'+Date.now(),
      prefix: $('#invPrefix').value.trim() || 'FAC-',
      number: parseInt($('#invNumber').value) || 1,
      date: $('#invDate').value,
      due:  $('#invDue').value,
      clientId: $('#clientSelect').value || null,
      clientName: $('#clientSelect').selectedOptions[0]?.textContent || '',
      notes: $('#invNotes').value.trim(),
      payLink: $('#payLink').value.trim(),
      discPct: parseFloat($('#discPct').value) || 0,
      taxPct:  parseFloat($('#taxPct').value)  || 0,
      lines: collectLines(),
    };
    inv.totals = recalc();
    return inv;
  }

  $('#btnSave')?.addEventListener('click', () => {
    const inv = getInvoiceFromForm();
    if (!inv.lines.length){ alert('Agrega al menos una línea.'); return; }
    invoices.push(inv); LS.set(KEY_INV, invoices);
    $('#invNumber').value = inv.number + 1;
    renderHistory();
    alert('Factura guardada.');
  });
  $('#btnClear')?.addEventListener('click', () => {
    $('#invoiceForm').reset();
    linesBody.innerHTML = '';
    addLine();
    $('#invDate').value = dayjs().format('YYYY-MM-DD');
    $('#invDue').value  = dayjs().add(7,'day').format('YYYY-MM-DD');
    autoFillDefaultPayLink();
    recalc();
  });

  // ===== Historial =====
  function renderHistory(){
    const wrap = $('#historyList'); wrap.innerHTML = '';
    if (!invoices.length){ wrap.innerHTML = '<p class="muted">Sin facturas guardadas.</p>'; return; }
    [...invoices].reverse().forEach(inv => {
      const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <b>${code} · ${inv.clientName || 'Cliente'}</b>
          <small>${dayjs(inv.date).format('DD/MM/YYYY')} · Total ${fmt(inv.totals?.total || 0)}</small>
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
      });
      row.querySelector('[data-pdf]').addEventListener('click', () => exportPDF(inv));
      wrap.appendChild(row);
    });
  }

  // ===== PDF (tema celeste) =====
  function exportPDF(invOverride=null){
    const inv = invOverride || getInvoiceFromForm();
    if (!inv.lines.length){ alert('Agrega al menos una línea.'); return; }
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
    doc.text(`Fecha: ${dayjs(inv.date).format('DD/MM/YYYY')}`, 460, y+56, {align:'right'});
    doc.text(`Vence: ${dayjs(inv.due).format('DD/MM/YYYY')}`, 460, y+72, {align:'right'});

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
    doc.text(`Impuesto (${inv.taxPct}%)`,   xBox+10, y+54); doc.text(fmt(inv.totals.taxed), xBox+190, y+54, {align:'right'});
    doc.setFont('helvetica','bold');
    doc.text('TOTAL', xBox+10, y+74); doc.text(fmt(inv.totals.total), xBox+190, y+74, {align:'right'});

    y += 100;
    if (inv.payLink){
      doc.setFont('helvetica','bold'); doc.text('Paga tu factura:', margin, y);
      doc.setFont('helvetica','normal'); y += 16;
      doc.setTextColor(0,102,204);
      doc.textWithLink(inv.payLink, margin, y, { url: inv.payLink });
      doc.setTextColor(0,0,0); y += 14;
    }
    if (inv.notes){
      doc.setFont('helvetica','bold'); doc.text('Notas:', margin, y);
      doc.setFont('helvetica','normal'); y += 14;
      doc.text(doc.splitTextToSize(inv.notes, 515), margin, y);
    }

    doc.save(`${code}.pdf`);
  }
  $('#btnPDF')?.addEventListener('click', () => exportPDF(null));

  // ===== Inicial =====
  renderClients();
  renderHistory();
  renderPayLinks();
});
