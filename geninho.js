/* Geninho operates locally; PDFs are uploaded only after the user confirms. */
const gNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let gReading=false;
function gMessage(text,role='ai'){
 const box=document.createElement('div');box.className='msg '+role;box.textContent=text;
 $('#messages').append(box);gScroll();return box;
}
function gScroll(){$('#messages').scrollTop=$('#messages').scrollHeight}
function gButton(parent,label,fn){const b=document.createElement('button');b.type='button';b.className='mini';b.textContent=label;b.onclick=fn;parent.append(b);return b}
function gList(list,title){
 const box=gMessage(title+'\n'+list.length+' boleto(s) · Total: '+brl.format(list.reduce((v,r)=>v+Number(r.amount||0),0)));
 list.slice(0,20).forEach(r=>{
  const item=document.createElement('div');item.className='g-record';
  const title=document.createElement('div');title.textContent=r.supplier+' · '+pt.format(parseDate(r.due))+' · '+brl.format(r.amount)+' · '+(r.status==='paid'?'Pago':'A pagar');item.append(title);
  if(r.billId)gButton(item,'Boleto',()=>downloadFile(r.billId));
  if(r.receiptId)gButton(item,'Comprovante',()=>downloadFile(r.receiptId));
  if(r.barcode)gButton(item,'Copiar código',()=>copyCode(r.id));
  gButton(item,'Editar',()=>{editRow(r.id);$('#geninhoChat').classList.remove('open')});
  gButton(item,r.status==='paid'?'Reabrir':'Marcar pago',async()=>{
   if(!confirm((r.status==='paid'?'Reabrir':'Marcar como pago')+' o boleto de '+r.supplier+'?'))return;
   await togglePaid(r.id);gMessage('Status atual: '+(rows.find(x=>x.id===r.id)?.status==='paid'?'Pago':'A pagar')+'.');
  });
  gButton(item,'Anexar comprovante',()=>gPick('receipt',r.id));
  box.append(item);
 });
 if(list.length>20){const note=document.createElement('p');note.textContent='Mostrando os primeiros 20. Refine por fornecedor ou abra a busca.';box.append(note)}
 gScroll();
}
function gDate(raw){
 const m=String(raw||'').match(/(\d{2})[/-](\d{2})[/-](\d{4})/);if(!m)return '';
 const d=new Date(+m[3],+m[2]-1,+m[1]);return d.getFullYear()===+m[3]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[1]?m[3]+'-'+m[2]+'-'+m[1]:'';
}
function gExtract(text){
 const flat=text.replace(/\s+/g,' ');
 const date=flat.match(/vencimento\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})/i);
 const money=flat.match(/(?:valor\s+(?:do\s+)?(?:documento|boleto|cobrado|pago)|valor\s+total)\s*[:\-=]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
 const supplier=text.match(/(?:benefici[aá]rio(?:\s+final)?|favorecido|cedente|recebedor)\s*[:\-]?\s*([^\n]{3,100})/i);
 const formatted=flat.match(/\b\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}\b/);
 const compact=flat.match(/\b(?:\d{48}|\d{47}|\d{44})\b/);
 const collection=flat.match(/\b\d{11}[- ]?\d(?:\s+\d{11}[- ]?\d){3}\b/);
 return {supplier:supplier?supplier[1].split(/CNPJ|CPF|Ag[eê]ncia|Nosso N[uú]mero/i)[0].trim():'',due:gDate(date?.[1]),amount:money?money[1]:'',barcode:(formatted?.[0]||compact?.[0]||collection?.[0]||'').replace(/\D/g,'')};
}
async function gReadPDF(file){
 if(!/pdf/i.test(file.type)&&!file.name.toLowerCase().endsWith('.pdf'))return {text:'',warning:'Este arquivo é uma imagem. Selecione o boleto correspondente e confira os dados manualmente.'};
 const lib=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
 lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
 const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
 let doc;
 try{
  doc=await task.promise;let text='';
  for(let i=1;i<=Math.min(doc.numPages,10);i++){
   const page=await doc.getPage(i),content=await page.getTextContent();
   for(const item of content.items)text+=(item.str||'')+(item.hasEOL?'\n':' ');
   text+='\n';page.cleanup();
  }
  return {text,warning:!text.trim()?'Não encontrei texto legível. Este PDF pode ser escaneado. Preencha os dados abaixo.':doc.numPages>10?'Li as primeiras 10 páginas. Cadastre um boleto por vez.':'Confira os dados sugeridos antes de salvar. A leitura pode não identificar todos os campos.'};
 }finally{if(doc)await doc.destroy();else await task.destroy()}
}
function gPick(kind='bill',targetId=null){
 if(!currentUser)return;if(gReading)return gMessage('Aguarde a leitura do arquivo atual.');
 const picker=document.createElement('input');picker.type='file';picker.accept=kind==='bill'?'application/pdf':'application/pdf,image/png,image/jpeg,image/webp';
 picker.onchange=()=>{if(picker.files[0])gHandleFile(picker.files[0],kind,targetId)};picker.click();
}
async function gHandleFile(file,kind,targetId){
 if(gReading)return;
 if(!file.size||file.size>50*1024*1024)return gMessage('Envie um arquivo de até 50 MB, que não esteja vazio.');
 const epoch=sessionEpoch;gReading=true;gMessage(file.name,'user');const progress=gMessage('Lendo o arquivo…');
 let result;
 try{result=await gReadPDF(file)}catch(e){result={text:'',warning:e.name==='PasswordException'?'O PDF tem senha. Você pode preencher os dados e guardar o arquivo original.':'Não consegui ler este arquivo automaticamente. Preencha os dados para continuar.'}}
 finally{gReading=false}
 if(epoch!==sessionEpoch)return;
 progress.textContent=result.warning;
 gReview(file,kind,gExtract(result.text),targetId,epoch);
}
function gField(form,label,type,value='',required=false){
 const wrap=document.createElement('div');wrap.className='field';const id='g-'+crypto.randomUUID();
 const l=document.createElement('label');l.textContent=label;l.htmlFor=id;
 const input=document.createElement('input');input.id=id;input.type=type;input.value=value;input.required=required;wrap.append(l,input);form.append(wrap);return input;
}
function gReview(file,kind,found,targetId,epoch){
 const box=gMessage(kind==='bill'?'Conferir boleto':'Vincular comprovante');
 const form=document.createElement('form');form.className='g-review';box.append(form);
 let supplier,due,amount,barcode,selection;
 if(kind==='bill'){
  supplier=gField(form,'Fornecedor','text',found.supplier,true);
  due=gField(form,'Vencimento','date',found.due,true);
  amount=gField(form,'Valor (R$)','text',found.amount,true);amount.inputMode='decimal';
  barcode=gField(form,'Linha digitável / código','text',found.barcode);
 }else{
  const label=document.createElement('label');label.textContent='Selecione o boleto';selection=document.createElement('select');selection.required=true;selection.id='g-'+crypto.randomUUID();label.htmlFor=selection.id;
  const blank=document.createElement('option');blank.value='';blank.textContent='Escolha o boleto correspondente';selection.append(blank);
  rows.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.supplier+' · '+pt.format(parseDate(r.due))+' · '+brl.format(r.amount);selection.append(o)});
  if(targetId)selection.value=targetId;
  form.append(label,selection);
  const note=document.createElement('p');note.textContent='Ao confirmar, o comprovante será anexado e o boleto será marcado como pago.';form.append(note);
  if(!rows.length)note.textContent='Cadastre o boleto primeiro e depois envie este comprovante.';
  if(found.amount){const hint=document.createElement('p');hint.textContent='Valor identificado no arquivo: R$ '+found.amount+'. Confira antes de vincular.';form.append(hint)}
 }
 const save=document.createElement('button');save.className='btn soft';save.textContent=kind==='bill'?'Confirmar e salvar boleto':'Confirmar comprovante';form.append(save);
 gButton(form,'Cancelar',()=>box.remove());
 form.onsubmit=e=>{
  e.preventDefault();if(epoch!==sessionEpoch)return gMessage('A sessão mudou. Envie o arquivo novamente.');
  runAction(async()=>{
   save.disabled=true;
   try{
    if(kind==='bill'){
     const val=amountNum(amount.value);
     if(!supplier.value.trim()||!due.value||!Number.isFinite(val)||val<=0)throw new Error('Confira fornecedor, vencimento e valor maior que zero.');
     const code=barcode.value.replace(/\D/g,'');
     if(code&&![44,47,48].includes(code.length))throw new Error('Confira o código: use 44, 47 ou 48 dígitos, ou deixe o campo vazio.');
     if(code&&rows.some(r=>(r.barcode||'').replace(/\D/g,'')===code)&&!confirm('Já existe um boleto com esse código. Deseja salvar outro registro?'))return;
     const id='bill_'+crypto.randomUUID();await putFile(id,file);
     await putRow({id:crypto.randomUUID(),supplier:supplier.value.trim(),due:due.value,amount:val,barcode:code,status:'open',billId:id,receiptId:null,note:'Cadastrado pelo Geninho',paidAt:null},true);
    }else{
     const r=rows.find(x=>x.id===selection.value);if(!r)throw new Error('Selecione um boleto.');
     if(r.receiptId&&!confirm('Este boleto já tem comprovante. Deseja substituir?'))return;
     const id='receipt_'+crypto.randomUUID();await putFile(id,file);
     await putRow({...r,receiptId:id,status:'paid',paidAt:r.paidAt||new Date().toISOString()});
     await cleanupOld(r.receiptId);
    }
    await refresh();box.remove();gMessage(kind==='bill'?'Boleto salvo na Central com o PDF anexado.':'Comprovante salvo. O boleto está marcado como pago.');
   }finally{save.disabled=false}
  });
 };gScroll();
}
async function gAskGemini(question){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente.');
 const bills=rows.slice(0,100).map(r=>({
  supplier:String(r.supplier||'').slice(0,120),
  due:String(r.due||'').slice(0,10),
  amount:r.amount==null?null:Number(r.amount),
  status:r.status==='paid'?'paid':'open',
  note:String(r.note||'').slice(0,160)
 }));
 const response=await fetch('/api/geninho',{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
  body:JSON.stringify({question,bills})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error||'O Geninho não conseguiu responder agora.');
 return payload.answer;
}

sendChat=async function(){
 const input=$('#chatText'),text=input.value.trim();if(!text)return;input.value='';gMessage(text,'user');
 const t=gNorm(text);
 if(/(enviar|mandar|anexar|lancar|cadastrar|novo)/.test(t)){
  const receipt=t.includes('comprovante');gMessage(receipt?'Selecione o comprovante. Depois, escolha o boleto e confirme.':'Selecione o PDF do boleto. Vou sugerir os dados que conseguir ler para você conferir.');
  const box=$('#messages').lastElementChild;gButton(box,receipt?'Enviar comprovante':'Enviar boleto',()=>gPick(receipt?'receipt':'bill'));gScroll();return;
 }
 if(/relatorio|relatorios/.test(t)){
  const list=t.includes('semana')?rows.filter(isWeek):rows.filter(r=>r.status==='paid');
  gList(list,t.includes('semana')?'Resumo da semana':'Boletos pagos');
  gButton($('#messages').lastElementChild,'Abrir relatórios',()=>{goPanel('relatorios');$('#geninhoChat').classList.remove('open')});gScroll();return;
 }
 let list=rows,title='Boletos encontrados',matched=false;
 const query=t.replace(/\b(buscar|busca|procure|procurar|consultar|consulta|quero|ver|boleto|boletos|comprovante|comprovantes|para|por|favor|da|do|de|a|o)\b/g,' ').trim();
 const hits=rows.filter(r=>gNorm(r.supplier)&&(t.includes(gNorm(r.supplier))||(/buscar|busca|procure|consultar/.test(t)&&query.length>=3&&gNorm(r.supplier).includes(query))));
 if(hits.length){list=hits;matched=true}
 if(t.includes('semana')){list=list.filter(isWeek);matched=true;title='Vencimentos da semana'}
 if(t.includes('vencid')){list=list.filter(r=>r.status==='open'&&parseDate(r.due)<new Date(new Date().setHours(0,0,0,0)));matched=true;title='Boletos vencidos'}
 if(t.includes('sem pdf')||t.includes('sem boleto')){list=list.filter(r=>!r.billId);matched=true;title='Boletos sem PDF'}
 if(t.includes('sem comprovante')){list=list.filter(r=>r.status==='paid'&&!r.receiptId);matched=true;title='Pagos sem comprovante'}
 else if(t.includes('comprovante')){list=list.filter(r=>r.receiptId);matched=true;title='Comprovantes encontrados'}
 if(t.includes('a pagar')||t.includes('em aberto')){list=list.filter(r=>r.status==='open');matched=true}
 if(/^(quais|listar|mostrar|ver)/.test(t)&&t.includes('pagos')&&!t.includes('sem comprovante')){list=list.filter(r=>r.status==='paid');matched=true;title='Boletos pagos'}
 if(/^(listar|mostrar|todos|quanto|total)/.test(t))matched=true;
 if(matched){gList(list,title);return}
 const thinking=gMessage('Pensando…');
 try{
  thinking.textContent=await gAskGemini(text);
 }catch(error){
  thinking.textContent=error.message||'Não consegui falar com o Gemini agora.';
  const actions=gMessage('Ainda posso receber boletos e comprovantes, consultar vencimentos, buscar fornecedores e abrir relatórios.');
  gButton(actions,'Enviar boleto',()=>gPick('bill'));gButton(actions,'Enviar comprovante',()=>gPick('receipt'));
 }
 gScroll();
};
$('#sendChat').onclick=sendChat;
$('#geninhoBill').onclick=()=>gPick('bill');
$('#geninhoReceipt').onclick=()=>gPick('receipt');
