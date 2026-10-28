-- MIGRATION 007 - Confirmação conjunta da entrega e assinatura presencial.
-- Mantém a assinatura eletrônica e a entrega física como eventos independentes.
create function public.confirm_manual_receipt(p_org uuid, p_actor uuid, p_sheet uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sheet public.sheets%rowtype;
  v_state public.sheet_state%rowtype;
begin
  if not exists (
    select 1 from public.memberships where organization_id=p_org and user_id=p_actor
      and role in ('ADMIN','RH','SEGURANCA_TRABALHO','ALMOXARIFADO')
  ) then raise exception 'Acesso negado'; end if;
  -- Same lock order as record_manual_signature, including when retried.
  select * into v_sheet from public.sheets
    where id=p_sheet and organization_id=p_org for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if v_sheet.signature_method <> 'MANUAL' then
    raise exception 'Ficha configurada para assinatura eletrônica';
  end if;
  select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
  if not found then raise exception 'Estado da ficha não encontrado'; end if;
  if v_state.reservation_status='CANCELLED' then raise exception 'Reserva cancelada'; end if;
  if length(trim(coalesce(p_note,'')))=0 or length(p_note)>500 then
    raise exception 'Informe as observações da entrega e assinatura presencial (até 500 caracteres)';
  end if;
  if v_state.signature_status='PENDING' then
    -- Reuse signature evidence, document hash, audit and existing RH permissions.
    perform public.record_manual_signature(p_org,p_actor,p_sheet,p_note);
  end if;
  -- Failure rolls back the signature too; retries cannot issue stock twice.
  perform public.confirm_receipt(p_org,p_actor,p_sheet,'IN_PERSON',p_note);
end $$;
revoke all on function public.confirm_manual_receipt(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_manual_receipt(uuid,uuid,uuid,text) to service_role;
