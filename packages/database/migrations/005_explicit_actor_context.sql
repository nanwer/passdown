CREATE OR REPLACE FUNCTION app.actor_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(
  current_setting('guide.actor_active',true)='true'
  AND (
   (current_setting('guide.actor_kind',true)='anonymous' AND current_setting('guide.actor_id',true)='')
   OR (current_setting('guide.actor_kind',true)='user' AND app.actor_id() IS NOT NULL AND EXISTS(SELECT 1 FROM public.auth_user u WHERE u.id=app.actor_id() AND u.active AND u.email_verified))
  ),false)
$$;
