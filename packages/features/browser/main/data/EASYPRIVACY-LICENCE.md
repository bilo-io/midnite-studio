# EasyPrivacy — licence record

`easyprivacy.generated.ts` is a data derivative of **EasyPrivacy** (https://easylist.to/easylist/easyprivacy.txt),
© The EasyList authors (https://easylist.to/). Version, date and the SHA-256 of the source file it was
generated from are in `EASYPRIVACY_META` at the top of that file.

Licence (https://easylist.to/pages/licence.html): "Unless otherwise noted, the contents of the EasyList
repository is dual licensed under the GNU General Public License version 3 of the License, or (at your
option) any later version, and Creative Commons Attribution-ShareAlike 3.0 Unported, or (at your option)
any later version. You may use and/or modify the files as permitted by either licence; if required,
"The EasyList authors (https://easylist.to/)" should be attributed as the source of the material."

Why this list and not another (Phase 117 Decision 4):

- It is consumed at runtime as **data** by `../filter-list.ts`; the app's code does not link it.
  We redistribute it under **CC BY-SA 3.0** (attribution above; the generated file is the
  share-alike derivative, kept filtered to the host-anchored rules and otherwise unmodified).
  The full licence texts are in the EasyList repository (https://github.com/easylist/easylist).
- DuckDuckGo Tracker Radar is CC BY-NC-SA: the non-commercial clause rules it out for an app that may be sold.

Refreshing: `node packages/features/browser/scripts/gen-easyprivacy.mjs` and commit. The bundled copy
refreshes with the app; there is no runtime fetch.
