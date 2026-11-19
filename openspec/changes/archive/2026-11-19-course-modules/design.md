# Design

1. **Order invariant:** `renumberLessons` rewrites positions with `row_number() OVER (ORDER BY module.position NULLS FIRST, (id = moved) , position, id)`. Lesson positions are a deferred unique pair, so the rewrite is checked at commit. Every write that can change grouping (lesson create, lesson reorder, move, module reorder, module delete) calls it inside the transaction that holds the course row lock, so readers always see a grouped, gapless order.
2. **Concurrency:** all module and lesson writes for a course take the same course row lock; module positions are a deferred unique pair too.
3. **Same-course rule:** `lessons (module_id, course_id) REFERENCES course_modules (id, course_id)`, so the database refuses a module of another course; the service checks first to answer a field error.
4. **Responses:** module writes answer with the full staff list (lessons and modules), so the app redraws from one response.
