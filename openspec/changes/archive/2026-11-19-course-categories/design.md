# Design

1. **Data:** `categories(id, name, version, created_at, updated_at)` with a unique index on `lower(name)` and CHECKs for length and trimming; `courses.category_id` FK `ON DELETE RESTRICT`; partial index `(category_id, published_at desc, id desc) WHERE status = 'published'` for the filter.
2. **Concurrency:** creates take a transaction advisory lock so the 50 limit holds under simultaneous requests; the unique index decides simultaneous same-name creates (the loser gets the field error). Renames compare and swap on `version`. Assigning a category to a course takes `FOR KEY SHARE` on the category row, and delete takes `FOR UPDATE` before counting courses, so a delete and an assignment cannot both succeed against each other; the FK is the last line of defense.
3. **Counts:** one grouped query returns every category with published and total course counts; the public list shows published counts only.
4. **App:** the catalog loads categories separately; if that fails, the catalog still works without the topic row. Topics with no published courses are hidden from students.
