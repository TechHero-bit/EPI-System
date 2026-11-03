-- MIGRATION 008 - Assinatura por nome, com consentimento versionado e evidência imutável.
alter table public.signatures add column signer_name text, add column signature_style text,
 add column terms_version text, add column terms_text text;
alter table public.signatures add constraint signature_style_valid check(signature_style in('classic','handwritten','elegant'));
drop function public.complete_signature(uuid,text,inet,text);
create function public.complete_signature(p_link uuid,p_otp_hash text,p_ip inet,p_agent text,
 p_signer_name text,p_signature_style text,p_terms_version text,p_terms_text text,p_accepted_terms boolean)
returns uuid language plpgsql security definer set search_path=''as $$
declare l public.signing_links%rowtype;s public.sheets%rowtype;e public.employees%rowtype;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.expires_at<=now()then raise exception 'Link inválido ou expirado';end if;
 if l.attempts>=5 or l.otp_hash is null or l.otp_expires_at<=now()or l.otp_hash<>p_otp_hash or l.previewed_at is null then raise exception 'Código inválido ou expirado';end if;
 select * into s from public.sheets where id=l.sheet_id;
 select * into e from public.employees where id=s.employee_id for update;
 if e.email_verified_at is null or s.signature_method<>'ELECTRONIC' or l.recipient_email is distinct from e.personal_email or l.recipient_verified_at is distinct from e.email_verified_at then raise exception 'Canal verificado mudou. Gere um novo link';end if;
 if exists(select 1 from public.signatures where sheet_id=s.id)then raise exception 'Ficha já assinada';end if;
 if p_accepted_terms is distinct from true or p_terms_version is distinct from 'EPI-ELECTRONIC-SIMPLE-V2' or length(coalesce(p_terms_text,''))<100 then raise exception 'Aceite do termo atual obrigatório';end if;
 if p_signature_style is null or p_signature_style not in('classic','handwritten','elegant')then raise exception 'Estilo de assinatura inválido';end if;
 if p_signer_name is null or length(trim(p_signer_name)) not between 2 and 180 or lower(regexp_replace(trim(p_signer_name),'\s+',' ','g')) is distinct from lower(regexp_replace(trim(s.snapshot->'employee'->>'name'),'\s+',' ','g')) then raise exception 'Informe o nome completo do titular da ficha';end if;
 insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent,signer_name,signature_style,terms_version,terms_text)
 values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500),trim(p_signer_name),p_signature_style,p_terms_version,p_terms_text);
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and consumed_at is null;
 update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now()where sheet_id=s.id;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256,'termsVersion',p_terms_version));
 return s.id;
end $$;
revoke all on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)from public,anon,authenticated;
grant execute on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)to service_role;
create or replace function public.record_signature_evidence()returns trigger language plpgsql set search_path=''as $$
declare v_employee uuid;v_version integer;v_verified timestamptz;
begin
 select employee_id,version into v_employee,v_version from public.sheets where id=new.sheet_id;
 select recipient_verified_at into v_verified from public.signing_links where id=new.link_id;
 insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object(
 'sha256',new.document_sha256,'documentVersion',v_version,'employeeId',v_employee,'acceptedTerms',new.accepted_terms,
 'termsVersion',coalesce(new.terms_version,'EPI-ELECTRONIC-SIMPLE-V1'),'termsText',new.terms_text,
 'signerName',new.signer_name,'signatureStyle',new.signature_style,'signedAtUtc',new.signed_at,
 'channelVerifiedAt',v_verified,'authentication',case when new.method='ELECTRONIC_SIMPLE'then 'VERIFIED_EMAIL_OTP'else 'OPERATOR_ATTESTATION'end));return new;
end $$;
