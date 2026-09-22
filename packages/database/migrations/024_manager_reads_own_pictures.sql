-- A picture you just uploaded is a picture you can see.
--
-- app.asset_readable follows a live reference: an asset is readable through a
-- guide that refers to it, or through a thing whose picture it is. That is the
-- right rule for a reader, and it was applied to the author too. So the editor
-- asked for the bytes of the picture it had just uploaded and got 404, drawing
-- a broken image — on the freshly uploaded picture, on every picture already on
-- a step whose draft had not been saved since, and on every thumbnail in "Use
-- one already added", which lists assets it then cannot display.
--
-- The row policy has said the right thing since 019: a manager sees the assets
-- of the workspace they manage, referenced or not. Only this function
-- disagreed, so the two answered differently about the same asset.
--
-- Scoped to managers of that one workspace, and only to assets that are in it.
-- Without that second half, somebody who manages two workspaces could read any
-- asset id through whichever one they liked, since the id alone says nothing
-- about where it lives. A reader's access is unchanged: it still follows a
-- reference, so an unreferenced picture, a withdrawn release and a members-only
-- guide all stay 404 to everyone else.

CREATE OR REPLACE FUNCTION app.asset_readable(w text, a text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT app.in_scope(w) AND app.actor_allowed() AND (
    (
      app.member_manages(w)
      AND EXISTS(SELECT 1 FROM app.asset WHERE workspace_id = w AND id = a)
    )
    OR EXISTS(
      SELECT 1
      FROM app.asset_reference ref
      JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
      WHERE ref.workspace_id = w
        AND ref.asset_id = a
        AND g.state NOT IN ('redacted', 'withdrawn')
        AND (
          (ref.release_number = 0 AND app.member_manages(w))
          OR (ref.release_number = g.current_release AND app.release_readable(w, g.id))
        )
    )
    OR EXISTS(
      SELECT 1 FROM app.category c
      WHERE c.workspace_id = w AND c.image_asset_id = a AND app.category_readable(w, c.id)
    )
  )
$function$;
