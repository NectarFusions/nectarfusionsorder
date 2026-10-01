create or replace function public.nfos_delete_unposted_batch(
  p_batch_id uuid,
  p_delete_production_order boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_batch public.nfos_production_batches%rowtype;
  v_order_id uuid;
  v_order_no text;
  v_input_count integer := 0;
  v_output_count integer := 0;
  v_tx_count integer := 0;
  v_other_batch_count integer := 0;
  v_order_action text := null;
begin
  if auth.uid() is null or not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into v_batch
  from public.nfos_production_batches
  where id = p_batch_id
  for update;

  if v_batch.id is null then
    raise exception 'Batch not found.';
  end if;

  if v_batch.status not in ('draft','in_progress')
     or v_batch.completed_at is not null
     or v_batch.released_at is not null then
    raise exception 'Only unposted, unfinished batches can be permanently deleted.';
  end if;

  select count(*) into v_input_count
  from public.nfos_batch_inputs
  where batch_id = v_batch.id;

  select count(*) into v_output_count
  from public.nfos_batch_outputs
  where batch_id = v_batch.id;

  select count(*) into v_tx_count
  from public.nfos_inventory_transactions
  where reference_type = 'production_batch'
    and reference_id = v_batch.id::text;

  if v_input_count > 0 or v_output_count > 0 or v_tx_count > 0 then
    raise exception
      'This batch has already posted inventory activity and cannot be permanently deleted. Use an inventory correction/cancellation workflow instead.';
  end if;

  v_order_id := v_batch.production_order_id;

  if v_order_id is not null then
    select order_no into v_order_no
    from public.nfos_production_orders
    where id = v_order_id
    for update;

    select count(*) into v_other_batch_count
    from public.nfos_production_batches
    where production_order_id = v_order_id
      and id <> v_batch.id;

    if p_delete_production_order and v_other_batch_count > 0 then
      raise exception 'The source production order has another batch and cannot be deleted with this batch.';
    end if;
  end if;

  delete from public.nfos_production_batches
  where id = v_batch.id;

  if v_order_id is not null then
    if p_delete_production_order then
      delete from public.nfos_production_orders
      where id = v_order_id;
      v_order_action := 'deleted';
    elsif v_other_batch_count = 0 then
      update public.nfos_production_orders
      set status = 'planned',
          updated_at = now()
      where id = v_order_id;
      v_order_action := 'returned_to_queue';
    else
      v_order_action := 'kept';
    end if;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'batch_id', v_batch.id,
    'batch_code', v_batch.batch_code,
    'production_order_id', v_order_id,
    'order_no', v_order_no,
    'production_order_action', v_order_action
  );
end;
$function$;

revoke all on function public.nfos_delete_unposted_batch(uuid,boolean) from public;
revoke all on function public.nfos_delete_unposted_batch(uuid,boolean) from anon;
grant execute on function public.nfos_delete_unposted_batch(uuid,boolean) to authenticated;
grant execute on function public.nfos_delete_unposted_batch(uuid,boolean) to service_role;
