import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global { interface Window { EPI_ERP_CONFIG?: { apiBaseUrl?: string } } }

type View = 'overview' | 'stock' | 'employees' | 'sheets' | 'history';
const today = () => new Date().toISOString().slice(0,10);

@Component({ selector:'epi-root', standalone:true, imports:[CommonModule,FormsModule], templateUrl:'./app.component.html' })
export class AppComponent implements OnInit {
  client?: SupabaseClient;
  private readonly apiBaseUrl = window.EPI_ERP_CONFIG?.apiBaseUrl?.replace(/\/$/, '') ?? '';
  config?: { supabaseUrl:string; publishableKey:string; faceMatchEnabled:boolean };
  userEmail = '';
  loginEmail = '';
  loginPassword = '';
  busy = false;
  message = '';
  failure = '';
  view: View = 'overview';
  signingToken = window.location.pathname.startsWith('/assinar/') ? window.location.pathname.split('/')[2] : null;
  signingCode = '';
  signingPreview?: {documentUrl:string; sha256:string; terms:string};
  signingSent = false;
  signingDone = false;
  termsAccepted = false;
  data: any = { employees:[], products:[], variants:[], lots:[], sheets:[], states:[], movements:[], audits:[] };
  editingProductId = '';
  editingEmployeeId = '';
  product: any = { category:'Botas',description:'',ca:'',brand:'',model:'',riskCode:'',caExpiresAt:null };
  variant: any = { productId:'',size:'Único',sku:'',minimumStock:2 };
  lot: any = { variantId:'',batchCode:'',supplier:'',receivedAt:today(),expiresAt:null };
  receive: any = { lotId:'',quantity:1,reason:'' };
  employee: any = { name:'',registration:'',department:'',jobTitle:'',admissionDate:today(),terminationDate:null,personalEmail:null };
  verifyEmployeeId = '';
  verifyCode = '';
  sheetEmployeeId = '';
  documentDate = today();
  sheetMethod: 'MANUAL'|'ELECTRONIC' = 'MANUAL';
  draft: Array<{variantId:string;lotId:string;quantity:1;risk:string}> = [];
  lastSheetId = '';
  lastLink = '';
  receiptSheetId = '';
  receiptNote = '';
  receiptMethod: 'IN_PERSON'|'EMPLOYEE_DECLARATION' = 'IN_PERSON';

  async ngOnInit() {
    try {
      const publicConfig: {supabaseUrl:string;publishableKey:string;faceMatchEnabled:boolean} = await this.get('/api/config');
      this.config = publicConfig;
      this.client = createClient(publicConfig.supabaseUrl,publicConfig.publishableKey);
      const {data} = await this.client.auth.getSession();
      this.userEmail = data.session?.user.email ?? '';
      if (this.userEmail && !this.signingToken) await this.load();
      if (this.signingToken) await this.get(`/api/sign/${this.signingToken}`);
    } catch (e) { this.failure = this.textError(e); }
  }

  get isStock() { return ['ADMIN','ALMOXARIFADO'].includes(this.data.role); }
  get isHr() { return ['ADMIN','RH','SEGURANCA'].includes(this.data.role); }
  get canReceipt() { return ['ADMIN','RH','SEGURANCA','ALMOXARIFADO'].includes(this.data.role); }
  get lowStock() { return this.data.variants.filter((v:any) => this.variantStock(v.id) <= v.minimum_stock).length; }
  get pendingSheets() { return this.data.sheets.filter((s:any) => this.state(s.id)?.signature_status === 'PENDING').length; }
  state(id:string): any { return this.data.states.find((x:any) => x.sheet_id === id); }
  productById(id:string): any { return this.data.products.find((x:any) => x.id === id); }
  variantById(id:string): any { return this.data.variants.find((x:any) => x.id === id); }
  employeeById(id:string): any { return this.data.employees.find((x:any) => x.id === id); }
  variantStock(id:string): number { return this.data.lots.filter((x:any) => x.variant_id === id).reduce((sum:number,x:any) => sum+x.stock_quantity,0); }
  lotsFor(id:string): any[] { return this.data.lots.filter((x:any) => x.variant_id === id && x.stock_quantity > 0 && (!x.expires_at || x.expires_at >= today())); }
  formatDate(value:string): string { return value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'}) : '—'; }
  roleLabel(): string { return ({ADMIN:'Administração',ALMOXARIFADO:'Almoxarifado',RH:'Recursos Humanos',SEGURANCA:'Segurança do Trabalho'} as any)[this.data.role] ?? 'Acesso'; }

  async login() {
    await this.run(async () => {
      if (!this.client) throw new Error('Conexão ainda não disponível.');
      const {data,error} = await this.client.auth.signInWithPassword({email:this.loginEmail,password:this.loginPassword});
      if (error) throw error;
      this.userEmail = data.user.email ?? '';
      await this.load();
    },'Bem-vindo ao EPI ERP.');
  }
  async logout() { await this.client?.auth.signOut(); this.userEmail=''; this.data={employees:[],products:[],variants:[],lots:[],sheets:[],states:[],movements:[]}; }
  async load() { this.data = await this.request('/api/bootstrap'); }
  select(view: View) { this.view=view; this.failure=''; this.message=''; }

  editProduct(value:any) { this.editingProductId=value.id; this.product={category:value.category,description:value.description,ca:value.ca ?? '',brand:value.brand,model:value.model,riskCode:value.risk_code,caExpiresAt:value.ca_expires_at}; this.view='stock'; }
  async saveProduct() { await this.run(async () => { await this.request(this.editingProductId ? `/api/products/${this.editingProductId}` : '/api/products',this.editingProductId ? 'PATCH' : 'POST',{...this.product,ca:this.product.ca || null,caExpiresAt:this.product.caExpiresAt || null}); await this.load(); this.editingProductId=''; this.product={category:'Botas',description:'',ca:'',brand:'',model:'',riskCode:'',caExpiresAt:null}; },this.editingProductId ? 'Equipamento atualizado.' : 'EPI cadastrado. Cadastre o tamanho/modelo e o lote.'); }
  async saveVariant() { await this.run(async () => { await this.request('/api/variants','POST',this.variant); await this.load(); this.variant={productId:'',size:'Único',sku:'',minimumStock:2}; },'Variação cadastrada.'); }
  async saveLot() { await this.run(async () => { await this.request('/api/lots','POST',{...this.lot,expiresAt:this.lot.expiresAt || null}); await this.load(); this.lot={variantId:'',batchCode:'',supplier:'',receivedAt:today(),expiresAt:null}; },'Lote cadastrado. Registre a entrada para disponibilizar estoque.'); }
  async receiveStock() { await this.run(async () => { await this.request(`/api/lots/${this.receive.lotId}/receive`,'POST',{quantity:Number(this.receive.quantity),reason:this.receive.reason}); await this.load(); this.receive={lotId:'',quantity:1,reason:''}; },'Entrada registrada no histórico.'); }
  editEmployee(value:any) { this.editingEmployeeId=value.id; this.employee={name:value.name,registration:value.registration,department:value.department,jobTitle:value.job_title,admissionDate:value.admission_date,terminationDate:value.termination_date,personalEmail:value.personal_email}; }
  async saveEmployee() { await this.run(async () => { await this.request(this.editingEmployeeId ? `/api/employees/${this.editingEmployeeId}` : '/api/employees',this.editingEmployeeId ? 'PATCH' : 'POST',{...this.employee,personalEmail:this.employee.personalEmail || null,terminationDate:this.employee.terminationDate || null}); await this.load(); this.editingEmployeeId=''; this.employee={name:'',registration:'',department:'',jobTitle:'',admissionDate:today(),terminationDate:null,personalEmail:null}; },this.editingEmployeeId ? 'Colaborador atualizado.' : 'Colaborador cadastrado. Biometria é facultativa e ficará para a segunda etapa.'); }
  async sendVerification() { await this.run(async () => { await this.request(`/api/employees/${this.verifyEmployeeId}/send-verification`,'POST',{}); },'Código enviado ao e-mail pessoal cadastrado.'); }
  async verifyEmail() { await this.run(async () => { await this.request('/api/verify-email','POST',{employeeId:this.verifyEmployeeId,code:this.verifyCode},false); await this.load(); this.verifyCode=''; },'E-mail verificado.'); }
  addItem(v:any) {
    const lot = this.lotsFor(v.id)[0];
    if (!lot) { this.failure='Não há lote válido com estoque para esse tamanho.'; return; }
    this.draft.push({variantId:v.id,lotId:lot.id,quantity:1,risk:this.productById(v.product_id)?.risk_code ?? ''});
    this.failure='';
  }
  removeItem(index:number) { this.draft.splice(index,1); }
  async issueSheet() {
    await this.run(async () => {
      const sheet = await this.request('/api/sheets','POST',{employeeId:this.sheetEmployeeId,documentDate:this.documentDate,method:this.sheetMethod,items:this.draft});
      this.lastSheetId=sheet.id; this.lastLink=''; this.draft=[];
      await this.load(); this.view='history';
    },this.sheetMethod === 'MANUAL' ? 'Ficha emitida. Baixe e imprima para assinatura presencial.' : 'Ficha emitida. Gere um link para assinatura eletrônica.');
  }
  async createLink(id:string) {
    await this.run(async () => { const value = await this.request(`/api/sheets/${id}/signing-links`,'POST',{}); this.lastSheetId=id; this.lastLink=value.url; },'Link gerado. Compartilhe por canal separado do e-mail usado para o código.');
  }
  async copyLink() { if (this.lastLink) { await navigator.clipboard.writeText(this.lastLink); this.message='Link copiado.'; } }
  async confirmReceipt() { await this.run(async () => { await this.request(`/api/sheets/${this.receiptSheetId}/receipt`,'POST',{method:this.receiptMethod,note:this.receiptNote}); await this.load(); this.receiptNote=''; },'Recebimento físico registrado separadamente.'); }
  async recordManualSignature(id:string) { const note=window.prompt('Confirme que a ficha impressa foi assinada presencialmente. Registre onde o original assinado está arquivado:'); if (!note?.trim()) return; await this.run(async () => { await this.request(`/api/sheets/${id}/manual-signature`,'POST',{note:note.trim()}); await this.load(); },'Assinatura presencial registrada. A confirmação da entrega física continua separada.'); }
  async download(id:string,kind:'pdf'|'xlsx') {
    await this.run(async () => {
      const session = (await this.client?.auth.getSession())?.data.session;
      const response = await fetch(`${this.apiBaseUrl}/api/sheets/${id}/${kind}`,{headers:{Authorization:`Bearer ${session?.access_token}`}});
      if (!response.ok) throw new Error((await response.json()).error ?? 'Falha ao baixar.');
      const blob=await response.blob(); const url=URL.createObjectURL(blob);
      const link=document.createElement('a'); link.href=url; link.download=`ficha-${id}.${kind}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url),60_000);
    });
  }
  async requestCode() { await this.run(async () => { await this.request(`/api/sign/${this.signingToken}/code`,'POST',{},false); this.signingSent=true; },'Código enviado ao e-mail verificado.'); }
  async preview() { await this.run(async () => { this.signingPreview=await this.request(`/api/sign/${this.signingToken}/preview`,'POST',{code:this.signingCode},false); },'Confira o documento completo antes de assinar.'); }
  async sign() { await this.run(async () => { if (!this.signingPreview) throw new Error('Visualize o documento primeiro.'); await this.request(`/api/sign/${this.signingToken}/confirm`,'POST',{code:this.signingCode,acceptedTerms:this.termsAccepted},false); this.signingDone=true; this.signingPreview=undefined; },'Assinatura registrada. O recebimento físico ainda requer confirmação separada.'); }

  private async run(action:()=>Promise<void>,success='') {
    this.busy=true; this.failure=''; this.message='';
    try { await action(); if (success) this.message=success; }
    catch (e) { this.failure=this.textError(e); }
    finally { this.busy=false; }
  }
  private textError(e:unknown) { return e instanceof Error ? e.message : 'Ocorreu uma falha. Tente novamente.'; }
  private async get(path:string) { const response=await fetch(`${this.apiBaseUrl}${path}`); if (!response.ok) throw new Error('API indisponível. Inicie a API e confira a configuração.'); return response.json(); }
  private async request(path:string,method='GET',body?:unknown,authenticated=true):Promise<any> {
    const session=authenticated ? (await this.client?.auth.getSession())?.data.session : null;
    const response=await fetch(`${this.apiBaseUrl}${path}`,{method,headers:{'Content-Type':'application/json',...(authenticated ? {Authorization:`Bearer ${session?.access_token}`} : {})},body:body === undefined ? undefined : JSON.stringify(body)});
    const value=await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error ?? `Falha ${response.status}`);
    return value;
  }
}
