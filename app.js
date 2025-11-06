/* App de facturación (localStorage + jsPDF) con gestión de Enlaces de pago */
window.addEventListener('DOMContentLoaded', () => {
  dayjs.locale('es');
  const $  = (q) => document.querySelector(q);
  const $$ = (q) => document.querySelectorAll(q);

  // ---------- Navegación ----------
  const views = $$('.view');
  const navButtons = $$('.bottom-nav button');
  const show = (id) => {
    views.forEach(v => v.classList.remove('active'));
    $('#'+id).classList.add('active');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.target === id));
  };
  $('#btnHomeTop').addEventListener('click', () => show('view-home'));
  $$('.backHome').forEach(b => b.addEventListener('click', () => show('view-home')));
  $('#goNewInvoice').addEventListener('click', () => {
    // auto-llenar con predeterminado si existe y está vacío
    if(!$('#payLink').value){
      const def = getDefaultPayLink();
      if(def) $('#payLink').value = def.url;
    }
    show('view-invoice');
  });
  $('#goHistory').addEventListener('click', () => { renderHistory(); show('view-history'); });
  $('#goClients').addEventListener('click', () => { renderClients(); show('view-clients'); });
  $('#goConfig').addEventListener('click', () => { renderPayLinks(); show('view-config'); });

  navButtons.forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.target;
    if(t==='view-history') renderHistory();
    if(t==='view-clients') renderClients();
    if(t==='view-config')  renderPayLinks();
    show(t);
  }));

  // ---------- Storage ----------
  const LS = {
    get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    del: (k) => localStorage.removeItem(k),
    rawGet: (k) => localStorage.getItem(k),
    rawSet: (k, v) => localStorage.setItem(k, v),
  };

  const KEY_INV='oasis_invoices';
  const KEY_CLI='oasis_clients';
  const KEY_LOGO='oasis_logo';
  const KEY_CFG='oasis_company';
  const KEY_PL ='oasis_paylinks'; // {links:[{id,name,url}], defaultId: 'pl_...'} 

  // ---------- Estado ----------
  let invoices = LS.get(KEY_INV, []);
  let clients  = LS.get(KEY_CLI, []);
  let company  = LS.get(KEY_CFG, {name:'Mi Empresa', email:'correo@empresa.com'});
  let logoData = LS.rawGet(KEY_LOGO) || '';
  let payLinksState = LS.get(KEY_PL, {links:[], defaultId:null});

  // ---------- Marca ----------
  function refreshBrand(){
    $('#brandName').textContent  = company.name || 'Mi Empresa';
    $('#brandEmail').textContent = company.email || 'correo@empresa.com';
    const logo = $('#brandLogo');
    logo.src = logoData ? logoData : 'assets/logo-placeholder.png';
  }
  refreshBrand();

  // ---------- Configuración empresa ----------
  $('#cfgName').value = company.name || 'Mi Empresa';
  $('#cfgEmail').value = company.email || 'correo@empresa.com';
  $('#saveConfig').addEventListener('click', () => {
    company = {name: $('#cfgName').value.trim(), email: $('#cfgEmail').value.trim()};
    LS.set(KEY_CFG, company);
    refreshBrand();
    alert('Configuración guardada.');
  });
  $('#cfgLogo').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      logoData = reader.result;
      LS.rawSet(KEY_LOGO, logoData);
      refreshBrand();
    };
    reader.readAsDataURL(f);
  });

  // ---------- Enlaces de pago (Config) ----------
  const payLinksList = $('#payLinksList');
  function renderPayLinks(){
    payLinksState = LS.get(KEY_PL, {links:[], defaultId:null});
    payLinksList.innerHTML = '';
    if(!payLinksState.links.length){
      payLinksList.innerHTML = '<p class="muted">Sin enlaces guardados. Agrega uno arriba.</p>';
      return;
    }
    payLinksState.links.forEach(pl => {
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `
        <div class="meta">
          <b>${pl.name}</b>
          <small class="muted">${pl.url}</small>
          ${payLinksState.defaultId===pl.id ? '<small style="color:#0c4a6e">Predeterminado</small>' : ''}
        </div>
        <div style="display:flex; gap:6px">
          <button class="btn" data-def="${pl.id}">Predeterminar</button>
          <button class="btn ghost" data-del="${pl.id}">Eliminar</button>
        </div>`;
      d.querySelector('[data-del]').addEventListener('click', () => {
        payLinksState.links = payLinksState.links.filter(x => x.id!==pl.id);
        if(payLinksState.defaultId===pl.id) payLinksState.defaultId = null;
        LS.set(KEY_PL, payLinksState);
        renderPayLinks();
      });
      d.querySelector('[data-def]').addEventListener('click', () => {
        payLinksState.defaultId = pl.id;
        LS.set(KEY_PL, payLinksState);
        renderPayLinks();
      });
      payLinksList.appendChild(d);
    });
  }

  $('#addPayLink').addEventListener('click', (e) => {
    e.preventDefault();
    const name = $('#plName').value.trim();
    const url  = $('#plUrl').value.trim();
    if(!name || !url){ alert('Completa nombre y URL.'); return; }
    const id = 'pl_'+Date.now();
    payLinksState.links.push({id, name, url});
    // si es el primero, lo dejo predeterminado
    if(!payLinksState.defaultId) payLinksState.defaultId = id;
    LS.set(KEY_PL, payLinksState);
    $('#plName').value=''; $('#plUrl').value='';
    renderPayLinks();
  });

  function getDefaultPayLink(){
    const id = payLinksState.defaultId;
    if(!id) return null;
    return payLinksState.links.find(x => x.id===id) || null;
  }

  // ---------- Modal selector de enlaces ----------
  const modalPL = $('#modalPL');
  const modalPLList = $('#modalPLList');
  $('#modalPLClose').addEventListener('click', () => modalPL.style.display='none');

  function openPayLinkPicker(){
    payLinksState = LS.get(KEY_PL, {links:[], defaultId:null});
    if(!payLinksState.links.length){
      alert('No tienes enlaces guardados. Ve a Configuración > Enlaces de pago.');
      return;
    }
    modalPLList.innerHTML = '';
    payLinksState.links.forEach(pl => {
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `
        <div class="meta">
          <b>${pl.name}</b>
          <small class="muted">${pl.url}</small>
        </div>
        <div>
          <button class="btn" data-pick="${pl.id}">Usar</button>
        </div>`;
      d.querySelector('[data-pick]').addEventListener('click', () => {
        $('#payLink').value = pl.url;
        modalPL.style.display='none';
      });
      modalPLList.appendChild(d);
    });
    modalPL.style.display = 'flex';
  }

  $('#btnPickPayLink').addEventListener('click', openPayLinkPicker);

  // ---------- Clientes ----------
  function renderClientSelect(){
    const sel = $('#clientSelect');
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value=''; opt0.textContent='— Selecciona cliente —';
    sel.appendChild(opt0);
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value=c.id; o.textContent=c.name;
      sel.appendChild(o);
    });
  }
  function renderClients(){
    renderClientSelect();
    const wrap = $('#clientsList');
    wrap.innerHTML='';
    if(clients.length===0){
      wrap.innerHTML = '<p class="muted">Sin clientes guardados.</p>';
      return;
    }
    clients.slice().reverse().forEach(c => {
      const d = document.createElement('div');
      d.className='item';
      d.innerHTML = `<div class="meta">
        <b>${c.name}</b>
        <small>${c.email||''} ${c.phone? '· '+c.phone : ''}</small>
        <small class="muted">${c.address||''}</small>
      </div>
      <div>
        <button class="btn ghost" data-del="${c.id}">Eliminar</button>
      </div>`;
      d.querySelector('[data-del]').addEventListener('click', () => {
        clients = clients.filter(x => x.id!==c.id);
        LS.set(KEY_CLI, clients);
        renderClients();
        renderClientSelect();
      });
      wrap.appendChild(d);
    });
  }
  $('#saveClient').addEventListener('click', () => {
    const c = {
      id: 'c_'+Date.now(),
      name: $('#cName').value.trim(),
      email: $('#cEmail').value.trim(),
      phone: $('#cPhone').value.trim(),
      address: $('#cAddress').value.trim(),
    };
    if(!c.name){ alert('Nombre es requerido.'); return; }
    clients.push(c); LS.set(KEY_CLI, clients);
    renderClients(); renderClientSelect();
    $('#clientForm').reset();
    alert('Cliente guardado.');
  });
  $('#addClientInline').addEventListener('click', () => show('view-clients'));
  renderClientSelect();

  // ---------- Líneas de factura ----------
  const linesBody = $('#linesBody');
  function addLine(desc='', qty=1, price=0){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="desc" placeholder="Descripción" value="${desc}"/></td>
      <td class="n"><input class="qty" type="number" min="0" step="0.01" value="${qty}"/></td>
      <td class="n"><input class="price" type="number" min="0" step="0.01" value="${price}"/></td>
      <td class="n"><span class="ltotal">$0.00</span></td>
      <td><button type="button" class="btn ghost del">×</button></td>`;
    tr.querySelector('.del').addEventListener('click', () => { tr.remove(); recalc(); });
    ['input','change'].forEach(ev => tr.addEventListener(ev, recalc));
    linesBody.appendChild(tr);
    recalc();
  }
  $('#addLine').addEventListener('click', () => addLine());
  addLine();

  // ---------- Fechas ----------
  $('#invDate').value = dayjs().format('YYYY-MM-DD');
  $('#invDue').value  = dayjs().add(7,'day').format('YYYY-MM-DD');

  // ---------- Totales ----------
  function fmt(n){ return '$'+Number(n||0).toFixed(2); }
  function collectLines(){
    const rows = [...linesBody.querySelectorAll('tr')];
    return rows.map(r => {
      const desc = r.querySelector('.desc').value.trim();
      const qty = parseFloat(r.querySelector('.qty').value)||0;
      const price = parseFloat(r.querySelector('.price').value)||0;
      const total = qty*price;
      return {desc, qty, price, total};
    }).filter(x => x.desc || x.qty || x.price);
  }
  function recalc(){
    const lines = collectLines();
    let sub = lines.reduce((a,b)=>a+b.total,0);
    const discPct = parseFloat($('#discPct').value)||0;
    const taxPct  = parseFloat($('#taxPct').value)||0;
    const discount = sub*(discPct/100);
    const taxed    = (sub-discount)*(taxPct/100);
    const total    = sub - discount + taxed;

    [...linesBody.querySelectorAll('tr')].forEach((r,i) => {
      r.querySelector('.ltotal').textContent = fmt(lines[i].total);
    });

    $('#tSubtotal').textContent = fmt(sub);
    $('#tDiscount').textContent = fmt(discount);
    $('#tTax').textContent      = fmt(taxed);
    $('#tTotal').textContent    = fmt(total);
    return {sub, discount, taxed, total};
  }

  // ---------- Factura desde el formulario ----------
  function getInvoiceFromForm(){
    const inv = {
      id: 'i_'+Date.now(),
      prefix: $('#invPrefix').value.trim() || 'FAC-',
      number: parseInt($('#invNumber').value)||1,
      date:   $('#invDate').value,
      due:    $('#invDue').value,
      clientId: $('#clientSelect').value || null,
      clientName: $('#clientSelect').selectedOptions[0]?.textContent || '',
      notes:  $('#invNotes').value.trim(),
      payLink:$('#payLink').value.trim(),
      discPct: parseFloat($('#discPct').value)||0,
      taxPct:  parseFloat($('#taxPct').value)||0,
      lines:   collectLines(),
    };
    inv.totals = recalc();
    return inv;
  }

  // ---------- Guardar ----------
  $('#btnSave').addEventListener('click', () => {
    const inv = getInvoiceFromForm();
    if(inv.lines.length===0){ alert('Agrega al menos una línea.'); return; }
    invoices.push(inv); LS.set(KEY_INV, invoices);
    $('#invNumber').value = inv.number + 1;
    renderHistory();
    alert('Factura guardada.');
  });

  // ---------- Limpiar ----------
  $('#btnClear').addEventListener('click', () => {
    $('#invoiceForm').reset();
    linesBody.innerHTML='';
    addLine();
    $('#invDate').value = dayjs().format('YYYY-MM-DD');
    $('#invDue').value  = dayjs().add(7,'day').format('YYYY-MM-DD');
    // auto-llenar payLink con predeterminado
    const def = getDefaultPayLink();
    $('#payLink').value = def ? def.url : '';
    recalc();
  });

  // ---------- Historial ----------
  function renderHistory(){
    const wrap = $('#historyList');
    wrap.innerHTML='';
    if(invoices.length===0){
      wrap.innerHTML = '<p class="muted">Sin facturas guardadas.</p>';
      return;
    }
    invoices.slice().reverse().forEach(inv => {
      const d = document.createElement('div');
      d.className='item';
      const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
      d.innerHTML = `<div class="meta">
        <b>${code} · ${inv.clientName||'Cliente'}</b>
        <small>${dayjs(inv.date).format('DD/MM/YYYY')} · Total ${fmt(inv.totals?.total||0)}</small>
        <small class="muted">${inv.payLink? 'Pago: '+inv.payLink : 'Sin enlace de pago'}</small>
      </div>
      <div>
        <button class="btn" data-pdf="${inv.id}">PDF</button>
        <button class="btn ghost" data-del="${inv.id}">Eliminar</button>
      </div>`;
      d.querySelector('[data-del]').addEventListener('click', () => {
        invoices = invoices.filter(x => x.id!==inv.id);
        LS.set(KEY_INV, invoices);
        renderHistory();
      });
      d.querySelector('[data-pdf]').addEventListener('click', () => exportPDF(inv));
      wrap.appendChild(d);
    });
  }

  // ---------- Exportar PDF (encabezado celeste + títulos azules) ----------
  function exportPDF(invOverride=null){
    const inv = invOverride || getInvoiceFromForm();
    if(inv.lines.length===0){ alert('Agrega al menos una línea.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({unit:'pt', format:'a4'});

    const margin = 40;
    let y = margin;

    // Logo + marca
    if(logoData){
      try{ doc.addImage(logoData, 'PNG', margin, y, 80, 80); }catch{}
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text(company.name || 'Mi Empresa', margin + (logoData? 90:0), y+20);
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text(company.email || '', margin + (logoData? 90:0), y+38);

    // Header derecha
    const code = `${inv.prefix}${String(inv.number).padStart(4,'0')}`;
    doc.setFont('helvetica','bold'); doc.setFontSize(20);
    doc.setTextColor(3, 105, 161); // azul oscuro
    doc.text('FACTURA', 460, y+20, {align:'right'});
    doc.setTextColor(0,0,0);
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.text(`No: ${code}`, 460, y+40, {align:'right'});
    doc.text(`Fecha: ${dayjs(inv.date).format('DD/MM/YYYY')}`, 460, y+56, {align:'right'});
    doc.text(`Vence: ${dayjs(inv.due).format('DD/MM/YYYY')}`, 460, y+72, {align:'right'});

    y += 100;

    // Datos cliente
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Facturar a', margin, y);
    doc.setFont('helvetica','normal');
    const client = clients.find(c => c.id===inv.clientId);
    const cName = inv.clientName || client?.name || '';
    const cEmail= client?.email || '';
    const cPhone= client?.phone || '';
    const cAddr = client?.address || '';
    y += 16;
    doc.text(cName, margin, y); y += 14;
    if(cEmail){ doc.text(cEmail, margin, y); y += 14; }
    if(cPhone){ doc.text(cPhone, margin, y); y += 14; }
    if(cAddr){  doc.text(cAddr,  margin, y); y += 16; }

    // Encabezado tabla azul cielo
    y += 4;
    doc.setFillColor(224, 247, 255); // #e0f7ff
    doc.rect(margin, y, 515, 22, 'F');
    doc.setFont('helvetica','bold');
    doc.setTextColor(3, 105, 161); // #0369a1
    doc.text('Descripción', margin+8, y+15);
    doc.text('Cant.', margin+330, y+15, {align:'right'});
    doc.text('Precio', margin+420, y+15, {align:'right'});
    doc.text('Total', margin+510, y+15, {align:'right'});
    doc.setTextColor(0,0,0);
    y += 28;

    // Líneas
    doc.setFont('helvetica','normal');
    inv.lines.forEach(line => {
      doc.text(line.desc || '-', margin+8, y);
      doc.text(String((line.qty||0).toFixed(2)), margin+330, y, {align:'right'});
      doc.text('$'+(line.price||0).toFixed(2), margin+420, y, {align:'right'});
      doc.text('$'+(line.total||0).toFixed(2), margin+510, y, {align:'right'});
      y += 18;
    });

    // Totales
    y += 8;
    const xBox = margin+315;
    doc.setDrawColor(180);
    doc.rect(xBox, y, 200, 80);
    doc.setFont('helvetica','normal');
    doc.text('Subtotal', xBox+10, y+18);
    doc.text('$'+(inv.totals.sub).toFixed(2), xBox+190, y+18, {align:'right'});
    doc.text(`Descuento (${inv.discPct}%)`, xBox+10, y+36);
    doc.text('$'+(inv.totals.discount).toFixed(2), xBox+190, y+36, {align:'right'});
    doc.text(`Impuesto (${inv.taxPct}%)`, xBox+10, y+54);
    doc.text('$'+(inv.totals.taxed).toFixed(2), xBox+190, y+54, {align:'right'});
    doc.setFont('helvetica','bold');
    doc.text('TOTAL', xBox+10, y+74);
    doc.text('$'+(inv.totals.total).toFixed(2), xBox+190, y+74, {align:'right'});

    // Pago + notas
    y += 100;
    if(inv.payLink){
      doc.setFont('helvetica','bold'); doc.text('Paga tu factura:', margin, y);
      doc.setFont('helvetica','normal'); y+=16;
      doc.setTextColor(0,102,204);
      doc.textWithLink(inv.payLink, margin, y, { url: inv.payLink });
      doc.setTextColor(0,0,0);
      y+=14;
    }
    if(inv.notes){
      doc.setFont('helvetica','bold'); doc.text('Notas:', margin, y);
      doc.setFont('helvetica','normal'); y+=14;
      const split = doc.splitTextToSize(inv.notes, 515);
      doc.text(split, margin, y);
    }

    doc.save(`${code}.pdf`);
  }

  $('#btnPDF').addEventListener('click', () => exportPDF(null));
});
