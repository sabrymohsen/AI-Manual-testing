# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cart.spec.js >> Checkout
- Location: tests/cart.spec.js:6:1

# Error details

```
Error: Could not find "Checkout now" on the page within 10 s.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - heading "Cart" [level=1] [ref=e2]
  - button "Proceed to checkout" [ref=e3]
  - link "Continue shopping" [ref=e4] [cursor=pointer]:
    - /url: "#"
  - generic [ref=e5]:
    - text: Coupon
    - textbox "Coupon" [active] [ref=e6]: SAVE10
```

# Test source

```ts
  830  |   const meta = typeof step2.actionMetadata === "string" ? safeJson(step2.actionMetadata) : step2.actionMetadata;
  831  |   return !!meta && meta.plainEnglish === true;
  832  | }
  833  | function safeJson(s) {
  834  |   try {
  835  |     return JSON.parse(s);
  836  |   } catch {
  837  |     return null;
  838  |   }
  839  | }
  840  | function lookup(vars, path) {
  841  |   const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  842  |   let cur = vars;
  843  |   for (const p of parts) {
  844  |     if (cur === null || cur === void 0) return void 0;
  845  |     cur = cur[p];
  846  |   }
  847  |   return cur;
  848  | }
  849  | function stringify(v) {
  850  |   if (v === null || v === void 0) return "";
  851  |   return typeof v === "object" ? JSON.stringify(v) : String(v);
  852  | }
  853  | function interpolate(text, vars, mode = "text") {
  854  |   return text.replace(/\{([A-Za-z_][\w-]*(?:(?:\.[\w-]+)|(?:\[\d+\]))*)\}/g, (whole, path) => {
  855  |     const value = lookup(vars, path);
  856  |     if (value === void 0) {
  857  |       if (mode === "text" && !/^[A-Za-z_][\w-]*$/.test(path.split(/[.[]/)[0])) return whole;
  858  |       throw new Error(`The variable {${path}} has no value. Set it in an earlier step (Set variable ${path.split(/[.[]/)[0]} = "\u2026") or in the test data.`);
  859  |     }
  860  |     return mode === "js" ? JSON.stringify(value) : stringify(value);
  861  |   });
  862  | }
  863  | var ROLE_OF = {
  864  |   button: "button",
  865  |   link: "link",
  866  |   checkbox: "checkbox",
  867  |   radio: "radio",
  868  |   dropdown: "combobox",
  869  |   heading: "heading",
  870  |   tab: "tab",
  871  |   image: "img",
  872  |   option: "option",
  873  |   menuitem: "menuitem",
  874  |   row: "row"
  875  | };
  876  | var CANDIDATES_OF = {
  877  |   any: "a, button, input, select, textarea, label, [role], h1, h2, h3, h4, h5, h6, p, span, div, td, th, li",
  878  |   text: "p, span, div, td, th, li, dd, dt, strong, b, em, label, h1, h2, h3, h4, h5, h6, output, [role=status]",
  879  |   button: "button, [role=button], input[type=submit], input[type=button]",
  880  |   link: "a[href], [role=link]",
  881  |   field: "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, [contenteditable=true], [role=textbox]",
  882  |   checkbox: "input[type=checkbox], [role=checkbox], [role=switch]",
  883  |   radio: "input[type=radio], [role=radio]",
  884  |   dropdown: "select, [role=combobox], [role=listbox]",
  885  |   heading: "h1, h2, h3, h4, h5, h6, [role=heading]",
  886  |   tab: "[role=tab]",
  887  |   image: "img, svg, [role=img]",
  888  |   option: "option, [role=option]",
  889  |   menuitem: "[role=menuitem]",
  890  |   row: "tr, [role=row]"
  891  | };
  892  | function byName(page, name, kind) {
  893  |   const role = ROLE_OF[kind];
  894  |   if (kind === "field") {
  895  |     return [
  896  |       page.getByLabel(name, { exact: false }),
  897  |       page.getByPlaceholder(name, { exact: false }),
  898  |       page.getByRole("textbox", { name, exact: false }),
  899  |       page.locator(`[name="${cssEscape(name)}"], #${cssIdent(name)}`)
  900  |     ];
  901  |   }
  902  |   if (kind === "dropdown") {
  903  |     return [page.getByLabel(name, { exact: false }), page.getByRole("combobox", { name, exact: false }), page.locator(`select[name="${cssEscape(name)}"]`)];
  904  |   }
  905  |   if (kind === "checkbox" || kind === "radio") {
  906  |     return [page.getByRole(role, { name, exact: false }), page.getByLabel(name, { exact: false })];
  907  |   }
  908  |   if (role) return [page.getByRole(role, { name, exact: false })];
  909  |   if (kind === "text") return [page.getByText(name, { exact: false })];
  910  |   return [
  911  |     page.getByRole("button", { name, exact: true }),
  912  |     page.getByRole("link", { name, exact: true }),
  913  |     page.getByRole("button", { name, exact: false }),
  914  |     page.getByRole("link", { name, exact: false }),
  915  |     page.getByRole("menuitem", { name, exact: false }),
  916  |     page.getByRole("tab", { name, exact: false }),
  917  |     page.getByLabel(name, { exact: false }),
  918  |     page.getByText(name, { exact: true }),
  919  |     page.getByText(name, { exact: false })
  920  |   ];
  921  | }
  922  | async function pickFirstMatch(candidates, ordinal, timeoutMs, describe) {
  923  |   const deadline = Date.now() + timeoutMs;
  924  |   for (; ; ) {
  925  |     for (const c of candidates) {
  926  |       const visible = c.filter({ visible: true });
  927  |       const count = await visible.count().catch(() => 0);
  928  |       if (count > 0) return pickVisible(c, ordinal, Math.max(1e3, deadline - Date.now()), describe);
  929  |     }
> 930  |     if (Date.now() >= deadline) throw new Error(`Could not find ${describe} on the page within ${Math.round(timeoutMs / 1e3)} s.`);
       |                                       ^ Error: Could not find "Checkout now" on the page within 10 s.
  931  |     await new Promise((r) => setTimeout(r, 200));
  932  |   }
  933  | }
  934  | function cssEscape(s) {
  935  |   return s.replace(/["\\]/g, "\\$&");
  936  | }
  937  | function cssIdent(s) {
  938  |   return /^[A-Za-z][\w-]*$/.test(s) ? s : "__no_such_id__";
  939  | }
  940  | async function pickVisible(locator, ordinal, timeoutMs, describe) {
  941  |   const visible = locator.filter({ visible: true });
  942  |   try {
  943  |     await visible.first().waitFor({ state: "visible", timeout: timeoutMs });
  944  |   } catch {
  945  |     throw new Error(`Could not find ${describe} on the page within ${Math.round(timeoutMs / 1e3)} s.`);
  946  |   }
  947  |   if (!ordinal || ordinal === 1) return visible.first();
  948  |   if (ordinal === -1) return visible.last();
  949  |   const count = await visible.count();
  950  |   if (count < ordinal) throw new Error(`Only ${count} match(es) for ${describe}; the step asks for number ${ordinal}.`);
  951  |   return visible.nth(ordinal - 1);
  952  | }
  953  | async function resolveRelative(page, target, timeoutMs, vars) {
  954  |   const anchorText = interpolate(target.anchor, vars);
  955  |   const anchor = await pickVisible(page.getByText(anchorText, { exact: false }), 1, timeoutMs, `"${anchorText}"`);
  956  |   const box = await anchor.boundingBox();
  957  |   if (!box) throw new Error(`"${anchorText}" is on the page but not visible.`);
  958  |   const candidates = page.locator(CANDIDATES_OF[target.kind === "any" ? "any" : target.kind]);
  959  |   const index = await candidates.evaluateAll(
  960  |     (els, args) => {
  961  |       const { a, relation, kind, anchorText: anchorText2 } = args;
  962  |       let best = -1;
  963  |       let bestScore = Infinity;
  964  |       els.forEach((el, i) => {
  965  |         const r = el.getBoundingClientRect();
  966  |         if (r.width < 1 || r.height < 1) return;
  967  |         const style = getComputedStyle(el);
  968  |         if (style.visibility === "hidden" || style.display === "none") return;
  969  |         if (el.contains(document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2))) return;
  970  |         const text = (el.innerText || el.value || "").trim();
  971  |         if ((kind === "text" || kind === "any") && (!text || text.length > 400 || text.includes(anchorText2))) return;
  972  |         if ((kind === "text" || kind === "any") && el.children.length > 0 && Array.from(el.children).some((ch) => (ch.innerText || "").trim() === text)) return;
  973  |         const cx = r.left + r.width / 2;
  974  |         const cy = r.top + r.height / 2;
  975  |         const overlapX = Math.min(r.right, a.x + a.width) - Math.max(r.left, a.x);
  976  |         const overlapY = Math.min(r.bottom, a.y + a.height) - Math.max(r.top, a.y);
  977  |         let d = Infinity;
  978  |         if (relation === "below" && r.top >= a.y + a.height - 2 && overlapX > -40) d = r.top - (a.y + a.height) + Math.abs(cx - (a.x + a.width / 2)) * 0.2;
  979  |         else if (relation === "above" && r.bottom <= a.y + 2 && overlapX > -40) d = a.y - r.bottom + Math.abs(cx - (a.x + a.width / 2)) * 0.2;
  980  |         else if (relation === "rightOf" && r.left >= a.x + a.width - 2 && overlapY > -8) d = r.left - (a.x + a.width) + Math.abs(cy - (a.y + a.height / 2)) * 0.5;
  981  |         else if (relation === "leftOf" && r.right <= a.x + 2 && overlapY > -8) d = a.x - r.right + Math.abs(cy - (a.y + a.height / 2)) * 0.5;
  982  |         else if (relation === "near") d = Math.hypot(cx - (a.x + a.width / 2), cy - (a.y + a.height / 2));
  983  |         if (d < bestScore) {
  984  |           bestScore = d;
  985  |           best = i;
  986  |         }
  987  |       });
  988  |       return best;
  989  |     },
  990  |     { a: box, relation: target.relation, kind: target.kind, anchorText }
  991  |   );
  992  |   if (index < 0) {
  993  |     const where = target.relation === "rightOf" ? "to the right of" : target.relation === "leftOf" ? "to the left of" : target.relation;
  994  |     throw new Error(`Found "${anchorText}", but no ${target.kind === "any" ? "element" : target.kind} ${where} it.`);
  995  |   }
  996  |   return candidates.nth(index);
  997  | }
  998  | async function resolveTarget(page, target, ctx, timeoutMs) {
  999  |   const vars = ctx.variables;
  1000 |   switch (target.by) {
  1001 |     case "css":
  1002 |       return pickVisible(page.locator(interpolate(target.selector, vars)), 1, timeoutMs, `the element matching ${target.selector}`);
  1003 |     case "testid":
  1004 |       return pickVisible(page.getByTestId(interpolate(target.id, vars)), 1, timeoutMs, `test id "${target.id}"`);
  1005 |     case "ordinal":
  1006 |       return pickVisible(page.locator(CANDIDATES_OF[target.kind]), target.ordinal, timeoutMs, `the ${target.kind}`);
  1007 |     case "relative":
  1008 |       return resolveRelative(page, target, timeoutMs, vars);
  1009 |     case "name": {
  1010 |       const name = interpolate(target.name, vars);
  1011 |       return pickFirstMatch(byName(page, name, target.kind), target.ordinal, timeoutMs, `${target.kind === "any" ? "" : `the ${target.kind} `}"${name}"`);
  1012 |     }
  1013 |   }
  1014 | }
  1015 | function compareValues(actual, comparison, expected) {
  1016 |   const a = actual.trim();
  1017 |   const e = expected.trim();
  1018 |   const num = (s) => parseFloat(s.replace(/[^\d.\-]/g, ""));
  1019 |   switch (comparison) {
  1020 |     case "equals":
  1021 |       return a === e || a.replace(/\s+/g, " ").toLowerCase() === e.replace(/\s+/g, " ").toLowerCase();
  1022 |     case "notEquals":
  1023 |       return !compareValues(actual, "equals", expected);
  1024 |     case "contains":
  1025 |       return a.replace(/\s+/g, " ").toLowerCase().includes(e.replace(/\s+/g, " ").toLowerCase());
  1026 |     case "notContains":
  1027 |       return !compareValues(actual, "contains", expected);
  1028 |     case "startsWith":
  1029 |       return a.toLowerCase().startsWith(e.toLowerCase());
  1030 |     case "endsWith":
```