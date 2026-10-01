
create or replace function public.nfos_void_unused_lot(
  p_lot_id uuid,
  p_reason text default 'Typo / entry error'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lot public.nfos_lots%rowtype;
  v_bad_movement_count integer := 0;
  v_batch_ref_count integer := 0;
  v_balance record;
  v_removed numeric := 0;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into v_lot
  from public.nfos_lots
  where id=p_lot_id
  for update;

  if v_lot.id is null then
    raise exception 'Lot not found.';
  end if;

  select
    (select count(*) from public.nfos_batch_inputs where lot_id=p_lot_id) +
    (select count(*) from public.nfos_batch_outputs where lot_id=p_lot_id)
  into v_batch_ref_count;

  if v_batch_ref_count > 0 then
    raise exception 'This lot has already been used in production and cannot be deleted. Use an inventory correction instead.';
  end if;

  select count(*)
  into v_bad_movement_count
  from public.nfos_inventory_transactions
  where lot_id=p_lot_id
    and movement_type not in ('receipt');

  if v_bad_movement_count > 0 then
    raise exception 'This lot has inventory history beyond its original receipt and cannot be deleted safely.';
  end if;

  for v_balance in
    select location_id,on_hand
    from public.nfos_lot_balances
    where lot_id=p_lot_id
      and on_hand > 0
  loop
    perform public.nfos_record_inventory_movement(
      v_lot.item_id,
      v_balance.on_hand,
      v_balance.location_id,
      null,
      'adjustment_remove',
      p_lot_id,
      'lot_void',
      p_lot_id::text,
      null,
      concat('Lot removed from active inventory: ', coalesce(nullif(btrim(p_reason),''),'Typo / entry error')),
      now(),
      'lot_void'
    );
    v_removed := v_removed + v_balance.on_hand;
  end loop;

  update public.nfos_lots
  set
    status='rejected',
    notes=concat_ws(
      E'\n',
      nullif(notes,''),
      concat(
        'VOIDED ',
        to_char(now(),'YYYY-MM-DD HH24:MI:SS TZ'),
        ': ',
        coalesce(nullif(btrim(p_reason),''),'Typo / entry error')
      )
    ),
    updated_at=now()
  where id=p_lot_id;

  return jsonb_build_object(
    'lot_id',p_lot_id,
    'lot_code',v_lot.lot_code,
    'status','rejected',
    'quantity_removed',v_removed
  );
end;
$$;

revoke all on function public.nfos_void_unused_lot(uuid,text) from public, anon;
grant execute on function public.nfos_void_unused_lot(uuid,text) to authenticated;
