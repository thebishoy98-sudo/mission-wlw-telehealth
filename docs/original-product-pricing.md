# Original Product Pricing

This file preserves the production product and dose prices before the June 8, 2026 QuickBooks production one-cent testing change.

During testing, customer-facing product and dose prices are set to `$0.01`. Use this file to restore real pricing after testing.

## Tirzepatide

- Product ID: `product_tirzepatide`
- Slug: `tirzepatide`
- Original starting price: `$349`

| Dose ID | Label | Strength | Original Price |
| --- | --- | --- | --- |
| `tirzepatide_20mg_8_week` | Tirzepatide 20mg | 20mg vial | `$349` |
| `tirzepatide_40mg_8_week` | Tirzepatide 40mg | 40mg vial | `$479` |
| `tirzepatide_60mg_8_week` | Tirzepatide 60mg | 60mg vial | `$749` |

## Retatrutide

- Product ID: `product_retatrutide`
- Slug: `retatrutide`
- Original starting price: `$325`

| Dose ID | Label | Strength | Original Price |
| --- | --- | --- | --- |
| `retatrutide_16mg_8_week` | Retatrutide 16mg | 16mg vial | `$325` |
| `retatrutide_32mg_8_week` | Retatrutide 32mg | 32mg vial | `$455` |
| `retatrutide_48mg_8_week` | Retatrutide 48mg | 48mg vial | `$525` |

## Semaglutide

- Product ID: `product_semaglutide`
- Slug: `semaglutide`
- Original starting price: `$299`

| Dose ID | Label | Strength | Original Price |
| --- | --- | --- | --- |
| `semaglutide_2mg_8_week` | Semaglutide 2mg | 2mg vial | `$299` |
| `semaglutide_4mg_8_week` | Semaglutide 4mg | 4mg vial | `$359` |
| `semaglutide_6mg_8_week` | Semaglutide 6mg | 6mg vial | `$419` |

## Restore Notes

- Restore only `startingPrice` and dose `price` fields from this file.
- Do not change dose IDs, labels, strengths, quantities, durations, weekly dose values, injection units, or prescription labels.
- Pharmacy and PracticeQ dose behavior depends on the dose metadata, not only the displayed price.

