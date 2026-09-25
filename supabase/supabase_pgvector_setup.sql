-- 1. Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 2. Create a table to store your overall PDF documents
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create a table to store the text chunks from the PDFs and their embeddings
create table if not exists public.document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade,
  content text not null, -- The actual textual paragraph from the PDF
  embedding vector(768) -- Gemini text-embedding-004 uses exactly 768 dimensions
);

-- 4. Create an index on the embedding column for extremely fast vector similarity search
create index on public.document_chunks using hnsw (embedding vector_cosine_ops);

-- 5. Create a Postgres RPC function to perform the similarity search
create or replace function match_document_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
