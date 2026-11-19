# Design

1. **Parts, not multipart:** raw `application/octet-stream` parts of exactly 5 MB (the last may be shorter) avoid a multipart dependency, make retries idempotent per part, and let the app show progress per part. The JSON body limit stays 1 MB; only octet-stream allows a part plus a little.
2. **Bytes are checked, not trusted:** signatures for PDF, PNG, JPEG, WebP; `.docx` must be a zip that contains `word/document.xml`; text must be valid UTF-8 without control characters. The file name's extension must fit the declared type. Display names are stripped of paths and control characters; storage keys are always server-generated UUID paths and the local adapter refuses any key that could leave its folder.
3. **Completing once:** the upload row is locked `FOR UPDATE` in the completing transaction; a second complete waits and returns the same file, and the bytes it wrote are removed. Bytes are written before the transaction and removed if it fails; on replace the old bytes go only after commit.
4. **Links:** HMAC-SHA256 over (resource, subject, download, expiry) with a key derived from `ACCESS_TOKEN_SECRET`; 5-minute lifetime; checked again on every byte request, including that downloads are still allowed.
5. **Access:** the same rule as lesson text (free preview, or an active entitlement), reusing the lessons service, so the two can never disagree.
6. **Cleanup:** periodic, idempotent, safe on several instances; skips bytes younger than one hour.
