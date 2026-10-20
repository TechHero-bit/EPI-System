create function public.record_manual_signature(p_org uuid, p_actor uuid, p_sheet uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sheet public.sheets%rowtype;
begin
  select * into v_sheet from public.sheets
    where id=p_sheet and organization_id=p_org for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if v_sheet.signature_method <> 'MANUAL' then raise exception 'Ficha configurada para assinatura eletrônica'; end if;
  if not exists (select 1 from public.sheet_state where sheet_id=p_sheet and signature_status='PENDING' for update)
     or exists (select 1 from public.signatures where sheet_id=p_sheet) then
    raise exception 'Ficha já possui registro de assinatura';
  end if;
  insert into public.signatures(sheet_id,method,accepted_terms,document_sha256,actor_id,note)
    values(p_sheet,'MANUAL_RECORDED',true,v_sheet.pdf_sha256,p_actor,p_note);
  update public.sheet_state set signature_status='SIGNED_MANUAL',updated_at=now() where sheet_id=p_sheet;
  insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
    values(p_org,p_actor,'MANUAL_SIGNATURE_RECORDED','sheet',p_sheet,'{}'::jsonb);
end $$;
revoke all on function public.record_manual_signature(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.record_manual_signature(uuid,uuid,uuid,text) to service_role;
