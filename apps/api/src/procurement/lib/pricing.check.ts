import assert from "node:assert/strict";
import { priceQuote } from "./pricing.js";

const rates = new Map([["USD", 1], ["INR", 96]]);
const base = { taxRate: null, taxInclusive: false, currency: "USD" };

// Axme: $2 x 50 + $11 shipping, no tax -> $111 -> 10,656 INR
let p = priceQuote({ ...base, unitPrice: 2, shippingCost: 11 }, 50, rates);
assert.equal(p.local.total, 111);
assert.equal(p.converted.total, 10656);

// 18% tax added on top: goods $31.50 + tax $5.67 + ship $5 = $42.17 -> 4,048.32 INR
p = priceQuote({ ...base, unitPrice: 10.5, shippingCost: 5, taxRate: 18 }, 3, rates);
assert.equal(p.local.taxAmount, 5.67);
assert.equal(p.local.total, 42.17);
assert.equal(p.converted.total, 4048.32);

// Price already includes tax: total is just $31.50 + $5 shipping = $36.50 -> 3,504 INR
p = priceQuote({ ...base, unitPrice: 10.5, shippingCost: 5, taxRate: 18, taxInclusive: true }, 3, rates);
assert.equal(p.local.total, 36.5);
assert.equal(p.converted.total, 3504);
assert.equal(p.local.taxAmount, 4.81); // tax contained in the price is still shown

// INR supplier, INR buyer: no conversion
p = priceQuote({ ...base, currency: "INR", unitPrice: 100, shippingCost: 0 }, 2, rates);
assert.equal(p.converted.total, 200);
assert.equal(p.fxRate, 1);

// Currency with no rate must throw, never guess
assert.throws(() => priceQuote({ ...base, currency: "EUR", unitPrice: 1, shippingCost: 0 }, 1, rates), /No exchange rate/);

console.log("pricing checks passed");