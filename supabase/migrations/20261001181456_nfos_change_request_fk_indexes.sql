create index if not exists nfos_change_requests_requested_by_user_idx
  on public.nfos_change_requests(requested_by_user_id);

create index if not exists nfos_change_requests_reviewed_by_idx
  on public.nfos_change_requests(reviewed_by);
