/**
 * Test requests for the procurement extractor (extractProcurementRequest).
 *
 * Each scenario says what a careful human would read out of the text: how many line items,
 * a word that must appear in each item's name, each item's quantity, and the required-by date
 * (null = the text gives no date, so none should be invented).
 *
 * Add a scenario every time the extractor gets a real request wrong.
 */

export interface ExpectedItem {
  /** Letters and digits that must appear in the extracted item name (case, spaces and dashes ignored). */
  nameContains: string;
  quantity: number;
}

export interface ProcurementExtractionScenario {
  name: string;
  text: string;
  expected: {
    items: ExpectedItem[];
    /** YYYY-MM-DD, or null when the text has no date. */
    requiredBy: string | null;
  };
}

/** Local date N days from today as YYYY-MM-DD (the extractor is told today's date). */
function isoDatePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const procurementExtractionScenarios: ProcurementExtractionScenario[] = [
  {
    name: "single-item-explicit-date",
    text: "We need 50 units of SanDisk Ultra 64GB microSD card for the hardware team by 2026-12-15.",
    expected: { items: [{ nameContains: "sandisk", quantity: 50 }], requiredBy: "2026-12-15" },
  },
  {
    name: "shared-quantity-two-items",
    text: "We need 50 units of Raspberry Pi 5 and Raspberry Pi Pico by 2026-12-20.",
    expected: {
      items: [
        { nameContains: "pi5", quantity: 50 },
        { nameContains: "pico", quantity: 50 },
      ],
      requiredBy: "2026-12-20",
    },
  },
  {
    name: "separate-quantities",
    text: "Order 50 Raspberry Pi 5 and 10 Arduino Uno R3 by 2026-12-20.",
    expected: {
      items: [
        { nameContains: "pi5", quantity: 50 },
        { nameContains: "arduino", quantity: 10 },
      ],
      requiredBy: "2026-12-20",
    },
  },
  {
    name: "no-date-given",
    text: "Need 200 pcs of 10k ohm 0603 resistors.",
    expected: { items: [{ nameContains: "0603", quantity: 200 }], requiredBy: null },
  },
  {
    name: "relative-date-in-days",
    text: "We need 25 STM32F103C8T6 microcontrollers in 10 days.",
    expected: { items: [{ nameContains: "stm32f103c8t6", quantity: 25 }], requiredBy: isoDatePlus(10) },
  },
  {
    name: "quantity-in-words-dozen",
    text: "Please get me a dozen ESP32-WROOM-32 modules by 2026-12-05.",
    expected: { items: [{ nameContains: "esp32", quantity: 12 }], requiredBy: "2026-12-05" },
  },
  {
    name: "thousands-separator",
    text: "Quote for 1,000 units of M3 stainless steel screws by 2026-12-30.",
    expected: { items: [{ nameContains: "screw", quantity: 1000 }], requiredBy: "2026-12-30" },
  },
  {
    name: "specs-in-the-sentence",
    text: "100 units of 12V 2A power supply with barrel jack, UL certified, needed by 2026-12-10.",
    expected: { items: [{ nameContains: "powersupply", quantity: 100 }], requiredBy: "2026-12-10" },
  },
  {
    name: "pasted-bom-three-rows",
    text: "Item, Qty\nESP32-WROOM-32, 40\nBME280 sensor, 40\nUSB-C connector, 100",
    expected: {
      items: [
        { nameContains: "esp32", quantity: 40 },
        { nameContains: "bme280", quantity: 40 },
        { nameContains: "usbc", quantity: 100 },
      ],
      requiredBy: null,
    },
  },
  {
    name: "date-written-in-words",
    text: "We need 30 units of Arduino Nano by 15 December 2026.",
    expected: { items: [{ nameContains: "nano", quantity: 30 }], requiredBy: "2026-12-15" },
  },
];