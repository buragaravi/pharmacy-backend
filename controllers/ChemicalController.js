const asyncHandler = require('express-async-handler');
const ChemicalMaster = require('../models/ChemicalMaster');
const ChemicalLive = require('../models/ChemicalLive');
const Transaction = require('../models/Transaction');
const { default: mongoose } = require('mongoose');

// Constants
const LAB_IDS = ['LAB01', 'LAB02', 'LAB03', 'LAB04', 'LAB05', 'LAB06', 'LAB07', 'LAB08'];

// Helper: generate batch ID manually
function generateBatchId() {
  const date = new Date();
  const ymd = `${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `BATCH-${ymd}-${random}`;
}

// Helper: get latest batch ID from DB
async function getLastUsedBatchId() {
  const latest = await ChemicalMaster.findOne({ batchId: { $exists: true } })
    .sort({ createdAt: -1 })
    .select('batchId');
  return latest?.batchId || null;
}

// Main controller
exports.addChemicalsToCentral = asyncHandler(async (req, res) => {
  const { chemicals, usePreviousBatchId } = req.body;

  if (!Array.isArray(chemicals) || chemicals.length === 0) {
    return res.status(400).json({ message: 'No chemicals provided' });
  }

  let batchId;
  if (usePreviousBatchId) {
    batchId = await getLastUsedBatchId();
  } else {
    batchId = generateBatchId();
  }

  const savedChemicals = [];

  for (const chem of chemicals) {
    let { chemicalName, quantity, unit, expiryDate, vendor, pricePerUnit, department } = chem;
    expiryDate = new Date(expiryDate);

    // 1. Check for existing chemical with same name, vendor AND unit
    const existingChems = await ChemicalMaster.find({
      chemicalName: new RegExp(`^${chemicalName}( - [A-Z])?$`, 'i'),
      vendor,
      unit
    });

    // 2. If no matching chemical exists
    if (existingChems.length === 0) {
      const masterEntry = await createNewChemical(
        chemicalName, quantity, unit, expiryDate, 
        batchId, vendor, pricePerUnit, department, req.userId
      );
      savedChemicals.push(masterEntry);
      continue;
    }

    // 3. Check for exact match (name+vendor+unit+expiry)
    const exactMatch = existingChems.find(c => 
      c.expiryDate.getTime() === expiryDate.getTime()
    );

    if (exactMatch) {
      // Update quantities
      exactMatch.quantity += Number(quantity);
      await exactMatch.save();

      const live = await ChemicalLive.findOne({
        chemicalMasterId: exactMatch._id,
        labId: 'central-lab'
      });
      if (live) {
        live.quantity += Number(quantity);
        live.originalQuantity += Number(quantity);
        await live.save();
      }

      await createTransaction(
        exactMatch.chemicalName, 'entry', exactMatch._id,
        'central-lab', 'central-lab', quantity, unit, req.userId
      );

      savedChemicals.push(exactMatch);
    } else {
      // Handle expiry date conflicts
      const newExpiry = expiryDate.getTime();
      const existingWithEarlierExpiry = existingChems.find(c => 
        c.expiryDate.getTime() < newExpiry
      );

      if (existingWithEarlierExpiry) {
        // Existing has earlier expiry - it keeps name, new gets suffix
        const suffix = await getNextSuffix(chemicalName);
        const suffixedName = `${chemicalName} - ${suffix}`;
        
        const masterEntry = await createNewChemical(
          suffixedName, quantity, unit, expiryDate,
          batchId, vendor, pricePerUnit, department, req.userId
        );
        savedChemicals.push(masterEntry);
      } else {
        // New has earlier expiry - rename existing, keep new as base
        const suffix = await getNextSuffix(chemicalName);
        
        // Rename all existing
        for (const chem of existingChems) {
          const newName = `${chemicalName} - ${suffix}`;
          chem.chemicalName = newName;
          await chem.save();
          
          const live = await ChemicalLive.findOne({
            chemicalMasterId: chem._id,
            labId: 'central-lab'
          });
          if (live) {
            live.chemicalName = newName;
            await live.save();
          }
        }

        // Create new with base name
        const masterEntry = await createNewChemical(
          chemicalName, quantity, unit, expiryDate,
          batchId, vendor, pricePerUnit, department, req.userId
        );
        savedChemicals.push(masterEntry);
      }
    }
  }

  res.status(201).json({
    message: 'Chemicals added/updated successfully',
    batchId,
    chemicals: savedChemicals
  });
});

// Helper: Create new chemical (master + live)
async function createNewChemical(name, qty, unit, expiry, batchId, vendor, price, dept, userId) {
  const masterEntry = await ChemicalMaster.create({
    chemicalName: name,
    quantity: qty,
    unit,
    expiryDate: expiry,
    batchId,
    vendor,
    pricePerUnit: price,
    department: dept
  });

  await ChemicalLive.create({
    chemicalMasterId: masterEntry._id,
    chemicalName: masterEntry.chemicalName,
    displayName: name.split(' - ')[0], // Store clean name without suffix
    unit,
    expiryDate: expiry,
    labId: 'central-lab',
    quantity: qty,
    originalQuantity: qty,
    isAllocated: false
  });

  await createTransaction(
    masterEntry.chemicalName,
    'entry',
    masterEntry._id,
    'central-lab',
    'central-lab',
    qty,
    unit,
    userId
  );

  return masterEntry;
}

async function getNextSuffix(baseName) {
  const existing = await ChemicalMaster.find({
    chemicalName: new RegExp(`^${baseName} - [A-Z]$`, 'i')
  });
  
  const usedSuffixes = existing.map(c => {
    const parts = c.chemicalName.split(' - ');
    return parts[1]?.charAt(0);
  }).filter(Boolean);

  if (usedSuffixes.length === 0) return 'A';
  const lastChar = usedSuffixes.sort().pop().toUpperCase();
  return String.fromCharCode(lastChar.charCodeAt(0) + 1);
}

async function createTransaction(name, type, chemId, fromLab, toLab, qty, unit, userId) {
  return Transaction.create({
    chemicalName: name,
    transactionType: type,
    chemicalLiveId: chemId,
    fromLabId: fromLab,
    toLabId: toLab,
    quantity: qty,
    unit,
    createdBy: userId,
    timestamp: new Date()
  });
}

// Allocate chemicals to lab (with FIFO enforcement and transaction safety)
exports.allocateChemicalsToLab = asyncHandler(async (req, res) => {
  const { labId, allocations } = req.body;

  // Input validation
  if (!labId || !Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({ message: 'labId and allocations required' });
  }

  // Validate lab ID
  if (!LAB_IDS.includes(labId) && labId !== 'central-lab') {
    return res.status(400).json({ message: 'Invalid lab ID' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];
    let hasError = false;

    for (const alloc of allocations) {
      const { chemicalName, quantity } = alloc;
      
      if (!chemicalName || typeof quantity !== 'number' || quantity <= 0) {
        results.push({ 
          chemicalName, 
          status: 'failed', 
          reason: 'Invalid chemical name or quantity' 
        });
        hasError = true;
        continue;
      }

      // Find central stock with locking for ACID compliance
      const centralStock = await ChemicalLive.findOneAndUpdate(
        {
          displayName: chemicalName,
          labId: 'central-lab',
          quantity: { $gte: quantity }
        },
        { $inc: { quantity: -quantity } },
        { 
          session,
          new: true,
          sort: { expiryDate: 1 }
        }
      );

      if (!centralStock) {
        results.push({ 
          chemicalName, 
          status: 'failed', 
          reason: 'Insufficient stock or not found' 
        });
        hasError = true;
        continue;
      }

      try {
        // Add/update lab stock with session
        const labStock = await ChemicalLive.findOneAndUpdate(
          {
            chemicalMasterId: centralStock.chemicalMasterId,
            labId
          },
          {
            $inc: { quantity: quantity },
            $setOnInsert: {
              chemicalName: centralStock.chemicalName,
              displayName: centralStock.displayName,
              unit: centralStock.unit,
              expiryDate: centralStock.expiryDate,
              originalQuantity: quantity,
              isAllocated: true
            }
          },
          {
            session,
            new: true,
            upsert: true
          }
        );

        // Create transaction record with session
        await Transaction.create([{
          chemicalName: centralStock.chemicalName,
          transactionType: 'allocation',
          chemicalLiveId: labStock._id,
          fromLabId: 'central-lab',
          toLabId: labId,
          quantity,
          unit: centralStock.unit,
          createdBy: req.userId,
          timestamp: new Date()
        }], { session });

        results.push({
          chemicalName,
          status: 'success',
          allocatedQuantity: quantity,
          expiryDate: centralStock.expiryDate
        });
      } catch (error) {
        console.error('Error in allocation:', error);
        results.push({
          chemicalName,
          status: 'failed',
          reason: 'Database operation failed'
        });
        hasError = true;
      }
    }

    if (hasError) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Some allocations failed',
        results 
      });
    }

    await session.commitTransaction();
    res.status(200).json({ 
      message: 'All allocations completed successfully', 
      results 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Allocation error:', error);
    res.status(500).json({ 
      message: 'Allocation process failed',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

// Get all central lab master chemicals
exports.getCentralMasterChemicals = asyncHandler(async (req, res) => {
  const chemicals = await ChemicalMaster.find().sort({ createdAt: -1 });
  res.status(200).json(chemicals);
});

// Get live stock of central lab (frontend sees displayName)
exports.getCentralLiveStock = asyncHandler(async (req, res) => {
  const stock = await ChemicalLive.find({ labId: 'central-lab' })
    .select('displayName quantity unit expiryDate chemicalMasterId')
    .populate('chemicalMasterId', 'batchId vendor');
  res.status(200).json(stock);
});

// Get live stock by lab (frontend sees displayName)
exports.getLiveStockByLab = asyncHandler(async (req, res) => {
  const { labId } = req.params;
  const stock = await ChemicalLive.find({ labId })
    .select('displayName quantity unit expiryDate chemicalMasterId originalQuantity')
    .populate('chemicalMasterId', 'batchId vendor');
  res.status(200).json(stock);
});

// Get master chemicals of a specific lab
exports.getLabMasterChemicals = asyncHandler(async (req, res) => {
  const { labId } = req.params;
  const labLiveChemicals = await ChemicalLive.find({ labId })
    .populate('chemicalMasterId');
  const masterChemicals = labLiveChemicals.map(item => item.chemicalMasterId);
  res.status(200).json(masterChemicals);
});

// Get all transactions
exports.getAllTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find()
    .populate('chemicalLiveId')
    .sort({ timestamp: -1 });
  res.status(200).json(transactions);
});

// Get chemical distribution across labs
exports.getChemicalDistribution = asyncHandler(async (req, res) => {
    try {
        // First get all master chemicals with their price info
        const masterChemicals = await ChemicalMaster.find({})
            .select('chemicalName pricePerUnit')
            .lean();
        
        // Create a price lookup map
        const priceMap = masterChemicals.reduce((acc, chem) => {
            acc[chem.chemicalName] = chem.pricePerUnit || 0;
            return acc;
        }, {});

        // Get distribution with additional metrics
        const distribution = await ChemicalLive.aggregate([
            {
                $group: {
                    _id: "$labId",
                    totalChemicals: { $sum: 1 },
                    totalQuantity: { $sum: "$quantity" },
                    chemicals: {
                        $push: {
                            name: "$displayName",
                            quantity: "$quantity",
                            unit: "$unit",
                            expiryDate: "$expiryDate"
                        }
                    },
                    expiringCount: {
                        $sum: {
                            $cond: [
                                { 
                                    $lte: [
                                        { $subtract: ["$expiryDate", new Date()] },
                                        1000 * 60 * 60 * 24 * 30 // 30 days in milliseconds
                                    ] 
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    labId: "$_id",
                    totalChemicals: 1,
                    totalQuantity: 1,
                    chemicals: 1,
                    expiringCount: 1,
                    _id: 0
                }
            }
        ]);

        // Normalize lab IDs and ensure all labs are represented
        const validLabIds = ['central-lab', ...LAB_IDS];
        const completeDistribution = validLabIds.map(labId => {
            const labData = distribution.find(d => d.labId === labId) || {
                labId,
                totalChemicals: 0,
                totalQuantity: 0,
                chemicals: [],
                expiringCount: 0
            };

            // Add empty arrays if undefined
            if (!labData.chemicals) {
                labData.chemicals = [];
            }

            // Ensure all chemicals have valid values
            labData.chemicals = labData.chemicals.map(chem => ({
                ...chem,
                quantity: Number(chem.quantity) || 0,
                value: (Number(chem.quantity) || 0) * (priceMap[chem.name] || 0)
            }));

            // Recalculate totals to ensure accuracy
            labData.totalChemicals = labData.chemicals.length;
            labData.totalQuantity = labData.chemicals.reduce((sum, chem) => sum + (Number(chem.quantity) || 0), 0);
            labData.totalValue = labData.chemicals.reduce((sum, chem) => sum + (chem.value || 0), 0);

            return labData;
        });

        res.status(200).json(completeDistribution);
    } catch (error) {
        console.error('Error in chemical distribution:', error);
        res.status(500).json({ 
            message: 'Failed to fetch chemical distribution',
            error: error.message 
        });
    }
});

// Get simplified live chemicals for allocation form
exports.getCentralLiveSimplified = asyncHandler(async (req, res) => {
  try {
    const stock = await ChemicalLive.find({ labId: 'central-lab' })
      .select('displayName quantity unit expiryDate chemicalMasterId ')
      .populate('chemicalMasterId', 'pricePerUnit'); // Get only pricePerUnit from master

    const simplified = stock.map(item => ({
      chemicalMasterId: item.chemicalMasterId,
      chemicalName: item.displayName, // Frontend sees clean name
      quantity: item.quantity,
      unit: item.unit,
      expiryDate: item.expiryDate,
      pricePerUnit: item.chemicalMasterId.pricePerUnit || null

    }));

    res.status(200).json(simplified);
  } catch (error) {
    console.error('Error fetching simplified stock:', error);
    res.status(500).json({ message: 'Failed to fetch stock data' });
  }
});