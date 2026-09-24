# Third-party notices

## Tiptap UI Components

The grouped editor toolbar primitive in `apps/web/components/studio/tiptap-primitives/toolbar.tsx`
and related layout in `rich-text-toolbar.css` adapt the toolbar and toolbar-group structure
from [Tiptap UI Components](https://github.com/ueberdosis/tiptap-ui-components), revision
`799929bea4804c73767562b69f8acc2acdb8ac86`:

- `apps/web/src/components/tiptap-ui-primitive/toolbar/toolbar.tsx`
- `apps/web/src/components/tiptap-ui-primitive/toolbar/toolbar.scss`

The application uses its own semantic design tokens, a wrapping mobile layout and local
arrow-key navigation; Radix supplies dropdown-menu and tooltip behavior. The heading and
insert controls connect to the existing bounded guide document schema. No paid Tiptap UI
components or cloud services are included.

```text
MIT License

Copyright (c) 2025 Tiptap

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Container proxy

The optional proxy image includes [Caddy](https://github.com/caddyserver/caddy) and
[caddy-ratelimit](https://github.com/mholt/caddy-ratelimit), both under Apache-2.0.
The pinned versions are recorded in `deploy/caddy/Dockerfile`. Their
[notice](deploy/caddy/NOTICE) and [Apache license](deploy/caddy/LICENSE-APACHE-2.0)
are retained in the repository and the proxy image. Passdown's proxy configuration
is AGPL-3.0-only.

The application image also includes `third-party-licenses.json`, generated from
its production package dependencies, and any linked notices emitted by the
operator bundler. Base images retain their own component notices.
