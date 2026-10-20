-- Vincula cada desafio ao canal verificado no momento da criação do link.
alter table public.signing_links add column recipient_email text, add column recipient_verified_at timestamptz;
create or replace function public.complete_signature(p_link uuid,p_otp_hash text,p_ip inet,p_agent text)returns uuid language plpgsql security definer set search_path=''as $$
declare l public.signing_links%rowtype;s public.sheets%rowtype;e public.employees%rowtype;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.expires_at<=now()then raise exception 'Link inválido ou expirado';end if;
 if l.attempts>=5 or l.otp_hash is null or l.otp_expires_at<=now()or l.otp_hash<>p_otp_hash or l.previewed_at is null then raise exception 'Código inválido ou expirado';end if;
 select * into s from public.sheets where id=l.sheet_id;
 select * into e from public.employees where id=s.employee_id for update;
 if e.email_verified_at is null or s.signature_method<>'ELECTRONIC' or l.recipient_email is distinct from e.personal_email or l.recipient_verified_at is distinct from e.email_verified_at then raise exception 'Canal verificado mudou. Gere um novo link';end if;
 if exists(select 1 from public.signatures where sheet_id=s.id)then raise exception 'Ficha já assinada';end if;
 insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent)values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500));
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and consumed_at is null;
 update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now()where sheet_id=s.id;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256));return s.id;
end $$;
create or replace function public.record_signature_evidence()returns trigger language plpgsql set search_path=''as $$
declare v_employee uuid;v_version integer;v_verified timestamptz;
begin
 select employee_id,version into v_employee,v_version from public.sheets where id=new.sheet_id;
 select recipient_verified_at into v_verified from public.signing_links where id=new.link_id;
 insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object('sha256',new.document_sha256,'documentVersion',v_version,'employeeId',v_employee,'acceptedTerms',new.accepted_terms,'termsVersion','EPI-ELECTRONIC-SIMPLE-V1','signedAtUtc',new.signed_at,'channelVerifiedAt',v_verified,'authentication',case when new.method='ELECTRONIC_SIMPLE'then 'VERIFIED_EMAIL_OTP'else 'OPERATOR_ATTESTATION'end));return new;
end $$;
create trigger signature_evidence_immutable before update or delete on public.signature_evidences for each row execute function public.reject_sheet_change();
create function public.audit_catalog_write()returns trigger language plpgsql security definer set search_path=''as $$
declare v_org uuid;
begin
 if tg_table_name in('products','employees')then v_org:=new.organization_id;
 elsif tg_table_name='variants'then select organization_id into v_org from public.products where id=new.product_id;
 elsif tg_table_name='lots'then select p.organization_id into v_org from public.variants v join public.products p on p.id=v.product_id where v.id=new.variant_id;end if;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(v_org,'CATALOG_'||tg_op,tg_table_name,new.id,jsonb_build_object('databaseTrigger',true));return new;
end $$;
revoke all on function public.audit_catalog_write()from public,anon,authenticated;
create trigger products_audit after insert or update on public.products for each row execute function public.audit_catalog_write();
create trigger employees_audit after insert or update on public.employees for each row execute function public.audit_catalog_write();
create trigger variants_audit after insert or update on public.variants for each row execute function public.audit_catalog_write();
create trigger lots_created_audit after insert on public.lots for each row execute function public.audit_catalog_write();
