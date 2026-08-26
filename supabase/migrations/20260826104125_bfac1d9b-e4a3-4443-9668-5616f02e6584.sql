create extension if not exists pgcrypto with schema extensions;

create or replace function public.encrypt_token(p_token text, p_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select encode(extensions.pgp_sym_encrypt(p_token, p_key), 'base64')
$$;

create or replace function public.decrypt_token(p_encrypted text, p_key text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return extensions.pgp_sym_decrypt(decode(p_encrypted, 'base64'), p_key);
exception when others then
  return null;
end;
$$;

revoke all on function public.encrypt_token(text, text) from public;
revoke all on function public.encrypt_token(text, text) from anon;
revoke all on function public.encrypt_token(text, text) from authenticated;
revoke all on function public.decrypt_token(text, text) from public;
revoke all on function public.decrypt_token(text, text) from anon;
revoke all on function public.decrypt_token(text, text) from authenticated;
grant execute on function public.encrypt_token(text, text) to service_role;
grant execute on function public.decrypt_token(text, text) to service_role;