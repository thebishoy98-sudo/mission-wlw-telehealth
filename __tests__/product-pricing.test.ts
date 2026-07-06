import { canonicalProducts } from "@/data/products";

describe("production product pricing", () => {
  it("restores visible product and dose prices for go-live", () => {
    expect(canonicalProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "tirzepatide",
          startingPrice: 349,
          doses: expect.arrayContaining([
            expect.objectContaining({ id: "tirzepatide_20mg_8_week", price: 349 }),
            expect.objectContaining({ id: "tirzepatide_40mg_8_week", price: 479 }),
            expect.objectContaining({ id: "tirzepatide_60mg_8_week", price: 749 }),
          ]),
        }),
        expect.objectContaining({
          slug: "retatrutide",
          startingPrice: 455,
          doses: expect.arrayContaining([
            expect.objectContaining({ id: "retatrutide_16mg_8_week", price: 455 }),
            expect.objectContaining({ id: "retatrutide_32mg_8_week", price: 655 }),
            expect.objectContaining({ id: "retatrutide_48mg_8_week", price: 855 }),
          ]),
        }),
        expect.objectContaining({
          slug: "bpc-157",
          startingPrice: 249,
          doses: expect.arrayContaining([
            expect.objectContaining({ id: "bpc_157_500mcg_2_week", price: 249 }),
          ]),
        }),
        expect.objectContaining({
          slug: "mot-c",
          startingPrice: 280,
          doses: expect.arrayContaining([
            expect.objectContaining({ id: "mot_c_50mg_25_day", price: 280 }),
          ]),
        }),
        expect.objectContaining({
          slug: "semaglutide",
          startingPrice: 299,
          doses: expect.arrayContaining([
            expect.objectContaining({ id: "semaglutide_2mg_8_week", price: 299 }),
            expect.objectContaining({ id: "semaglutide_4mg_8_week", price: 359 }),
            expect.objectContaining({ id: "semaglutide_6mg_8_week", price: 419 }),
          ]),
        }),
      ])
    );
  });
});

