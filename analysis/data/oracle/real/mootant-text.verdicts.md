| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `g28m965r` | core/text/blank-outside.ts:6 | `/[^\n\r\u{2028}\u{2029}]+/gu` → `/[^]+/gu` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `667fv0tr` | core/text/blank-outside.ts:22 | `source.codePointAt(0) === 0xfe_ff` → `source.codePointAt(0) <= 0xfe_ff` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `kpm4fvxw` | core/text/blank-outside.ts:22 | `source.codePointAt(0) === 0xfe_ff` → `source.codePointAt(0) >= 0xfe_ff` | Survived | Survived [batch-survivor] | survived |
| `0fvfha6n` | core/text/blank-outside.ts:22 | `source.codePointAt(0) === 0xfe_ff` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `q6w5k9jm` | core/text/blank-outside.ts:22 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wqpag49q` | core/text/blank-outside.ts:22 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `1a8c0byj` | core/text/blank-outside.ts:22 | `''` → `'mootant'` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `6nx8q86c` | core/text/blank-outside.ts:25 | `blank(source.slice(cursor, start)) + ...` → `blank(source.slice(cursor, start))` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `e9q8ywsn` | core/text/blank-outside.ts:25 | `source.slice(cursor, start)` → `source` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `gkqjwmc8` | core/text/blank-outside.ts:25 | `source.slice(start, end)` → `source` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `paj77mvm` | core/text/blank-outside.ts:26 | `cursor = end` → `;` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `dyqvdqv5` | core/text/blank-outside.ts:28 | `text + blank(source.slice(cursor))` → `text` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `8rcftssw` | core/text/blank-outside.ts:28 | `source.slice(cursor)` → `source` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ksfx9qdp` | core/text/blank-outside.ts:38 | `' '` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `8vm1xs47` | core/text/create-source-code.ts:33 | `{⏎    getAncestors(node: Node): Node[...` → `{⏎    getAncestors(node: Node): Node[...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `13yvrs3n` | core/text/create-source-code.ts:33 | `{⏎    getAncestors(node: Node): Node[...` → `{⏎    getAncestors(node: Node): Node[...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `s3bepzem` | core/text/create-source-code.ts:33 | `{⏎    getAncestors(node: Node): Node[...` → `{⏎    getAncestors(node: Node): Node[...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `vjt4e873` | core/text/create-source-code.ts:33 | `{⏎    getAncestors(node: Node): Node[...` → `{⏎    getAncestors(node: Node): Node[...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `20ek3qra` | core/text/create-source-code.ts:33 | `{⏎    getAncestors(node: Node): Node[...` → `{⏎    getAncestors(node: Node): Node[...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `y5hd5r7x` | core/text/create-source-code.ts:35 | `[]` → `[undefined]` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `k4sp6ayt` | core/text/create-source-code.ts:37 | `parent` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `sn750rac` | core/text/create-source-code.ts:38 | `ancestors.push(parent)⏎        ;` → `;` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `shks4vcg` | core/text/create-source-code.ts:41 | `ancestors.toReversed()` → `ancestors` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `hnsjsceh` | core/text/create-source-code.ts:44 | `replaceOperator(parsed, node, operator)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `74ay8987` | core/text/create-source-code.ts:45 | `removeListElement(parsed, node, index)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `jf6bqa2j` | core/text/create-source-code.ts:46 | `findTokenStart(parsed, start, end)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0vwvy5my` | core/text/create-source-code.ts:47 | `scopes.bindings.get(identifier) ?? null` → `null` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5b7m4pyv` | core/text/create-source-code.ts:48 | `getSourcePosition(lineStarts, offset)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `devhx3mz` | core/text/create-source-code.ts:49 | `getOperatorRange(parsed, node)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `hdp7vx24` | core/text/create-source-code.ts:50 | `editText(parsed, node, edits)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `v82hz24f` | core/text/create-source-code.ts:51 | `text.slice(node.start, node.end)` → `text` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `rge5ej2a` | core/text/create-source-code.ts:52 | `getSlot(tree, node).parent` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `sne88ga7` | core/text/create-source-code.ts:53 | `getSlot(tree, node)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `bgcx2bx6` | core/text/edit-text.ts:27 | `''` → `'mootant'` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `671z6ad9` | core/text/edit-text.ts:29 | `edits.toSorted((left, right) => left....` → `edits` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `k436tyab` | core/text/edit-text.ts:29 | `left.start - right.start` → `left.start + right.start` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `8qgmkt72` | core/text/edit-text.ts:31 | `edit.start < cursor \|\| edit.start >...` → `edit.start < cursor \|\| edit.start >...` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `j9b112eb` | core/text/edit-text.ts:31 | `edit.start < cursor \|\| edit.start >...` → `edit.start > edit.end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `mjr1ws2e` | core/text/edit-text.ts:31 | `edit.start < cursor \|\| edit.start >...` → `edit.start < cursor` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `eeqh7mjz` | core/text/edit-text.ts:31 | `edit.start < cursor` → `edit.start <= cursor` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xfzp1abr` | core/text/edit-text.ts:31 | `edit.start < cursor` → `edit.start != cursor` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `s0m2geek` | core/text/edit-text.ts:31 | `edit.start > edit.end` → `edit.start >= edit.end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cf215dx0` | core/text/edit-text.ts:31 | `edit.start > edit.end` → `edit.start != edit.end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `v51ta55m` | core/text/edit-text.ts:31 | `edit.end > node.end` → `edit.end >= node.end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0zxspy52` | core/text/edit-text.ts:31 | `edit.end > node.end` → `edit.end != node.end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xdwd9sh6` | core/text/edit-text.ts:37 | `text.slice(cursor, edit.start)` → `text` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `1ftqavyz` | core/text/edit-text.ts:38 | `text.slice(edit.end, node.end)` → `text` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wzp3apz7` | core/text/edit-text.ts:40 | `needsSeparator(result, inserted \|\| ...` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `9v10x7mq` | core/text/edit-text.ts:40 | `needsSeparator(result, inserted \|\| ...` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wpgd050t` | core/text/edit-text.ts:40 | `inserted \|\| following` → `following` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `djkvgt38` | core/text/edit-text.ts:40 | `inserted \|\| following` → `inserted` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5dj4njb8` | core/text/edit-text.ts:41 | `` ${inserted}`` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `v3xp0xap` | core/text/edit-text.ts:43 | `needsSeparator(inserted, following)` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `7ypgmqma` | core/text/edit-text.ts:43 | `needsSeparator(inserted, following)` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xzj6twxv` | core/text/edit-text.ts:44 | ``${inserted} `` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0vnjmxxg` | core/text/edit-text.ts:46 | `result += inserted` → `;` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xjw5m9et` | core/text/edit-text.ts:47 | `cursor = edit.end` → `;` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `jsfd6qsp` | core/text/edit-text.ts:49 | `result + text.slice(cursor, node.end)` → `result` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ksct5557` | core/text/edit-text.ts:49 | `text.slice(cursor, node.end)` → `text` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `2gh7ks9d` | core/text/find-last-start.ts:16 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xv3tbepz` | core/text/find-last-start.ts:17 | `items.length - 1` → `items.length + 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0v36cp8x` | core/text/find-last-start.ts:17 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `q17b4x3v` | core/text/find-last-start.ts:18 | `low < high` → `low <= high` | Timeout (hit-limit) | Timeout (hit-limit) [batch] | timeout |
| `wb1k24jn` | core/text/find-last-start.ts:18 | `low < high` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `c80xm7m2` | core/text/find-last-start.ts:19 | `(low + high) / 2` → `(low + high) * 2` | Timeout (hit-limit) | Timeout (hit-limit) [batch] | timeout |
| `9ztm553t` | core/text/find-last-start.ts:19 | `low + high` → `low - high` | Killed (assertion) | Killed (assertion) [batch] | timeout |
| `nfjnnqws` | core/text/find-last-start.ts:19 | `2` → `3` | Timeout (hit-limit) | Timeout (hit-limit) [batch] | timeout |
| `mc3xyte6` | core/text/find-last-start.ts:20 | `getStart(items[middle]!) <= offset` → `getStart(items[middle]!) < offset` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xsn3ed18` | core/text/find-last-start.ts:20 | `getStart(items[middle]!) <= offset` → `getStart(items[middle]!) == offset` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cagg70pf` | core/text/find-last-start.ts:20 | `getStart(items[middle]!) <= offset` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wv8ayk23` | core/text/find-last-start.ts:23 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `427yeaqe` | core/text/find-token-start.ts:7 | `/[\s()]/u` → `/[^]/u` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `r7tvmmbt` | core/text/find-token-start.ts:27 | `offset < end` → `offset <= end` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `edtgx0k2` | core/text/find-token-start.ts:27 | `offset < end` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `dm2vcpvr` | core/text/find-token-start.ts:29 | `commentEnd !== undefined` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `19fxvpch` | core/text/find-token-start.ts:29 | `commentEnd !== undefined` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `f5kvbdb1` | core/text/find-token-start.ts:31 | `SKIPPED_CHARACTER_PATTERN.test(parsed...` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `akysr7qf` | core/text/find-token-start.ts:31 | `SKIPPED_CHARACTER_PATTERN.test(parsed...` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cgszvtzp` | core/text/find-token-start.ts:32 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `hg8jffq4` | core/text/find-token-start.ts:37 | `-1` → `0` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `bbgtfmh6` | core/text/find-token-start.ts:37 | `-1` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0sg7c02p` | core/text/get-line-starts.ts:4 | `/\r\n?\|[\n\u{2028}\u{2029}]/gu` → `/[\n\u{2028}\u{2029}]/gu` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `x9venbjv` | core/text/get-line-starts.ts:4 | `/\r\n?\|[\n\u{2028}\u{2029}]/gu` → `/\r\n\|[\n\u{2028}\u{2029}]/gu` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `vhaj6r1x` | core/text/get-line-starts.ts:4 | `/\r\n?\|[\n\u{2028}\u{2029}]/gu` → `/\r\n?/gu` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `epqnrptg` | core/text/get-line-starts.ts:4 | `/\r\n?\|[\n\u{2028}\u{2029}]/gu` → `/\r\n?\|[^]/gu` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `ycq4npj0` | core/text/get-line-starts.ts:14 | `text.codePointAt(0) === 0xfe_ff` → `text.codePointAt(0) <= 0xfe_ff` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `p4d564kf` | core/text/get-line-starts.ts:14 | `text.codePointAt(0) === 0xfe_ff` → `text.codePointAt(0) >= 0xfe_ff` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `d1zpphp0` | core/text/get-line-starts.ts:14 | `text.codePointAt(0) === 0xfe_ff` → `false` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `wv5g5m0t` | core/text/get-line-starts.ts:14 | `0` → `1` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `rqsvptxj` | core/text/get-line-starts.ts:14 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `6d399skk` | core/text/get-line-starts.ts:16 | `match.index + match[0].length` → `match.index - match[0].length` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `xt6en521` | core/text/get-line-starts.ts:16 | `0` → `1` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `wfj8prgd` | core/text/get-operator-range.ts:22 | `node.type === 'UnaryExpression'` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5q931pps` | core/text/get-operator-range.ts:22 | `node.type === 'UnaryExpression'` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xr3ywgp2` | core/text/get-operator-range.ts:23 | `{ end: node.start + node.operator.len...` → `{ end: node.start + node.operator.len...` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `1jvwgjtt` | core/text/get-operator-range.ts:23 | `node.start + node.operator.length` → `node.start - node.operator.length` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `dnyafga8` | core/text/get-operator-range.ts:25 | `node.type === 'UpdateExpression'` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `4a4e78mw` | core/text/get-operator-range.ts:25 | `node.type === 'UpdateExpression'` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `a1jdj9bt` | core/text/get-operator-range.ts:26 | `node.prefix` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `zbtyrect` | core/text/get-operator-range.ts:26 | `node.prefix` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5d718488` | core/text/get-operator-range.ts:27 | `{ end: node.start + 2, start: node.st...` → `{ end: node.start + 2 }` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `2ccx30eb` | core/text/get-operator-range.ts:27 | `node.start + 2` → `node.start - 2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5pxr99a2` | core/text/get-operator-range.ts:27 | `2` → `3` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `a3mzqp2s` | core/text/get-operator-range.ts:28 | `{ start: node.end - 2, end: node.end }` → `{ start: node.end - 2 }` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `qv9avgdv` | core/text/get-operator-range.ts:28 | `node.end - 2` → `node.end + 2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `c77g9rd0` | core/text/get-operator-range.ts:28 | `2` → `3` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `vp1tpcst` | core/text/get-operator-range.ts:32 | `start === -1 \|\| !parsed.text.starts...` → `!parsed.text.startsWith(node.operator...` | Survived | Survived [batch-survivor] | survived |
| `drsgtscb` | core/text/get-operator-range.ts:32 | `start === -1 \|\| !parsed.text.starts...` → `start === -1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `4q7vbedt` | core/text/get-operator-range.ts:32 | `start === -1` → `start <= -1` | Survived | Survived [batch-survivor] | survived |
| `m73vyn32` | core/text/get-operator-range.ts:32 | `start === -1` → `start >= -1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cz24gbdv` | core/text/get-operator-range.ts:32 | `-1` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `fdpv7c6d` | core/text/get-operator-range.ts:32 | `parsed.text.startsWith(node.operator,...` → `parsed.text.endsWith(node.operator, s...` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `082sqbk2` | core/text/get-operator-range.ts:37 | `{ end: start + node.operator.length, ...` → `{ end: start + node.operator.length }` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `1yeesgxb` | core/text/get-operator-range.ts:37 | `start + node.operator.length` → `start - node.operator.length` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `x0226mve` | core/text/get-source-position.ts:18 | `start` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `adn6rkx7` | core/text/get-source-position.ts:20 | `Math.max(offset - lineStarts[index]!,...` → `Math.max(offset - lineStarts[index]!,...` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `2d1yds5j` | core/text/get-source-position.ts:20 | `Math.max(offset - lineStarts[index]!, 0)` → `Math.min(offset - lineStarts[index]!, 0)` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `zgerym5k` | core/text/get-source-position.ts:20 | `offset - lineStarts[index]!` → `offset + lineStarts[index]!` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `9hdz2d57` | core/text/get-source-position.ts:20 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `h3jd249y` | core/text/get-source-position.ts:20 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ngkt180j` | core/text/get-source-position.ts:21 | `index + 1` → `index - 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `rfw4xg83` | core/text/get-source-position.ts:21 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `j3pat62g` | core/text/pluralize.ts:9 | ``${count} ${noun}${count === 1 ? '' :...` → ``${count}${noun}${count === 1 ? '' : ...` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `psfnt99d` | core/text/pluralize.ts:9 | `count === 1` → `count <= 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `tn09m5bd` | core/text/pluralize.ts:9 | `count === 1` → `count >= 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `0h546dds` | core/text/pluralize.ts:9 | `count === 1` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `rfpxrrdw` | core/text/pluralize.ts:9 | `''` → `'mootant'` | Killed (assertion) | Killed (assertion) [batch] | killed |
