-- PDFs are written once by the server to a private bucket at tenant/version.pdf.
-- No browser role can list, upload, overwrite or delete these retained documents.
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-report-pdfs', 'visit-report-pdfs', false, 20971520,
  array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;
