Lorem fixture for tests and dev.ts — contains no course content.

The folder `pq_essentiel/` has the shape of the real private asset tree (`tcv.course_assets` names are the paths
relative to this folder) so `dev.ts` and the tests can serve a course end to end. Every text is lorem ipsum, every
figure is invented, and the workbook and the data pack hold nothing but placeholders.

The real course (modules, workbooks, data, quiz and its key) is PRIVATE: it never goes into this public repository.

Regenerate the two binaries (and their sizes in `manifest.json`):

    TZ=UTC deno run -A supabase/functions/api/tests/fixtures/course/make_course_fixture.ts

`modules/module-02.html` carries an inert sanitizer trap (event handler, `script type="text/plain"`, `img` without
`src`, `javascript:` link, `style`) used by the reader's end-to-end test: it must come out of the reader's
sanitizer with none of them.
