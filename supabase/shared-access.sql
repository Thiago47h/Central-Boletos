
begin;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"central_access":true,"central_admin":true}'::jsonb where id='24e04247-35c4-4e62-ab93-2229322a7b28';
create schema if not exists central_private;
revoke all on schema central_private from public,anon,authenticated;
create function central_private.require_admin_created_account() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(new.raw_app_meta_data->>'central_access','false') <> 'true' then
 raise exception 'Cadastro público desativado. Solicite acesso ao administrador.' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function central_private.require_admin_created_account() from public,anon,authenticated;
create trigger central_admin_created_accounts before insert on auth.users for each row execute function central_private.require_admin_created_account();
alter table public.boletos drop constraint bill_path_owner, drop constraint receipt_path_owner;
alter table public.boletos add constraint bill_path_format check (bill_path is null or bill_path ~ '^[0-9a-f-]{36}/bill_[0-9a-f-]{36}$'),
add constraint receipt_path_format check (receipt_path is null or receipt_path ~ '^[0-9a-f-]{36}/receipt_[0-9a-f-]{36}$');
drop policy boletos_select_own on public.boletos;
drop policy boletos_insert_own on public.boletos;
drop policy boletos_update_own on public.boletos;
drop policy boletos_delete_own on public.boletos;
create policy boletos_team_select on public.boletos for select to authenticated using ((select auth.jwt())->'app_metadata'->>'central_access'='true');
create policy boletos_team_insert on public.boletos for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'central_access'='true' and owner_id=(select auth.uid()));
create policy boletos_team_update on public.boletos for update to authenticated using ((select auth.jwt())->'app_metadata'->>'central_access'='true') with check ((select auth.jwt())->'app_metadata'->>'central_access'='true');
create policy boletos_team_delete on public.boletos for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'central_access'='true');
drop policy central_files_select_own on storage.objects;
drop policy central_files_insert_own on storage.objects;
drop policy central_files_update_own on storage.objects;
drop policy central_files_delete_own on storage.objects;
create policy central_files_team on storage.objects for all to authenticated
 using (bucket_id in ('boletos','comprovantes') and (select auth.jwt())->'app_metadata'->>'central_access'='true')
 with check (bucket_id in ('boletos','comprovantes') and (select auth.jwt())->'app_metadata'->>'central_access'='true');
commit;