-- Widen educator_reviews.comment from <=1500 to <=4000 chars so longer legacy testimonials import
-- as-is (one migrated review is 1529 chars). Idempotent: drops whatever the existing comment-length
-- CHECK is named (the original was an inline auto-named constraint) and re-adds it named.
-- Hand-authored (db diff is not used for this repo); mirrors the schema file change in 02_schema.sql.

do $$
declare cn text;
begin
  for cn in
    select conname from pg_constraint
    where conrelid = 'public.educator_reviews'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length(comment)%'
  loop
    execute format('alter table public.educator_reviews drop constraint %I', cn);
  end loop;
  alter table public.educator_reviews
    add constraint educator_reviews_comment_len
    check (char_length(trim(comment)) > 0 and char_length(comment) <= 4000);
end $$;
