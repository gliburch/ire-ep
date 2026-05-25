require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const { sanitizeTitle } = require("../services/scraperService");

function getSourceTitle(doc, fallbackPaths = []) {
  for (const path of fallbackPaths) {
    const value = path.split(".").reduce((current, key) => current?.[key], doc);
    if (value) {
      return value;
    }
  }
  return "";
}

function buildUpdatedEpData(doc, sourceTitle) {
  if (!doc?.epData || !sourceTitle) {
    return null;
  }

  const nextTitle = sanitizeTitle(sourceTitle);
  if (doc.epData.title === nextTitle) {
    return null;
  }

  return {
    ...doc.epData,
    title: nextTitle,
  };
}

async function backfillCollection(Model, fallbackPaths) {
  const docs = await Model.find({ epData: { $exists: true } }).lean();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    scanned += 1;

    try {
      const sourceTitle = getSourceTitle(doc, fallbackPaths);
      const nextEpData = buildUpdatedEpData(doc, sourceTitle);

      if (!nextEpData) {
        skipped += 1;
        continue;
      }

      await Model.updateOne(
        { _id: doc._id },
        { $set: { epData: nextEpData } },
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to backfill ${Model.modelName} ${doc._id}:`, error.message);
    }
  }

  return { scanned, updated, skipped, failed };
}

async function main() {
  await connectDB();

  const productResult = await backfillCollection(Product, [
    "rawData.productName",
    "epData.title",
  ]);
  const productMasterResult = await backfillCollection(ProductMaster, [
    "rawData.masterProductName",
    "epData.title",
  ]);

  console.log(
    JSON.stringify(
      {
        product: productResult,
        productMaster: productMasterResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
