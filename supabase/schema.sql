-- Masterclass HQ · esquema de Supabase (SPEC §4.1)
-- Una sola tabla de documentos (col, id) → data jsonb. Se corre una vez en el SQL Editor del proyecto.
-- Las funciones solo las usa la clave secreta desde las Netlify Functions: anon y authenticated no entran.

create table if not exists public.mhq_docs (
  col         text        not null,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists mhq_docs_col_creado on public.mhq_docs (col, creado);
create index if not exists mhq_docs_w          on public.mhq_docs (col, (data->>'w'));
create index if not exists mhq_docs_mes        on public.mhq_docs (col, (data->>'mes'));
create index if not exists mhq_docs_email      on public.mhq_docs (col, (data->>'email'));
create index if not exists mhq_docs_codigo     on public.mhq_docs (col, (data->>'codigoHash'));

alter table public.mhq_docs enable row level security;      -- sin políticas: nadie entra con anon/authenticated
revoke all on public.mhq_docs from anon, authenticated;
grant all on public.mhq_docs to service_role;

-- merge superficial (jsonb ||): las claves nuevas pisan, los null pisan, las que no vienen se conservan
create or replace function public.mhq_fusionar(p_col text, p_id text, p_data jsonb)
returns setof public.mhq_docs language sql as $$
  insert into public.mhq_docs as d (col, id, data) values (p_col, p_id, p_data)
  on conflict (col, id) do update set data = d.data || excluded.data, actualizado = now()
  returning *;
$$;

-- lo mismo para varios ([{id, ...}], ids sin repetir: el JS deduplica antes)
create or replace function public.mhq_fusionar_varios(p_col text, p_docs jsonb)
returns setof public.mhq_docs language sql as $$
  insert into public.mhq_docs as d (col, id, data)
  select p_col, e->>'id', e - 'id' from jsonb_array_elements(p_docs) as e
  on conflict (col, id) do update set data = d.data || excluded.data, actualizado = now()
  returning *;
$$;

-- merge solo si el documento existe (nunca inserta) y cumple p_si = {"clave": ["texto", ...]}: para cada clave, el
-- valor actual como texto (coalesce(data->>clave, ''), así '' = vacío o ausente) tiene que estar en su lista.
-- El FOR UPDATE toma la fila: otro pedido a la misma fila espera y después ve lo ya escrito. [] = no se cumplió.
create or replace function public.mhq_fusionar_si(p_col text, p_id text, p_data jsonb, p_si jsonb)
returns setof public.mhq_docs language plpgsql as $$
declare
  v_data jsonb;
begin
  select d.data into v_data from public.mhq_docs d where d.col = p_col and d.id = p_id for update;
  if not found then return; end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_si, '{}'::jsonb)) as c(k, vals)
    where not (coalesce(v_data->>c.k, '') in (select jsonb_array_elements_text(c.vals)))
  ) then return; end if;
  return query
    update public.mhq_docs d set data = d.data || p_data, actualizado = now()
    where d.col = p_col and d.id = p_id
    returning d.*;
end;
$$;

-- merge de varios solo sobre los que existen ([{id, ...}], ids sin repetir): los que no están no se crean
create or replace function public.mhq_fusionar_varios_si_existen(p_col text, p_docs jsonb)
returns setof public.mhq_docs language sql as $$
  update public.mhq_docs as d set data = d.data || (e - 'id'), actualizado = now()
  from jsonb_array_elements(p_docs) as e
  where d.col = p_col and d.id = e->>'id'
  returning d.*;
$$;

-- reemplazo con bloqueo optimista: solo si data.v coincide (CRM)
create or replace function public.mhq_reemplazar_si(p_col text, p_id text, p_data jsonb, p_v int)
returns setof public.mhq_docs language sql as $$
  update public.mhq_docs set data = p_data, actualizado = now()
  where col = p_col and id = p_id and coalesce((data->>'v')::int, 0) = p_v
  returning *;
$$;

-- contador atómico (límites de intentos)
create or replace function public.mhq_incrementar(p_col text, p_id text, p_campo text, p_n numeric)
returns numeric language sql as $$
  insert into public.mhq_docs as d (col, id, data) values (p_col, p_id, jsonb_build_object(p_campo, p_n))
  on conflict (col, id) do update
    set data = d.data || jsonb_build_object(p_campo, coalesce((d.data->>p_campo)::numeric, 0) + p_n),
        actualizado = now()
  returning (data->>p_campo)::numeric;
$$;

-- borra los documentos de una colección no tocados desde antes de p_antes (limpieza de límites y caché)
create or replace function public.mhq_borrar_viejos(p_col text, p_antes timestamptz)
returns integer language sql as $$
  with b as (delete from public.mhq_docs where col = p_col and actualizado < p_antes returning 1)
  select count(*)::int from b;
$$;

revoke execute on function public.mhq_fusionar(text,text,jsonb), public.mhq_fusionar_varios(text,jsonb),
  public.mhq_fusionar_si(text,text,jsonb,jsonb), public.mhq_fusionar_varios_si_existen(text,jsonb),
  public.mhq_reemplazar_si(text,text,jsonb,int), public.mhq_incrementar(text,text,text,numeric),
  public.mhq_borrar_viejos(text,timestamptz) from public, anon, authenticated;
grant execute on function public.mhq_fusionar(text,text,jsonb), public.mhq_fusionar_varios(text,jsonb),
  public.mhq_fusionar_si(text,text,jsonb,jsonb), public.mhq_fusionar_varios_si_existen(text,jsonb),
  public.mhq_reemplazar_si(text,text,jsonb,int), public.mhq_incrementar(text,text,text,numeric),
  public.mhq_borrar_viejos(text,timestamptz) to service_role;
