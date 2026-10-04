-- Production SOP is an optional reference/checkoff tool.
-- Batch completion must not be blocked by recipe-step confirmations.
-- Spun-honey provenance and base-honey safeguards remain enforced.

create or replace function public.nfos_validate_batch_completion_control()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_spun_allowed boolean;
  v_base_oz numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(spun_eligible, false)
    into v_spun_allowed
    from public.nfos_recipes
    where id = new.recipe_id;

    if new.texture = 'spun' then
      if not v_spun_allowed then
        raise exception 'This recipe is not approved for spun honey.';
      end if;

      if nullif(btrim(new.seed_source_batch_code), '') is null then
        raise exception 'Record the prior natural spun-honey seed batch before completing this batch.';
      end if;

      if new.seed_actual_quantity is null or new.seed_actual_quantity <= 0 then
        raise exception 'Record the actual natural spun-honey seed quantity before completing this batch.';
      end if;

      select public.nfos_convert_weight(bi.quantity, bi.unit, 'oz')
      into v_base_oz
      from public.nfos_batch_inputs bi
      join public.nfos_recipe_inputs ri on ri.id = bi.recipe_input_id
      where bi.batch_id = new.id
        and ri.is_base
      limit 1;

      if v_base_oz is null then
        raise exception 'Actual base honey usage must be recorded before completing a spun batch.';
      end if;

      new.seed_expected_quantity := round(v_base_oz * 0.10, 4);
      new.seed_unit := coalesce(nullif(btrim(new.seed_unit), ''), 'oz');
    end if;
  end if;

  return new;
end;
$$;

comment on function public.nfos_validate_batch_completion_control()
is 'Validates batch completion safety controls. Production SOP step confirmations are optional and do not gate completion.';
