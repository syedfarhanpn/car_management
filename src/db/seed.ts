import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import * as s from "./schema";
import { runMigrations } from "./migrate";
import { normalizeRegistration, registrationLast4 } from "@/lib/vehicle";

/** Rupees -> paise. All money in this system is integer minor units. */
const rs = (rupees: number) => Math.round(rupees * 100);

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log("Applying migrations...");
  await runMigrations();

  const db = await getDb();

  const existing = await db.select().from(s.organizations).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded. Run `npm run db:reset` first to start clean.");
    process.exit(0);
  }

  console.log("Seeding demo data...");

  // ---------------------------------------------------------------- org
  const [org] = await db
    .insert(s.organizations)
    .values({
      name: "Prestige Auto Care",
      legalName: "Prestige Auto Care",
      gstin: "32AABCP1234M1Z5",
      phone: "+919847000000",
      email: "hello@prestigeautocare.in",
      addressLine1: "34/1861, Bypass Road",
      addressLine2: "Vyttila",
      city: "Kochi",
      state: "Kerala",
      stateCode: "32",
      pincode: "682019",
    })
    .returning();

  const [branch] = await db
    .insert(s.branches)
    .values({
      orgId: org.id,
      name: "Vyttila (Main)",
      code: "MAIN",
      phone: "+919847000000",
      city: "Kochi",
      state: "Kerala",
      isDefault: true,
    })
    .returning();

  // ---------------------------------------------------------------- users
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const [admin, manager, staff] = await db
    .insert(s.users)
    .values([
      {
        orgId: org.id,
        branchId: branch.id,
        name: "Suhail Rahman",
        email: "admin@demo.com",
        phone: "+919847000001",
        passwordHash: hash("admin123"),
        role: "ADMIN",
      },
      {
        orgId: org.id,
        branchId: branch.id,
        name: "Vinod Kumar",
        email: "manager@demo.com",
        phone: "+919847000002",
        passwordHash: hash("manager123"),
        role: "MANAGER",
      },
      {
        orgId: org.id,
        branchId: branch.id,
        name: "Ajmal P",
        email: "staff@demo.com",
        phone: "+919847000003",
        passwordHash: hash("staff123"),
        role: "STAFF",
      },
    ])
    .returning();

  // ---------------------------------------------------------------- settings
  await db.insert(s.settings).values([
    { orgId: org.id, key: "tax.enabled", value: true },
    { orgId: org.id, key: "tax.defaultRate", value: 18 },
    { orgId: org.id, key: "tax.placeOfSupply", value: "32-Kerala" },
    // Listed prices INCLUDE GST. A detailing shop advertises "Full Wash 500"
    // and the customer pays 500 - the tax is back-calculated out of it. Flip
    // this to false only if the shop quotes pre-tax and adds GST on top.
    { orgId: org.id, key: "tax.pricesIncludeTax", value: true },
    // Parts fetched for a customer are a pure-agent reimbursement: the cost
    // sits outside the taxable value, only the markup is taxed. Worth
    // confirming with the shop CA against their actual arrangement.
    { orgId: org.id, key: "tax.passThroughTreatment", value: "PURE_AGENT" },
    // Locked decision: staff cannot discount at all.
    { orgId: org.id, key: "billing.staffMaxDiscountPercent", value: 0 },
    { orgId: org.id, key: "billing.roundOffEnabled", value: true },
    { orgId: org.id, key: "inventory.autoDeductRecipes", value: true },
    { orgId: org.id, key: "inventory.lowStockAlerts", value: true },
    { orgId: org.id, key: "whatsapp.enabled", value: true },
  ]);

  // ---------------------------------------------------------------- vehicle classes
  const classRows = await db
    .insert(s.vehicleClasses)
    .values([
      { orgId: org.id, name: "Hatchback", description: "Swift, i20, Baleno", sortOrder: 1 },
      { orgId: org.id, name: "Sedan", description: "City, Verna, Ciaz", sortOrder: 2 },
      { orgId: org.id, name: "Compact SUV", description: "Creta, Seltos, Brezza", sortOrder: 3 },
      { orgId: org.id, name: "SUV", description: "Fortuner, XUV700, Safari", sortOrder: 4 },
      { orgId: org.id, name: "Luxury", description: "BMW, Mercedes, Audi", sortOrder: 5 },
    ])
    .returning();
  const [hatch, sedan, csuv, suv, lux] = classRows;

  // ---------------------------------------------------------------- service catalog
  const catRows = await db
    .insert(s.serviceCategories)
    .values([
      { orgId: org.id, name: "Washing & Cleaning", requiresEstimate: false, colorHex: "#0ea5e9", sortOrder: 1 },
      { orgId: org.id, name: "Detailing", requiresEstimate: false, colorHex: "#8b5cf6", sortOrder: 2 },
      { orgId: org.id, name: "Periodic Service", requiresEstimate: false, colorHex: "#10b981", sortOrder: 3 },
      // Repairs need a customer-approved estimate before work starts.
      { orgId: org.id, name: "Repairs", requiresEstimate: true, colorHex: "#f59e0b", sortOrder: 4 },
      { orgId: org.id, name: "Tyres & Battery", requiresEstimate: true, colorHex: "#ef4444", sortOrder: 5 },
    ])
    .returning();
  const [catWash, catDetail, catService, catRepair, catTyre] = catRows;

  /** [name, category, minutes, prices by class: hatch, sedan, compact SUV, SUV, luxury] */
  const serviceDefs: [string, typeof catWash, number, [number, number, number, number, number]][] = [
    ["Exterior Wash", catWash, 30, [300, 400, 450, 550, 700]],
    ["Full Wash (Exterior + Interior Vacuum)", catWash, 60, [500, 600, 700, 800, 1000]],
    ["Premium Foam Wash", catWash, 75, [700, 850, 1000, 1200, 1500]],
    ["Underbody Wash", catWash, 30, [400, 450, 500, 600, 800]],
    ["Engine Bay Cleaning", catWash, 45, [800, 1000, 1200, 1400, 2000]],
    ["Rubbing & Polishing", catDetail, 180, [2500, 3000, 3500, 4000, 6000]],
    ["Teflon Coating", catDetail, 240, [5000, 6000, 7000, 8000, 12000]],
    ["Ceramic Coating (9H)", catDetail, 480, [15000, 18000, 22000, 25000, 40000]],
    ["Interior Deep Cleaning", catDetail, 240, [2000, 2500, 3000, 3500, 5000]],
    ["Headlight Restoration", catDetail, 60, [1200, 1200, 1400, 1400, 2000]],
    ["Anti-Rust Underbody Coating", catDetail, 180, [3000, 3500, 4000, 4500, 6000]],
    ["Engine Oil Change (Labour)", catService, 45, [300, 350, 400, 450, 700]],
    ["General Periodic Service", catService, 180, [1500, 1800, 2000, 2500, 4000]],
    ["AC Service & Gas Refill", catService, 120, [2000, 2500, 3000, 3500, 5000]],
    ["Brake Pad Replacement (Labour)", catRepair, 90, [600, 700, 800, 900, 1500]],
    ["Wheel Alignment & Balancing", catTyre, 60, [500, 600, 700, 800, 1200]],
  ];

  const serviceIds: Record<string, string> = {};
  for (const [name, cat, minutes, prices] of serviceDefs) {
    const [svc] = await db
      .insert(s.services)
      .values({
        orgId: org.id,
        categoryId: cat.id,
        name,
        sacCode: "998714",
        gstRate: 18,
        estimatedMinutes: minutes,
        isActive: true,
      })
      .returning();
    serviceIds[name] = svc.id;

    // specificity 1 = the standard published rate per vehicle class.
    await db.insert(s.servicePrices).values(
      classRows.map((cls, i) => ({
        orgId: org.id,
        serviceId: svc.id,
        vehicleClassId: cls.id,
        specificity: 1,
        priceMinor: rs(prices[i]),
        effectiveFrom: isoDate(daysAgo(365)),
      })),
    );
  }

  // ---------------------------------------------------------------- inventory
  const itemCats = await db
    .insert(s.itemCategories)
    .values([
      { orgId: org.id, name: "Washing Chemicals", sortOrder: 1 },
      { orgId: org.id, name: "Detailing Compounds", sortOrder: 2 },
      { orgId: org.id, name: "Lubricants", sortOrder: 3 },
      { orgId: org.id, name: "Filters", sortOrder: 4 },
      { orgId: org.id, name: "Brake & Suspension", sortOrder: 5 },
      { orgId: org.id, name: "Consumable Tools", sortOrder: 6 },
    ])
    .returning();
  const [catChem, catCompound, catLube, catFilter, catBrake, catTools] = itemCats;

  /**
   * BULK consumables are stored in ml/g. avgCost is per BASE unit in paise,
   * so a 5L shampoo can at Rs.1200 = 120000 paise / 5000 ml = 24 paise per ml.
   */
  const bulkDefs: [string, typeof catChem, "ML" | "GRAM" | "PIECE", string, number, number, number][] = [
    // name, category, baseUnit, purchaseUnitName, baseUnitsPerPurchase, costPerPurchaseUnitRs, reorderLevelBase
    ["Car Shampoo", catChem, "ML", "5L Can", 5000, 1200, 5000],
    ["Snow Foam Concentrate", catChem, "ML", "5L Can", 5000, 1800, 5000],
    ["Glass Cleaner", catChem, "ML", "5L Can", 5000, 800, 2500],
    ["Degreaser", catChem, "ML", "5L Can", 5000, 900, 2500],
    ["Tyre Polish", catChem, "ML", "5L Can", 5000, 1400, 2500],
    ["Dashboard Polish", catChem, "ML", "5L Can", 5000, 1600, 2500],
    ["Carnauba Wax", catCompound, "ML", "1L Bottle", 1000, 1500, 1000],
    ["Rubbing Compound", catCompound, "GRAM", "1kg Tub", 1000, 900, 1000],
    ["Ceramic Coating 9H", catCompound, "ML", "50ml Kit", 50, 3500, 100],
    ["Engine Oil 5W-30 Synthetic", catLube, "ML", "20L Barrel", 20000, 9000, 10000],
    ["Engine Oil 10W-40 Semi-Synth", catLube, "ML", "20L Barrel", 20000, 7500, 10000],
    ["Coolant", catLube, "ML", "5L Can", 5000, 1000, 2500],
    ["Microfiber Cloth", catTools, "PIECE", "Pack of 10", 10, 600, 20],
  ];

  const itemIds: Record<string, string> = {};
  const openingStock: (typeof s.stockLedger.$inferInsert)[] = [];

  for (const [name, cat, unit, purchaseUnit, perUnit, costRs, reorder] of bulkDefs) {
    const costPerBase = Math.round(rs(costRs) / perUnit);
    const [item] = await db
      .insert(s.inventoryItems)
      .values({
        orgId: org.id,
        categoryId: cat.id,
        name,
        type: "BULK_CONSUMABLE",
        baseUnit: unit,
        purchaseUnitName: purchaseUnit,
        baseUnitsPerPurchaseUnit: perUnit,
        gstRate: 18,
        avgCostMinor: costPerBase,
        reorderLevelBase: reorder,
      })
      .returning();
    itemIds[name] = item.id;
    openingStock.push({
      orgId: org.id,
      branchId: branch.id,
      itemId: item.id,
      movementType: "OPENING",
      quantityBase: perUnit * 3, // three purchase units on hand
      unitCostMinor: costPerBase,
      referenceType: "manual",
      note: "Opening stock",
      occurredAt: daysAgo(60),
      createdBy: admin.id,
    });
  }

  /** Stocked parts: counted in pieces, picked onto a specific job card. */
  const partDefs: [string, typeof catFilter, string, number, number, number][] = [
    // name, category, sku, costRs, saleRs, reorderLevel
    ["Oil Filter - Maruti Petrol", catFilter, "OF-MZ-001", 250, 420, 10],
    ["Oil Filter - Hyundai Petrol", catFilter, "OF-HY-002", 280, 460, 10],
    ["Air Filter - Universal", catFilter, "AF-UN-010", 450, 720, 8],
    ["Cabin AC Filter", catFilter, "CF-UN-020", 500, 820, 8],
    ["Wiper Blade Set", catTools, "WB-UN-030", 700, 1150, 6],
    ["Brake Pad Set - Front", catBrake, "BP-FR-040", 1800, 2900, 4],
    ["Brake Pad Set - Rear", catBrake, "BP-RR-041", 1600, 2600, 4],
  ];

  for (const [name, cat, sku, costRs, saleRs, reorder] of partDefs) {
    const [item] = await db
      .insert(s.inventoryItems)
      .values({
        orgId: org.id,
        categoryId: cat.id,
        name,
        sku,
        type: "STOCKED_PART",
        baseUnit: "PIECE",
        purchaseUnitName: "Piece",
        baseUnitsPerPurchaseUnit: 1,
        hsnCode: "8708",
        gstRate: 28,
        avgCostMinor: rs(costRs),
        salePriceMinor: rs(saleRs),
        reorderLevelBase: reorder,
      })
      .returning();
    itemIds[name] = item.id;
    openingStock.push({
      orgId: org.id,
      branchId: branch.id,
      itemId: item.id,
      movementType: "OPENING",
      quantityBase: 12,
      unitCostMinor: rs(costRs),
      referenceType: "manual",
      note: "Opening stock",
      occurredAt: daysAgo(60),
      createdBy: admin.id,
    });
  }

  await db.insert(s.stockLedger).values(openingStock);

  // ---------------------------------------------------------------- recipes
  /**
   * What each service SHOULD consume. Deducted automatically when the job
   * closes, so staff never log shampoo by hand - and the difference against a
   * physical count becomes the variance report.
   *
   * A null vehicleClassId applies to every class; the Exterior Wash entries
   * below show per-class overrides, because an SUV genuinely uses more.
   */
  const recipes: (typeof s.serviceRecipes.$inferInsert)[] = [
    ...classRows.map((cls, i) => ({
      orgId: org.id,
      serviceId: serviceIds["Exterior Wash"],
      vehicleClassId: cls.id,
      itemId: itemIds["Car Shampoo"],
      quantityBase: [100, 120, 140, 170, 180][i],
    })),
    { orgId: org.id, serviceId: serviceIds["Exterior Wash"], itemId: itemIds["Glass Cleaner"], quantityBase: 30 },
    { orgId: org.id, serviceId: serviceIds["Exterior Wash"], itemId: itemIds["Tyre Polish"], quantityBase: 25 },
    { orgId: org.id, serviceId: serviceIds["Full Wash (Exterior + Interior Vacuum)"], itemId: itemIds["Car Shampoo"], quantityBase: 150 },
    { orgId: org.id, serviceId: serviceIds["Full Wash (Exterior + Interior Vacuum)"], itemId: itemIds["Glass Cleaner"], quantityBase: 60 },
    { orgId: org.id, serviceId: serviceIds["Full Wash (Exterior + Interior Vacuum)"], itemId: itemIds["Dashboard Polish"], quantityBase: 40 },
    { orgId: org.id, serviceId: serviceIds["Full Wash (Exterior + Interior Vacuum)"], itemId: itemIds["Tyre Polish"], quantityBase: 30 },
    { orgId: org.id, serviceId: serviceIds["Premium Foam Wash"], itemId: itemIds["Snow Foam Concentrate"], quantityBase: 200 },
    { orgId: org.id, serviceId: serviceIds["Premium Foam Wash"], itemId: itemIds["Car Shampoo"], quantityBase: 100 },
    { orgId: org.id, serviceId: serviceIds["Premium Foam Wash"], itemId: itemIds["Carnauba Wax"], quantityBase: 50 },
    { orgId: org.id, serviceId: serviceIds["Engine Bay Cleaning"], itemId: itemIds["Degreaser"], quantityBase: 250 },
    { orgId: org.id, serviceId: serviceIds["Rubbing & Polishing"], itemId: itemIds["Rubbing Compound"], quantityBase: 200 },
    { orgId: org.id, serviceId: serviceIds["Rubbing & Polishing"], itemId: itemIds["Carnauba Wax"], quantityBase: 120 },
    { orgId: org.id, serviceId: serviceIds["Rubbing & Polishing"], itemId: itemIds["Microfiber Cloth"], quantityBase: 2 },
    { orgId: org.id, serviceId: serviceIds["Ceramic Coating (9H)"], itemId: itemIds["Ceramic Coating 9H"], quantityBase: 50 },
    { orgId: org.id, serviceId: serviceIds["Interior Deep Cleaning"], itemId: itemIds["Dashboard Polish"], quantityBase: 120 },
    { orgId: org.id, serviceId: serviceIds["Interior Deep Cleaning"], itemId: itemIds["Glass Cleaner"], quantityBase: 80 },
  ];
  await db.insert(s.serviceRecipes).values(recipes);

  // ---------------------------------------------------------------- vehicle models
  const modelDefs: [string, string, typeof hatch, string, string, number][] = [
    ["Maruti Suzuki", "Swift", hatch, "PETROL", "5W-30", 3200],
    ["Maruti Suzuki", "Baleno", hatch, "PETROL", "5W-30", 3100],
    ["Hyundai", "i20", hatch, "PETROL", "5W-30", 3300],
    ["Honda", "City", sedan, "PETROL", "5W-30", 3600],
    ["Hyundai", "Verna", sedan, "PETROL", "5W-30", 3500],
    ["Hyundai", "Creta", csuv, "PETROL", "5W-30", 3800],
    ["Kia", "Seltos", csuv, "PETROL", "5W-30", 3800],
    ["Maruti Suzuki", "Brezza", csuv, "PETROL", "5W-30", 3500],
    ["Toyota", "Fortuner", suv, "DIESEL", "10W-40", 7500],
    ["Mahindra", "XUV700", suv, "DIESEL", "10W-40", 6800],
    ["BMW", "3 Series", lux, "PETROL", "5W-30", 5200],
    ["Mercedes-Benz", "C-Class", lux, "PETROL", "5W-30", 5500],
  ];

  const modelIds: Record<string, string> = {};
  for (const [make, model, cls, fuel, grade, capacity] of modelDefs) {
    const [row] = await db
      .insert(s.vehicleModels)
      .values({
        orgId: org.id,
        make,
        model,
        vehicleClassId: cls.id,
        fuelType: fuel,
        engineOilGrade: grade,
        engineOilCapacityMl: capacity,
      })
      .returning();
    modelIds[`${make} ${model}`] = row.id;
  }

  // ---------------------------------------------------------------- clients & vehicles
  const clientDefs: [string, string, string | null, "INDIVIDUAL" | "CORPORATE", number, number][] = [
    ["Rahul Menon", "+919847012345", "rahul.menon@gmail.com", "INDIVIDUAL", 0, 0],
    ["Anjali Nair", "+919895023456", null, "INDIVIDUAL", 0, 0],
    ["Thomas Varghese", "+919846034567", "tvarghese@outlook.com", "INDIVIDUAL", 0, 0],
    ["Fathima Beevi", "+919061045678", null, "INDIVIDUAL", 0, 0],
    ["Sreekumar B", "+919744056789", null, "INDIVIDUAL", 0, 0],
    // Corporate account on credit terms - this is why receivables exist.
    ["Kochi Cabs Pvt Ltd", "+919847099999", "accounts@kochicabs.in", "CORPORATE", 200000, 30],
  ];

  const clientIds: Record<string, string> = {};
  for (const [name, phone, email, type, creditRs, days] of clientDefs) {
    const [row] = await db
      .insert(s.clients)
      .values({
        orgId: org.id,
        name,
        phone,
        email,
        type,
        city: "Kochi",
        state: "Kerala",
        creditLimitMinor: rs(creditRs),
        creditDays: days,
        createdBy: staff.id,
      })
      .returning();
    clientIds[name] = row.id;
  }

  /**
   * Note KL07CH4521 and KL09AB4521 deliberately share the last four digits.
   * Searching "4521" must return BOTH and let the front desk pick - silently
   * auto-selecting the first match is how the wrong customer gets billed.
   */
  const vehicleDefs: [string, string, string, string][] = [
    // reg, owner, model key, color
    ["KL-07-CH-4521", "Rahul Menon", "Maruti Suzuki Swift", "Pearl White"],
    ["KL-09-AB-4521", "Fathima Beevi", "Honda City", "Silver"],
    ["KL-01-BM-8890", "Anjali Nair", "Hyundai Creta", "Titan Grey"],
    ["KL-11-AT-1234", "Thomas Varghese", "Toyota Fortuner", "Black"],
    ["KL-07-CD-7788", "Sreekumar B", "Hyundai i20", "Fiery Red"],
    ["KL-43-C-1001", "Kochi Cabs Pvt Ltd", "Maruti Suzuki Swift", "White"],
    ["KL-43-C-1002", "Kochi Cabs Pvt Ltd", "Hyundai Verna", "White"],
    ["KL-43-C-1003", "Kochi Cabs Pvt Ltd", "Maruti Suzuki Baleno", "White"],
    ["KL-07-BX-9012", "Rahul Menon", "BMW 3 Series", "Alpine White"],
  ];

  const vehicleIds: Record<string, string> = {};
  for (const [reg, owner, modelKey, color] of vehicleDefs) {
    const modelId = modelIds[modelKey];
    const modelRow = modelDefs.find(([mk, md]) => `${mk} ${md}` === modelKey)!;
    const [veh] = await db
      .insert(s.vehicles)
      .values({
        orgId: org.id,
        registrationNumber: reg,
        regNormalized: normalizeRegistration(reg),
        regLast4: registrationLast4(reg),
        modelId,
        vehicleClassId: modelRow[2].id,
        color,
        currentClientId: clientIds[owner],
        lastOdometerKm: 20000 + Math.floor(Math.random() * 60000),
      })
      .returning();
    vehicleIds[reg] = veh.id;

    await db.insert(s.vehicleOwnerships).values({
      orgId: org.id,
      vehicleId: veh.id,
      clientId: clientIds[owner],
      fromDate: isoDate(daysAgo(400)),
    });
  }

  // ---------------------------------------------------------------- suppliers
  const supplierRows = await db
    .insert(s.suppliers)
    .values([
      { orgId: org.id, name: "Kerala Auto Spares", phone: "+919447011111", city: "Kochi", paymentTermsDays: 15 },
      { orgId: org.id, name: "Detailing Supplies India", phone: "+919447022222", city: "Bengaluru", paymentTermsDays: 30 },
      { orgId: org.id, name: "Vyttila Lubricants", phone: "+919447033333", city: "Kochi", paymentTermsDays: 7 },
    ])
    .returning();

  // ---------------------------------------------------------------- accounts
  await db.insert(s.expenseCategories).values([
    { orgId: org.id, name: "Rent", isFixed: true },
    { orgId: org.id, name: "Salaries", isFixed: true },
    { orgId: org.id, name: "Electricity & Water", isFixed: false },
    { orgId: org.id, name: "Consumables Purchase", isFixed: false },
    { orgId: org.id, name: "Equipment & Maintenance", isFixed: false },
    { orgId: org.id, name: "Marketing", isFixed: false },
    { orgId: org.id, name: "Miscellaneous", isFixed: false },
  ]);

  // ---------------------------------------------------------------- invoice series
  // FY is April-March in India, so the series key is "25-26".
  const y = today.getFullYear();
  const fyStart = today.getMonth() >= 3 ? y : y - 1;
  const fy = `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
  await db.insert(s.invoiceSeries).values({
    orgId: org.id,
    branchId: branch.id,
    name: "Default",
    prefix: "INV",
    financialYear: fy,
    currentNumber: 0,
    padWidth: 4,
    isActive: true,
  });

  // ---------------------------------------------------------------- employees
  await db.insert(s.employees).values([
    {
      orgId: org.id, branchId: branch.id, userId: manager.id, employeeCode: "EMP-001",
      name: "Vinod Kumar", phone: "+919847000002", designation: "Service Manager",
      joiningDate: isoDate(daysAgo(900)), monthlySalaryMinor: rs(32000),
    },
    {
      orgId: org.id, branchId: branch.id, userId: staff.id, employeeCode: "EMP-002",
      name: "Ajmal P", phone: "+919847000003", designation: "Service Advisor",
      joiningDate: isoDate(daysAgo(400)), monthlySalaryMinor: rs(22000),
    },
    {
      orgId: org.id, branchId: branch.id, employeeCode: "EMP-003",
      name: "Bijoy Thomas", phone: "+919847000004", designation: "Senior Detailer",
      joiningDate: isoDate(daysAgo(600)), monthlySalaryMinor: rs(24000),
    },
    {
      orgId: org.id, branchId: branch.id, employeeCode: "EMP-004",
      name: "Shameer K", phone: "+919847000005", designation: "Washer",
      joiningDate: isoDate(daysAgo(200)), monthlySalaryMinor: rs(16000),
    },
  ]);

  // ---------------------------------------------------------------- message templates
  await db.insert(s.messageTemplates).values([
    {
      orgId: org.id, key: "JOB_READY", name: "Vehicle Ready for Pickup",
      body: "Hi {{client_name}}, your {{vehicle}} is ready for pickup at Prestige Auto Care. Total: {{amount}}. Thank you!",
      variables: ["client_name", "vehicle", "amount"],
    },
    {
      orgId: org.id, key: "INVOICE_SENT", name: "Invoice",
      body: "Hi {{client_name}}, here is your invoice {{invoice_number}} for {{vehicle}}. Amount: {{amount}}. View: {{link}}",
      variables: ["client_name", "invoice_number", "vehicle", "amount", "link"],
    },
    {
      orgId: org.id, key: "ESTIMATE_APPROVAL", name: "Estimate Approval",
      body: "Hi {{client_name}}, estimate for {{vehicle}} is {{amount}}. Reply YES to approve and we will begin work.",
      variables: ["client_name", "vehicle", "amount"],
    },
    {
      orgId: org.id, key: "SERVICE_DUE", name: "Service Due Reminder",
      body: "Hi {{client_name}}, your {{vehicle}} is due for {{service}}. Last done {{last_date}}. Book a slot: {{link}}",
      variables: ["client_name", "vehicle", "service", "last_date", "link"],
    },
    {
      orgId: org.id, key: "PAYMENT_REMINDER", name: "Payment Reminder",
      body: "Hi {{client_name}}, a balance of {{amount}} is pending against invoice {{invoice_number}}. Kindly settle at your convenience.",
      variables: ["client_name", "amount", "invoice_number"],
    },
  ]);

  // ---------------------------------------------------------------- demo transactions
  // Enough real movement that the dashboard, stock ledger and receivables all
  // show meaningful numbers in a client demo.
  const classIndex = (clsId: string | null) => classRows.findIndex((c) => c.id === clsId);
  const priceOf = (svcName: string, clsId: string | null) =>
    rs(serviceDefs.find(([n]) => n === svcName)![3][Math.max(0, classIndex(clsId))]);

  const allVehicles = await db.select().from(s.vehicles).where(eq(s.vehicles.orgId, org.id));
  const vehicleByReg = new Map(allVehicles.map((v) => [v.registrationNumber, v]));
  const allRecipes = await db.select().from(s.serviceRecipes).where(eq(s.serviceRecipes.orgId, org.id));

  type JobSpec = {
    reg: string;
    services: string[];
    parts?: [string, number][];
    passThrough?: { desc: string; cost: number; markup: number; supplier: string };
    status: (typeof s.jobCards.status.enumValues)[number];
    daysBack: number;
    paid?: "FULL" | "PARTIAL" | "NONE";
  };

  const jobSpecs: JobSpec[] = [
    { reg: "KL-07-CH-4521", services: ["Full Wash (Exterior + Interior Vacuum)"], status: "DELIVERED", daysBack: 12, paid: "FULL" },
    { reg: "KL-01-BM-8890", services: ["Premium Foam Wash", "Interior Deep Cleaning"], status: "DELIVERED", daysBack: 9, paid: "FULL" },
    {
      reg: "KL-11-AT-1234",
      services: ["General Periodic Service", "Engine Oil Change (Labour)"],
      parts: [["Oil Filter - Hyundai Petrol", 1], ["Air Filter - Universal", 1]],
      // The signature case: a part bought from outside for this customer.
      // Cost is the shop's money fronted; only the markup is revenue.
      passThrough: { desc: "Fortuner OEM Radiator Assembly", cost: 24500, markup: 2500, supplier: "Toyota Spares Kochi" },
      status: "INVOICED",
      daysBack: 4,
      paid: "PARTIAL",
    },
    { reg: "KL-09-AB-4521", services: ["Rubbing & Polishing"], status: "DELIVERED", daysBack: 6, paid: "FULL" },
    { reg: "KL-43-C-1001", services: ["Exterior Wash"], status: "INVOICED", daysBack: 3, paid: "NONE" },
    { reg: "KL-43-C-1002", services: ["Exterior Wash", "Underbody Wash"], status: "INVOICED", daysBack: 2, paid: "NONE" },
    { reg: "KL-07-BX-9012", services: ["Ceramic Coating (9H)"], status: "IN_PROGRESS", daysBack: 1 },
    { reg: "KL-07-CD-7788", services: ["Full Wash (Exterior + Interior Vacuum)"], status: "COMPLETED", daysBack: 0 },
    { reg: "KL-43-C-1003", services: ["Exterior Wash"], status: "IN_PROGRESS", daysBack: 0 },
  ];

  let jobSeq = 0;
  let invSeq = 0;
  const consumption: (typeof s.stockLedger.$inferInsert)[] = [];

  for (const spec of jobSpecs) {
    const veh = vehicleByReg.get(spec.reg)!;
    const when = daysAgo(spec.daysBack);
    jobSeq += 1;

    const isSettled = ["INVOICED", "DELIVERED"].includes(spec.status);
    const isClosed = isSettled || spec.status === "COMPLETED";

    const [job] = await db
      .insert(s.jobCards)
      .values({
        orgId: org.id,
        branchId: branch.id,
        jobNumber: `JC/${fy}/${String(jobSeq).padStart(4, "0")}`,
        kind: "JOB",
        status: spec.status,
        clientId: veh.currentClientId!,
        vehicleId: veh.id,
        vehicleClassId: veh.vehicleClassId,
        odometerKm: veh.lastOdometerKm,
        fuelLevel: ["1/4", "1/2", "3/4", "Full"][jobSeq % 4],
        customerComplaint: spec.passThrough ? "Coolant leak, overheating in traffic" : null,
        assignedToId: staff.id,
        createdBy: staff.id,
        createdAt: when,
        startedAt: when,
        completedAt: isClosed ? when : null,
        deliveredAt: spec.status === "DELIVERED" ? when : null,
        stockPostedAt: isClosed ? when : null,
      })
      .returning();

    const lines: (typeof s.jobCardLines.$inferInsert)[] = [];
    let sort = 0;
    let subtotal = 0;
    let reimbursable = 0;

    for (const svcName of spec.services) {
      const price = priceOf(svcName, veh.vehicleClassId);
      subtotal += price;
      lines.push({
        orgId: org.id, jobCardId: job.id, lineType: "SERVICE", sortOrder: sort++,
        serviceId: serviceIds[svcName], description: svcName,
        quantity: 1, unitPriceMinor: price, lineTotalMinor: price,
        technicianId: staff.id, affectsInventory: true, affectsRevenue: true,
      });

      // Deduct the consumable recipe, exactly as closing a job will do live.
      if (isClosed) {
        const applicable = allRecipes.filter(
          (r) => r.serviceId === serviceIds[svcName] && (r.vehicleClassId === null || r.vehicleClassId === veh.vehicleClassId),
        );
        for (const r of applicable) {
          consumption.push({
            orgId: org.id, branchId: branch.id, itemId: r.itemId,
            movementType: "CONSUMPTION",
            quantityBase: -Number(r.quantityBase),
            referenceType: "job_card", referenceId: job.id,
            note: `${svcName} — ${spec.reg}`,
            occurredAt: when, createdBy: staff.id,
          });
        }
      }
    }

    for (const [partName, qtyPcs] of spec.parts ?? []) {
      const [item] = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, itemIds[partName]));
      const total = Number(item.salePriceMinor) * qtyPcs;
      subtotal += total;
      lines.push({
        orgId: org.id, jobCardId: job.id, lineType: "PART", sortOrder: sort++,
        itemId: item.id, description: partName,
        quantity: qtyPcs, unitPriceMinor: Number(item.salePriceMinor), lineTotalMinor: total,
        costMinor: Number(item.avgCostMinor) * qtyPcs,
        technicianId: staff.id, affectsInventory: true, affectsRevenue: true,
      });
      if (isClosed) {
        consumption.push({
          orgId: org.id, branchId: branch.id, itemId: item.id,
          movementType: "CONSUMPTION", quantityBase: -qtyPcs,
          unitCostMinor: Number(item.avgCostMinor),
          referenceType: "job_card", referenceId: job.id,
          note: `${partName} — ${spec.reg}`, occurredAt: when, createdBy: staff.id,
        });
      }
    }

    if (spec.passThrough) {
      const cost = rs(spec.passThrough.cost);
      const markup = rs(spec.passThrough.markup);
      reimbursable += cost;
      subtotal += markup; // ONLY the markup is revenue
      lines.push({
        orgId: org.id, jobCardId: job.id, lineType: "PASS_THROUGH", sortOrder: sort++,
        description: spec.passThrough.desc,
        quantity: 1, unitPriceMinor: cost + markup, lineTotalMinor: cost + markup,
        costMinor: cost, markupMinor: markup,
        supplierName: spec.passThrough.supplier, supplierBillRef: "TSK/4471",
        affectsInventory: false, affectsRevenue: false,
        technicianId: staff.id,
      });

      // Recorded as a purchase so the fronted cash is traceable to who owes it.
      await db.insert(s.purchases).values({
        orgId: org.id, branchId: branch.id,
        supplierNameText: spec.passThrough.supplier,
        billNumber: "TSK/4471", billDate: isoDate(when),
        status: "RECEIVED", paymentStatus: "PAID",
        isPassThrough: true, jobCardId: job.id, forClientId: veh.currentClientId,
        subtotalMinor: cost, totalMinor: cost, paidMinor: cost,
        notes: "Bought on customer behalf — does not affect stock or revenue",
        receivedAt: when, createdBy: manager.id,
      });
    }

    await db.insert(s.jobCardLines).values(lines);

    const total = subtotal + reimbursable;
    await db.update(s.jobCards)
      .set({ subtotalMinor: subtotal, reimbursableMinor: reimbursable, totalMinor: total })
      .where(eq(s.jobCards.id, job.id));

    await db.insert(s.jobCardStatusHistory).values({
      jobCardId: job.id, toStatus: spec.status, changedById: staff.id, createdAt: when,
    });

    // ---- invoice + payment
    if (isSettled) {
      invSeq += 1;
      const client = clientDefs.find(([n]) => clientIds[n] === veh.currentClientId)!;
      const paid = spec.paid === "FULL" ? total : spec.paid === "PARTIAL" ? Math.round(total * 0.4) : 0;
      const balance = total - paid;

      // Listed prices include 18% GST, so back-calculate the taxable value.
      // Reimbursed parts sit outside it under the pure-agent treatment.
      const taxableValue = Math.round((subtotal * 100) / 118);
      const gstTotal = subtotal - taxableValue;
      const sgst = Math.floor(gstTotal / 2);
      const cgst = gstTotal - sgst;

      const [inv] = await db.insert(s.invoices).values({
        orgId: org.id, branchId: branch.id,
        invoiceNumber: `INV/${fy}/${String(invSeq).padStart(4, "0")}`,
        status: balance === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
        jobCardId: job.id, clientId: veh.currentClientId!, vehicleId: veh.id,
        invoiceDate: isoDate(when),
        dueDate: isoDate(new Date(when.getTime() + (client[5] || 0) * 86400000)),
        billToName: client[0], billToPhone: client[1],
        billToAddress: "Kochi, Kerala", placeOfSupply: "32-Kerala",
        subtotalMinor: taxableValue, taxableMinor: taxableValue,
        cgstMinor: cgst, sgstMinor: sgst,
        reimbursableMinor: reimbursable, totalMinor: total,
        paidMinor: paid, balanceMinor: balance,
        isTaxInvoice: true,
        issuedAt: when, createdBy: staff.id, createdAt: when,
      }).returning();

      await db.insert(s.invoiceLines).values(
        lines.map((l, i) => ({
          invoiceId: inv.id, sortOrder: i, description: l.description!,
          quantity: Number(l.quantity ?? 1),
          unitPriceMinor: Number(l.unitPriceMinor ?? 0),
          taxableMinor: Number(l.lineTotalMinor ?? 0),
          lineTotalMinor: Number(l.lineTotalMinor ?? 0),
          isReimbursable: l.lineType === "PASS_THROUGH",
        })),
      );

      if (paid > 0) {
        const [pay] = await db.insert(s.payments).values({
          orgId: org.id, branchId: branch.id, clientId: veh.currentClientId!,
          receiptNumber: `RCP/${fy}/${String(invSeq).padStart(4, "0")}`,
          amountMinor: paid,
          method: (["CASH", "UPI", "CARD", "UPI"] as const)[invSeq % 4],
          receivedAt: when, receivedById: staff.id, createdAt: when,
        }).returning();
        await db.insert(s.paymentAllocations).values({
          paymentId: pay.id, invoiceId: inv.id, amountMinor: paid,
        });
      }

      await db.update(s.invoiceSeries)
        .set({ currentNumber: invSeq })
        .where(eq(s.invoiceSeries.orgId, org.id));
    }
  }

  if (consumption.length) await db.insert(s.stockLedger).values(consumption);

  // A restock purchase, so the ledger shows both directions.
  const [restock] = await db.insert(s.purchases).values({
    orgId: org.id, branchId: branch.id, supplierId: supplierRows[1].id,
    billNumber: "DSI/2291", billDate: isoDate(daysAgo(8)),
    status: "RECEIVED", paymentStatus: "PAID",
    subtotalMinor: rs(4200), totalMinor: rs(4200), paidMinor: rs(4200),
    receivedAt: daysAgo(8), createdBy: manager.id,
  }).returning();
  await db.insert(s.purchaseLines).values([
    { purchaseId: restock.id, itemId: itemIds["Car Shampoo"], description: "Car Shampoo 5L Can", quantity: 2, unitCostMinor: rs(1200), lineTotalMinor: rs(2400) },
    { purchaseId: restock.id, itemId: itemIds["Tyre Polish"], description: "Tyre Polish 5L Can", quantity: 1, unitCostMinor: rs(1400), lineTotalMinor: rs(1400) },
  ]);
  await db.insert(s.stockLedger).values([
    { orgId: org.id, branchId: branch.id, itemId: itemIds["Car Shampoo"], movementType: "PURCHASE", quantityBase: 10000, unitCostMinor: 24, referenceType: "purchase", referenceId: restock.id, occurredAt: daysAgo(8), createdBy: manager.id },
    { orgId: org.id, branchId: branch.id, itemId: itemIds["Tyre Polish"], movementType: "PURCHASE", quantityBase: 5000, unitCostMinor: 28, referenceType: "purchase", referenceId: restock.id, occurredAt: daysAgo(8), createdBy: manager.id },
  ]);

  // Running expenses so the accounts module has something to show.
  const expCats = await db.select().from(s.expenseCategories).where(eq(s.expenseCategories.orgId, org.id));
  const findCat = (n: string) => expCats.find((c) => c.name === n)!.id;
  await db.insert(s.expenses).values([
    { orgId: org.id, branchId: branch.id, categoryId: findCat("Rent"), description: "Workshop rent", amountMinor: rs(45000), expenseDate: isoDate(daysAgo(9)), method: "BANK_TRANSFER", createdBy: admin.id },
    { orgId: org.id, branchId: branch.id, categoryId: findCat("Electricity & Water"), description: "KSEB bill", amountMinor: rs(8400), expenseDate: isoDate(daysAgo(7)), method: "UPI", createdBy: admin.id },
    { orgId: org.id, branchId: branch.id, categoryId: findCat("Salaries"), description: "Staff salaries", amountMinor: rs(94000), expenseDate: isoDate(daysAgo(9)), method: "BANK_TRANSFER", createdBy: admin.id },
    { orgId: org.id, branchId: branch.id, categoryId: findCat("Consumables Purchase"), description: "Detailing supplies restock", amountMinor: rs(4200), expenseDate: isoDate(daysAgo(8)), method: "UPI", createdBy: manager.id },
    { orgId: org.id, branchId: branch.id, categoryId: findCat("Marketing"), description: "Instagram promotion", amountMinor: rs(3000), expenseDate: isoDate(daysAgo(5)), method: "CARD", createdBy: admin.id },
  ]);

  console.log(`
Seed complete.

  Organisation : ${org.name}
  Branch       : ${branch.name}

  Login credentials
  -----------------
  Admin    admin@demo.com    / admin123     (full access, costs, margins, discounts)
  Manager  manager@demo.com  / manager123   (operations, no org settings)
  Staff    staff@demo.com    / staff123     (job cards + billing at list price only)

  Try searching "4521" on the job card screen - two different customers share
  those last four digits, which is exactly the case that must not auto-select.
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
