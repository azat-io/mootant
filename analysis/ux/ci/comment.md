<!-- mootant-report -->
### Mootant: failed, score 20% (threshold 80%)

Changed lines since `origin/main` (merge base `aa4fad7`).

| killed | timeout | survived | no coverage | errors | covered score | time |
| --: | --: | --: | --: | --: | --: | --: |
| 1 | 0 | 3 | 1 | 0 | 25% | 4.8 s |

<details><summary><code>src/price.ts:13:19</code> Survived · comparison-operator · <code>04410gm51y2t</code></summary>

```diff
-   if (isMember && total >= 50) {
+   if (isMember && total > 50) {
```

- Extend: test/price.test.ts
- Covering test: test/price.test.ts:10 "getDiscount > gives members 5% off"
- Re-check: npx mootant run src --mutant 04410gm51y2t

</details>

<details><summary><code>src/price.ts:13:19</code> Survived · comparison-operator · <code>bjzvqjpcq0vj</code></summary>

```diff
-   if (isMember && total >= 50) {
+   if (isMember && total == 50) {
```

- Extend: test/price.test.ts
- Covering test: test/price.test.ts:10 "getDiscount > gives members 5% off"
- Re-check: npx mootant run src --mutant bjzvqjpcq0vj

</details>

<details><summary><code>src/price.ts:13:19</code> Survived · comparison-operator · <code>fpap8r6zcdbf</code></summary>

```diff
-   if (isMember && total >= 50) {
+   if (isMember && total >= 49) {
```

- Extend: test/price.test.ts
- Covering test: test/price.test.ts:10 "getDiscount > gives members 5% off"
- Re-check: npx mootant run src --mutant fpap8r6zcdbf

</details>

<details><summary><code>src/price.ts:14:12</code> NoCoverage · number-literal · <code>cez51e5bcx69</code></summary>

```diff
-     return 7
+     return 8
```

- Extend: test/price.test.ts
- Re-check: npx mootant run src --mutant cez51e5bcx69

</details>

