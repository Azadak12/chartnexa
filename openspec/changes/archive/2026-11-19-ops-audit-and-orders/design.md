# Design
- Reuses `GET /staff/audit-events` and `GET /staff/orders`; no server change. Responses are validated against the shared schemas.
- Both lists use `staleTime: 0` so changing a filter back shows current data, not a cached page.
- People are shown by the first 8 characters of their id; details show full ids so an Admin can search them. Audit records already hold ids and codes only (no secrets), so showing before and after is safe.
- Entries on Profile depend on `access.permissions`; hiding them is convenience, the server refuses others (403).
