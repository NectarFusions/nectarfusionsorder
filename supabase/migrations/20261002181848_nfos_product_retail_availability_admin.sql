create or replace function nfos_private.retail_location_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_locations jsonb;
begin
  if not public.nf_is_admin() and not public.nfos_has_permission('products.manage') then
    raise exception 'Product management permission required.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',rl.id,
    'name',rl.name,
    'address_line_1',rl.address_line_1,
    'address_line_2',rl.address_line_2,
    'city',rl.city,
    'state',rl.state,
    'zip',rl.zip,
    'phone',rl.phone,
    'website',rl.website,
    'active',rl.active,
    'partner_account_id',rl.partner_account_id
  ) order by rl.sort,rl.name),'[]'::jsonb)
  into v_locations
  from public.retail_locations rl
  where rl.active;

  return jsonb_build_object('locations',v_locations);
end;
$function$;

create or replace function public.nfos_get_retail_location_directory()
returns jsonb
language sql
security invoker
set search_path=''
as $function$
  select nfos_private.retail_location_directory();
$function$;

revoke all on function public.nfos_get_retail_location_directory() from public,anon;
grant execute on function public.nfos_get_retail_location_directory() to authenticated;
